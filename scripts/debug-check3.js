const fs = require("fs");
const players = require("C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew\\data\\manual\\players.json");

const dayeCandidates = players.filter((p) => String(p.name || "").includes("다예"));
console.log("players.json 중 '다예' 포함:", JSON.stringify(dayeCandidates.map((p) => ({ name: p.name, userId: p.userId, race: p.race, tier: p.tier })), null, 2));

for (const p of dayeCandidates) {
  const file = `data/raw-records/${p.userId}_${p.race}.json`;
  if (!fs.existsSync(file)) { console.log(p.name, p.userId, "-> 파일 없음"); continue; }
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  const dates = rows.map((r) => r.date).sort();
  const names = new Set(rows.map((r) => r.playerName));
  console.log(p.name, p.userId, "-> 파일 있음. 행수:", rows.length, "최초날짜:", dates[0], "최근날짜:", dates[dates.length - 1]);
  console.log("  이 파일 안에서 본인 이름으로 등장한 값들:", [...names]);
}
