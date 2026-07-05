const fs = require('fs');
const path = require('path');
const players = require('../../MONSTARZNEW_PROJECT_REPOS_20260617-104902/monstarznew/data/manual/players.json');
const EXCLUDED_EVENT_TIERS = new Set(["잭티어", "조커티어", "갓티어", "스페이드티어", "킹티어"]);

const nameRaceToUid = new Map();
const excludedUserIds = new Set();
for (const p of players) {
  const name = String(p.name || "").trim();
  if (!name || !p.userId) continue;
  const k = `${name}:${p.race}`;
  if (!nameRaceToUid.has(k)) nameRaceToUid.set(k, p.userId);
  if (EXCLUDED_EVENT_TIERS.has(p.tier)) excludedUserIds.add(p.userId);
}

function isExcludedKey(key) {
  if (!key) return false;
  return key.startsWith("uid:") && excludedUserIds.has(key.slice(4));
}

function resolveKey(userId, name, race) {
  if (userId) return `uid:${userId}`;
  const known = nameRaceToUid.get(`${name}:${race}`);
  if (known) return `uid:${known}`;
  return `nm:${name}:${race}`;
}

const sijoRows = JSON.parse(fs.readFileSync('data/raw-records/superbsw123_P.json', 'utf8'));

for (const anchor of sijoRows) {
  if (anchor.date < "2026-06-20") continue;
  
  let winnerKey = resolveKey(anchor.winnerUserId || anchor.winnerSoopUserId, anchor.winnerName, anchor.winnerRace);
  let loserKey = resolveKey(anchor.loserUserId || anchor.loserSoopUserId, anchor.loseName, anchor.loseRace);
  
  if (!winnerKey.startsWith("uid:") && anchor.winnerPlayer) {
    winnerKey = resolveKey(anchor.playerUserId, anchor.winnerPlayer, anchor.winnerRace);
  }
  
  console.log(`Match ${anchor.date} | ${anchor.memo}`);
  console.log(` - Winner: ${anchor.winnerName} (${winnerKey}) -> Excluded? ${isExcludedKey(winnerKey)}`);
  console.log(` - Loser: ${anchor.loseName} (${loserKey}) -> Excluded? ${isExcludedKey(loserKey)}`);
}
