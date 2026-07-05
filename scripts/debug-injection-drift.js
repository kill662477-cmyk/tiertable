// 시드 인원 중 "실제 경기로는 거의 안 움직였는데 표시 티어가 원티어보다 높게 나온" 케이스 탐지.
const { buildSeedIndex } = require("./lib/seed");
const r = require("../data/mmr-result.json");
const seedIdx = buildSeedIndex();
const rank = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, Y: 9 };

const all = [...r.active, ...(r.hidden || [])];
const seeded = all.filter((p) => p.note && p.note.includes("시드"));
console.log(`시드 인원 ${seeded.length}명 중 표시티어가 원티어보다 높은(상승) 케이스:\n`);
let count = 0;
for (const p of seeded) {
  const s = seedIdx.get(p.name);
  if (!s) continue;
  const diff = rank[s.tier] - rank[p.tier]; // 양수 = 상승(원티어 숫자 큼 -> 표시티어 숫자 작음)
  if (diff > 0) {
    count++;
    console.log(`  ${p.name.padEnd(8)} 원=${s.tier} 표시=${p.tier} 승률=${((p.wins / (p.wins + p.losses)) * 100).toFixed(0)}% 판수=${p.countedMatches}`);
  }
}
console.log(`\n총 ${count}명 상승`);
