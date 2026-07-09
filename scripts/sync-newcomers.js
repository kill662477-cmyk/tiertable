const fs = require("fs");
const path = require("path");

const statusPath = path.join(__dirname, "..", "data", "player_init_status.json");
const playersPath = path.join(__dirname, "..", "data", "players.json");

if (!fs.existsSync(playersPath)) {
  console.log("players.json이 없습니다.");
  process.exit(1);
}

const players = JSON.parse(fs.readFileSync(playersPath, "utf8"));
let status = {};
if (fs.existsSync(statusPath)) {
  status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
}

let updated = 0;
for (const p of players) {
  const uid = p.userId;
  if (!uid) continue;
  
  if (!status[uid]) {
    const tc = p.tierCode;
    if (tc === "B" || (p.tier && p.tier.includes("베이비"))) {
      status[uid] = "youth";
      updated++;
      console.log(`신규 등록 (유스): ${p.name} (${uid})`);
    } else if (["1","2","3","4","5","6","7","8"].includes(tc) || (p.tier && p.tier.match(/[1-8]티어/))) {
      status[uid] = "returnee";
      updated++;
      console.log(`신규 등록 (복귀자): ${p.name} (${uid})`);
    }
    // 0티어(0), 스페이드(S), 킹(K) 등 논외 인원은 등록하지 않음 (건너뜀)
  }
}

if (updated > 0) {
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
  console.log(`\n총 ${updated}명의 새로운 인원 판별 완료 후 저장함.`);
} else {
  console.log("새로 발견된 신규/복귀 인원이 없습니다.");
}
