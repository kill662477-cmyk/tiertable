// 시드 명단(2024.04) 선수명 <-> monstarznew data/manual/players.json 매핑 상태 점검.
// 실제 계산 전에 이름 불일치를 미리 잡아내기 위한 진단 스크립트.

const path = require("path");
const { buildSeedIndex } = require("./lib/seed");

const MONSTARZNEW_ROOT = "C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew";
const players = require(path.join(MONSTARZNEW_ROOT, "data", "manual", "players.json"));

function main() {
  const seedIndex = buildSeedIndex();
  const byName = new Map();
  for (const p of players) {
    const name = String(p.name || "").trim();
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(p);
  }

  const matched = [];
  const unmatched = [];

  for (const [name, seed] of seedIndex.entries()) {
    const candidates = byName.get(name) || [];
    if (candidates.length === 0) {
      unmatched.push({ name, seed, reason: "이름 없음" });
      continue;
    }
    const raceMatch = candidates.find((c) => c.race === seed.race);
    if (!raceMatch) {
      unmatched.push({
        name,
        seed,
        reason: `이름은 있으나 종족 불일치 (시드=${seed.race}, players.json=${candidates.map((c) => c.race).join(",")})`,
      });
      continue;
    }
    matched.push({ name, seed, player: raceMatch });
  }

  console.log(`시드 명단 총원: ${seedIndex.size}`);
  console.log(`매칭 성공: ${matched.length}`);
  console.log(`매칭 실패: ${unmatched.length}`);

  if (unmatched.length) {
    console.log("\n--- 매칭 실패 목록 ---");
    for (const u of unmatched) {
      console.log(`[${u.seed.tier}티어/${u.seed.race}] ${u.name} — ${u.reason}`);
    }
  }
}

main();
