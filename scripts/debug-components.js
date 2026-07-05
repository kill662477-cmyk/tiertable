// 매치 그래프에서 연결 컴포넌트(서로 붙어본 적 있는 무리)를 찾는다.
// 2024.04 시드 93명이 속한 컴포넌트 밖에 있는 무리(남성부 등 무관 풀)를 식별하기 위함.
const fs = require("fs");
const path = require("path");
const { buildSeedIndex } = require("./lib/seed");

const MONSTARZNEW_ROOT = "C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew";
const players = require(path.join(MONSTARZNEW_ROOT, "data", "manual", "players.json"));
const MATCHES_PATH = path.join(__dirname, "..", "data", "matches.json");

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

  const adj = new Map();
  function addEdge(a, b) {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  }
  for (const m of matches) {
    addEdge(m.winnerKey, m.loserKey);
  }

  const visited = new Set();
  const components = [];
  for (const node of adj.keys()) {
    if (visited.has(node)) continue;
    const stack = [node];
    const comp = [];
    visited.add(node);
    while (stack.length) {
      const cur = stack.pop();
      comp.push(cur);
      for (const nb of adj.get(cur)) {
        if (!visited.has(nb)) {
          visited.add(nb);
          stack.push(nb);
        }
      }
    }
    components.push(comp);
  }

  components.sort((a, b) => b.length - a.length);
  console.log(`총 컴포넌트 수: ${components.length}`);
  components.forEach((comp, i) => {
    const hasSeed = comp.some((k) => seedKeys.has(k));
    console.log(`컴포넌트 ${i}: 인원수=${comp.length}, 시드포함=${hasSeed}`);
  });

  // 시드 없는 컴포넌트들의 대표 이름 몇 개씩 출력
  console.log("\n--- 시드 없는(무관) 컴포넌트 상세 ---");
  const nameOf = new Map();
  for (const m of matches) {
    nameOf.set(m.winnerKey, m.winnerName);
    nameOf.set(m.loserKey, m.loserName);
  }
  for (const comp of components) {
    if (comp.some((k) => seedKeys.has(k))) continue;
    if (comp.length < 3) continue;
    console.log(`  [${comp.length}명]`, comp.slice(0, 8).map((k) => nameOf.get(k)).join(", "));
  }
}

main();
