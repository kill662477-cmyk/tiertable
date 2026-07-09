// 시드 그룹과 특정 인물(예: 이제동) 사이의 최단 연결 경로를 찾아서
// 어떤 경기가 "다리" 역할을 하는지 확인한다.
const fs = require("fs");
const path = require("path");
const { buildSeedIndex } = require("./lib/seed");

const players = require(path.join(__dirname, "..", "data", "players.json"));
const MATCHES_PATH = path.join(__dirname, "..", "data", "matches.json");

const TARGET_NAME = process.argv[2] || "이제동";

function main() {
  const { matches } = JSON.parse(fs.readFileSync(MATCHES_PATH, "utf8"));
  const seedIndex = buildSeedIndex();
  const byNameRace = new Map();
  for (const p of players) byNameRace.set(`${String(p.name || "").trim()}:${p.race}`, p);
  const seedKeys = new Set();
  for (const [name, s] of seedIndex.entries()) {
    const p = byNameRace.get(`${name}:${s.race}`);
    if (p && p.userId) seedKeys.add(`uid:${p.userId}`);
  }

  const adj = new Map(); // node -> [{to, via}]
  const nameOf = new Map();
  for (const m of matches) {
    nameOf.set(m.winnerKey, m.winnerName);
    nameOf.set(m.loserKey, m.loserName);
    if (!adj.has(m.winnerKey)) adj.set(m.winnerKey, []);
    if (!adj.has(m.loserKey)) adj.set(m.loserKey, []);
    adj.get(m.winnerKey).push({ to: m.loserKey, via: m });
    adj.get(m.loserKey).push({ to: m.winnerKey, via: m });
  }

  const targetKey = [...nameOf.entries()].find(([, n]) => n === TARGET_NAME)?.[0];
  if (!targetKey) { console.log("대상 못 찾음"); return; }

  // BFS from all seed nodes simultaneously
  const prev = new Map();
  const visited = new Set();
  const queue = [];
  for (const k of seedKeys) {
    if (adj.has(k)) { visited.add(k); queue.push(k); }
  }
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur === targetKey) break;
    for (const { to, via } of adj.get(cur) || []) {
      if (!visited.has(to)) {
        visited.add(to);
        prev.set(to, { from: cur, via });
        queue.push(to);
      }
    }
  }

  if (!prev.has(targetKey) && !seedKeys.has(targetKey)) {
    console.log(`${TARGET_NAME} 는 시드 그룹과 연결 안 됨`);
    return;
  }

  // 경로 역추적
  const path_ = [];
  let cur = targetKey;
  while (prev.has(cur)) {
    const { from, via } = prev.get(cur);
    path_.push(via);
    cur = from;
  }
  console.log(`${TARGET_NAME} <- 시드 그룹까지 경로 (${path_.length}단계):`);
  path_.reverse().forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.date} ${m.winnerName} vs ${m.loserName} [${m.matchType}] memo="${m.memo}"`);
  });
}

main();
