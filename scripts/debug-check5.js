const players = require("C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew\\data\\manual\\players.json");
for (const name of ["기뉴다", "허유진", "김상수", "이제동", "정소윤"]) {
  const hit = players.filter((p) => p.name === name);
  console.log(name, "->", hit.length ? JSON.stringify(hit.map((h) => ({ race: h.race, tier: h.tier, userId: h.userId }))) : "players.json에 없음");
}
