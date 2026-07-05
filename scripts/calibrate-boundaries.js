// 계산된 MMR(상대 순서)을 관리자 티어표(정답지)에 회귀로 캘리브레이션.
// mmr ≈ A - G * (관리자티어랭크) 선형회귀 → 최적 경계선(A, G) 도출 후
// 그 경계선으로 다시 티어를 매겨 일치도(계단차 분포)를 평가한다.
const path = require("path");
const players = require("C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew\\data\\manual\\players.json");
const r = require(path.join(__dirname, "..", "data", "mmr-result.json"));

function normalizeCurrentTier(tierStr) {
  const t = String(tierStr || "").trim();
  const m = t.match(/^(\d)티어$/);
  if (m) return m[1];
  if (t === "베이비티어") return "Y";
  return null;
}
const RANK = { "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, Y: 9 };

const byName = new Map();
for (const p of players) {
  const norm = normalizeCurrentTier(p.tier);
  if (norm) byName.set(String(p.name || "").trim(), norm);
}

const pairs = []; // {rank, mmr}
// 휴면(hidden)은 "표시만 숨김"이지 레이팅 데이터는 유효 — 회귀 표본에 포함
const rated = [...r.active, ...(r.hidden || [])];
for (const p of rated) {
  const cur = byName.get(p.name);
  if (cur == null) continue;
  pairs.push({ name: p.name, rank: RANK[cur], mmr: p.mmr });
}

// 선형회귀 mmr = A - G*rank
const n = pairs.length;
const sumR = pairs.reduce((s, x) => s + x.rank, 0);
const sumM = pairs.reduce((s, x) => s + x.mmr, 0);
const sumRR = pairs.reduce((s, x) => s + x.rank * x.rank, 0);
const sumRM = pairs.reduce((s, x) => s + x.rank * x.mmr, 0);
const slope = (n * sumRM - sumR * sumM) / (n * sumRR - sumR * sumR); // 음수 기대
const intercept = (sumM - slope * sumR) / n;
const G = -slope;
const A = intercept;
console.log(`회귀 결과: mmr ≈ ${A.toFixed(0)} - ${G.toFixed(1)} × 티어랭크  (표본 ${n}명)`);

// 상관계수(피어슨, rank vs mmr)
const meanR = sumR / n, meanM = sumM / n;
let cov = 0, varR = 0, varM = 0;
for (const x of pairs) {
  cov += (x.rank - meanR) * (x.mmr - meanM);
  varR += (x.rank - meanR) ** 2;
  varM += (x.mmr - meanM) ** 2;
}
const corr = cov / Math.sqrt(varR * varM);
console.log(`상관계수: ${corr.toFixed(3)} (−1에 가까울수록 순서 정확)`);

// 회귀 기반 경계선: 티어 t(랭크 k)의 하한 = A - G*(k + 0.5)
// (우리 체계는 0티어 없음 — 관리자 0티어는 1티어에 흡수: 랭크 0,1 -> "1")
function tierFromMmr(mmr) {
  for (let k = 1; k <= 8; k++) {
    const lower = A - G * (k + 0.5);
    if (mmr >= lower) return String(k);
  }
  return "Y";
}

const diffCounts = {};
let within1 = 0;
for (const x of pairs) {
  const t = tierFromMmr(x.mmr);
  const compRank = RANK[t];
  const adminRank = Math.max(1, x.rank); // 0티어는 1티어로 흡수해 비교
  const diff = compRank - adminRank;
  diffCounts[diff] = (diffCounts[diff] || 0) + 1;
  if (Math.abs(diff) <= 1) within1 += 1;
}
console.log("캘리브레이션 후 계단차 분포:", diffCounts);
console.log(`±1계단 이내: ${within1}/${n} (${((within1 / n) * 100).toFixed(0)}%)`);
console.log(`\n경계선(하한): ${[1,2,3,4,5,6,7,8].map(k=>`${k}티어=${(A-G*(k+0.5)).toFixed(0)}`).join(", ")}`);

// 캘리브레이션 결과를 저장 — calc-mmr.js가 다음 실행부터 이 경계선을 사용
if (process.argv.includes("--save")) {
  const fs = require("fs");
  const outPath = path.join(__dirname, "..", "data", "calibration.json");
  fs.writeFileSync(outPath, JSON.stringify({ A, G, fittedAt: new Date().toISOString(), sample: n, corr }, null, 2));
  console.log(`저장: ${outPath}`);
}
