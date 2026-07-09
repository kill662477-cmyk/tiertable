const fs = require("fs");
const path = require("path");

const statusPath = path.join(__dirname, "..", "data", "player_init_status.json");
const mmrPath = path.join(__dirname, "..", "data", "mmr-result.json");
const playersPath = path.join(__dirname, "..", "data", "players.json");

if (!fs.existsSync(mmrPath)) {
  console.log("mmr-result.json이 없습니다. 실행을 중단합니다.");
  process.exit(1);
}

const mmrResult = JSON.parse(fs.readFileSync(mmrPath, "utf8"));
let status = {};
if (fs.existsSync(statusPath)) {
  status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
}

let existingCount = 0;
// 현재 mmr-result에 있는 모든 사람(active, hidden, placement)은 이미 과거의 초기화 로직을 거친 사람들이므로
// "existing"으로 마킹하여, 앞으로 players.json을 스캔할 때 덮어쓰거나 잘못 판별하지 않도록 함.
for (const p of [...mmrResult.active, ...(mmrResult.hidden || []), ...(mmrResult.placement || [])]) {
  const uid = p.key.startsWith("uid:") ? p.key.slice(4) : p.key;
  if (!status[uid]) {
    status[uid] = "existing";
    existingCount++;
  }
}

if (existingCount > 0) {
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
  console.log(`과거 이력 있는 ${existingCount}명을 player_init_status.json에 'existing'으로 등록 완료.`);
} else {
  console.log("추가할 기존 인원이 없습니다.");
}
