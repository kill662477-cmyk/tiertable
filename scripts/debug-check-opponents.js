// 특정 선수가 실제로 붙은 상대 목록(우리 시드/여성 티어보드 인원 vs 그 외)을 분석.
const fs = require("fs");
const path = require("path");
const { buildSeedIndex } = require("./lib/seed");

const players = require(path.join(__dirname, "..", "data", "players.json"));
const MATCHES_PATH = path.join(__dirname, "..", "data", "matches.json");

const TARGETS = process.argv.slice(2);

function main() {
  const { matches } = JSON.parse(fs.readFileSync(MATCHES_PATH, "utf8"));
  const seedIndex = buildSeedIndex();
  const currentRosterNames = new Set(players.map((p) => String(p.name || "").trim()));

  for (const target of TARGETS) {
    const opp = new Map(); // name -> count
    let total = 0;
    for (const m of matches) {
      let oppName = null;
      if (m.winnerName === target) oppName = m.loserName;
      else if (m.loserName === target) oppName = m.winnerName;
      if (!oppName) continue;
      total += 1;
      opp.set(oppName, (opp.get(oppName) || 0) + 1);
    }
    const sorted = [...opp.entries()].sort((a, b) => b[1] - a[1]);
    const inSeed = sorted.filter(([n]) => seedIndex.has(n));
    const inRosterOnly = sorted.filter(([n]) => !seedIndex.has(n) && currentRosterNames.has(n));
    const unknown = sorted.filter(([n]) => !seedIndex.has(n) && !currentRosterNames.has(n));

    console.log(`\n=== ${target} 총 ${total}경기, 상대 ${sorted.length}명 ===`);
    console.log(`  2024.04 시드 인원과 대전: ${inSeed.reduce((s, [, c]) => s + c, 0)}경기 (${inSeed.length}명)`);
    console.log(`  현재 로스터(신규포함) 대전: ${inRosterOnly.reduce((s, [, c]) => s + c, 0)}경기 (${inRosterOnly.length}명)`);
    console.log(`  로스터에도 없는 대전: ${unknown.reduce((s, [, c]) => s + c, 0)}경기 (${unknown.length}명)`);
    console.log(`  상대 TOP 10:`, sorted.slice(0, 10).map(([n, c]) => `${n}(${c})`).join(", "));
  }
}

main();
