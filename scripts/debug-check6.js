const r = require("../data/mmr-result.json");
const players = require("C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew\\data\\manual\\players.json");
const adminByName = new Map();
for (const p of players) {
  const t = String(p.tier || "").trim();
  const m = t.match(/^(\d)티어$/);
  const norm = m ? m[1] : t === "베이비티어" ? "Y" : null;
  if (norm) adminByName.set(String(p.name || "").trim(), norm);
}
for (const nm of ["다린", "히엉", "지두두", "보혜", "슬돌이", "박듀듀", "햇살"]) {
  const p = r.active.find((x) => x.name === nm) || (r.hidden || []).find((x) => x.name === nm);
  if (p) console.log(nm.padEnd(5), p.tier + "티어 (관리자:" + adminByName.get(nm) + ")", "MMR", p.mmr.toFixed(0));
}
