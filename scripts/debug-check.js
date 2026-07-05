const fs = require("fs");
const players = require("C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew\\data\\manual\\players.json");
const names = ["연다람지", "나도현", "다예.", "클템"];
for (const name of names) {
  const p = players.find((x) => x.name === name);
  if (!p) { console.log(name, "-> players.json에 없음"); continue; }
  const file = `data/raw-records/${p.userId}_${p.race}.json`;
  console.log(name, "-> userId:", p.userId, "race:", p.race, "file exists:", fs.existsSync(file));
}
