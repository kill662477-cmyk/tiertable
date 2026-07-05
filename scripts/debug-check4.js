const fs = require("fs");
const players = require("C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew\\data\\manual\\players.json");
const name = process.argv[2];
const p = players.find((x) => x.name === name);
if (!p) { console.log(name, "players.json에 없음"); process.exit(0); }
console.log(p);
const file = `data/raw-records/${p.userId}_${p.race}.json`;
if (fs.existsSync(file)) {
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  const dates = rows.map((r) => r.date).sort();
  console.log("파일 있음. 행수:", rows.length, "최초:", dates[0], "최근:", dates[dates.length - 1]);
} else {
  console.log("파일 없음");
}
