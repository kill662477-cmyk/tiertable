// players.json의 "현재 관리자 티어"(0~8+베이비) vs 우리 계산 결과(mmr-result.json)를
// 전수 비교해서 계단차 분포를 본다. 개별 사례가 아니라 전체 경향(체계적 편향인지) 확인용.
const path = require("path");
const players = require("C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew\\data\\manual\\players.json");
const r = require(path.join(__dirname, "..", "data", "mmr-result.json"));

function normalizeCurrentTier(tierStr) {
  const t = String(tierStr || "").trim();
  const m = t.match(/^(\d)티어$/);
  if (m) return m[1];
  if (t === "베이비티어") return "Y";
  if (t === "0티어") return "0";
  return null; // 잭/조커/갓/스페이드/킹/티어없음 등 — 비교 대상 아님
}

const RANK = { "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, Y: 9 };

const byName = new Map();
for (const p of players) {
  const norm = normalizeCurrentTier(p.tier);
  if (norm) byName.set(String(p.name || "").trim(), { tier: norm, race: p.race });
}

const computedByName = new Map();
for (const p of r.active) computedByName.set(p.name, p);

const diffCounts = {};
const rows = [];
let matched = 0;
for (const [name, cur] of byName.entries()) {
  const comp = computedByName.get(name);
  if (!comp) continue;
  matched += 1;
  const curRank = RANK[cur.tier];
  const compRank = RANK[comp.tier] ?? RANK["Y"];
  const diff = compRank - curRank; // 양수=우리계산이 더 낮은 티어(하락), 음수=더 높은 티어(상승)
  diffCounts[diff] = (diffCounts[diff] || 0) + 1;
  rows.push({ name, currentTier: cur.tier, computedTier: comp.tier, diff, mmr: comp.mmr, wins: comp.wins, losses: comp.losses });
}

console.log(`매칭됨: ${matched}명 (players.json 현재티어 보유 ${byName.size}명 중, 우리계산 결과 있는 사람만)`);
console.log("계단차 분포(양수=우리계산이 더 낮음):", diffCounts);

const avgDiff = rows.reduce((s, x) => s + x.diff, 0) / rows.length;
console.log(`평균 계단차: ${avgDiff.toFixed(2)} (0에 가까울수록 전체적 편향 없음)`);

rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
console.log("\n가장 크게 벗어난 20명:");
rows.slice(0, 20).forEach((x) => {
  const wr = x.wins + x.losses > 0 ? ((x.wins / (x.wins + x.losses)) * 100).toFixed(0) + "%" : "-";
  console.log(`  ${x.name.padEnd(8)} 현재=${x.currentTier.padStart(2)} 계산=${String(x.computedTier).padStart(2)} 차이=${String(x.diff).padStart(3)}  MMR=${x.mmr.toFixed(0)} (${x.wins}승${x.losses}패 ${wr})`);
});
