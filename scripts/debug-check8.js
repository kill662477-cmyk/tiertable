const r = require("../data/mmr-result.json");
const players = require("C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew\\data\\manual\\players.json");
const adminByName = new Map();
for (const p of players) adminByName.set(String(p.name || "").trim(), p.tier);
for (const nm of ["서윤", "연애인", "햇살", "다나짱", "우힝이", "히엉", "다린"]) {
  const p = r.active.find((x) => x.name === nm) || (r.hidden || []).find((x) => x.name === nm);
  if (p) console.log(nm.padEnd(5), "표시=" + p.tier + "티어", " 관리자현재=" + adminByName.get(nm), " MMR", p.mmr.toFixed(0), p.wins + "승" + p.losses + "패");
}
