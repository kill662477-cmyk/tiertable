// data/raw-records/*.json (352개 선수 파일) -> 중복 제거된 단일 경기 이벤트 목록으로 변환.
// 각 매치는 두 선수 파일에 각각 자기 시점으로 중복 기록되어 있어 시그니처로 병합한다.
// 출력: data/matches.json (2024-04-10 이후, 시간순 정렬)

const fs = require("fs");
const path = require("path");
const { classifyMatchType, multiplierFor } = require("./lib/classify");

const players = require(path.join(__dirname, "..", "data", "players.json"));

const RAW_DIR = path.join(__dirname, "..", "data", "raw-records");
const OUT_PATH = path.join(__dirname, "..", "data", "matches.json");
const CUTOFF = "2024-04-10";

// 우리 여성 티어보드(1~8티어+유스/0티어)와 무관한 별도 이벤트 로스터(카드무늬 테마 —
// 아마 뉴캄옥션 등 남성부/게스트 특별전) 소속 인원의 tier 값. 이 티어인 인원이 낀
// 경기는 상대가 누구든 통째로 제외한다. (메모 텍스트로 "팀플" 추측하는 건 오탐이 많아서 폐기)
const EXCLUDED_EVENT_TIERS = new Set(["잭티어", "조커티어", "갓티어", "스페이드티어", "킹티어"]);

// 이름+종족 -> 실제 userId. 한쪽 파일에서만 경기가 누락돼(트리밍/데이터갭) 발생하는
// "같은 사람인데 uid: 식별자와 nm: 임시식별자로 쪼개지는" 문제를 막기 위함.
// (players.json 371명 전체 대상 — 시드 매칭 93명보다 넓은 범위)
const nameRaceToUid = new Map();
const excludedUserIds = new Set();
for (const p of players) {
  const name = String(p.name || "").trim();
  if (!name || !p.userId) continue;
  const k = `${name}:${p.race}`;
  if (!nameRaceToUid.has(k)) nameRaceToUid.set(k, p.userId);
  if (EXCLUDED_EVENT_TIERS.has(p.tier)) excludedUserIds.add(p.userId);
}
console.log(`고티어(이벤트/남성부) 제외 대상: ${excludedUserIds.size}명`);

function isExcludedKey(key) {
  return key.startsWith("uid:") && excludedUserIds.has(key.slice(4));
}

function resolveKey(userId, name, race) {
  if (userId) return `uid:${userId}`;
  const known = nameRaceToUid.get(`${name}:${race}`);
  if (known) return `uid:${known}`;
  return `nm:${name}:${race}`;
}

function signature(r) {
  const names = [r.playerName, r.opponentName].sort().join(",");
  return [r.date, r.map, r.matchType, r.memo, Math.abs(r.eloChange).toFixed(2), names].join("|");
}

function main() {
  const files = fs.readdirSync(RAW_DIR);
  const groups = new Map(); // signature -> rows[]
  const fileEarliest = new Map(); // userId -> earliest date across their whole file (전체 이력용, cutoff 무관)

  for (const f of files) {
    const key = f.replace(/\.json$/, "");
    const userId = key.replace(/_[TZP]$/, "");
    const rows = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf8"));
    if (rows.length) {
      const dates = rows.map((r) => r.date).sort();
      const earliest = dates[0];
      const prev = fileEarliest.get(userId);
      if (!prev || earliest < prev) fileEarliest.set(userId, earliest);
    }
    for (const r of rows) {
      const sig = signature(r);
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push(r);
    }
  }

  const matches = [];
  let oneSided = 0;
  let bothSided = 0;
  let collided = 0;
  let eventTierExcluded = 0;

  for (const rows of groups.values()) {
    if (rows.length > 2) collided += 1;
    // 승자 관점 row, 패자 관점 row 각각 찾기 (있으면)
    const winRow = rows.find((r) => r.isWin);
    const loseRow = rows.find((r) => !r.isWin);

    let winnerKey, winnerName, winnerRace;
    let loserKey, loserName, loserRace;

    if (winRow) {
      winnerName = winRow.playerName;
      winnerRace = winRow.playerRace;
      winnerKey = resolveKey(winRow.playerUserId, winnerName, winnerRace);
    } else if (loseRow) {
      winnerName = loseRow.winnerPlayer;
      winnerRace = loseRow.winnerRace;
      winnerKey = resolveKey(null, winnerName, winnerRace);
    }

    if (loseRow) {
      loserName = loseRow.playerName;
      loserRace = loseRow.playerRace;
      loserKey = resolveKey(loseRow.playerUserId, loserName, loserRace);
    } else if (winRow) {
      loserName = winRow.losePlayer;
      loserRace = winRow.loseRace;
      loserKey = resolveKey(null, loserName, loserRace);
    }

    if (winRow && loseRow) bothSided += 1;
    else oneSided += 1;

    const anchor = winRow || loseRow;
    if (!anchor) continue;
    if (anchor.date < CUTOFF) continue;
    if (isExcludedKey(winnerKey) || isExcludedKey(loserKey)) { eventTierExcluded += 1; continue; }

    const category = classifyMatchType(anchor.memo);
    matches.push({
      date: anchor.date,
      map: anchor.map,
      matchType: anchor.matchType,
      memo: anchor.memo,
      category,
      multiplier: multiplierFor(category),
      bothSided: Boolean(winRow && loseRow),
      winnerKey,
      winnerName,
      winnerRace,
      loserKey,
      loserName,
      loserRace,
    });
  }

  matches.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  fs.writeFileSync(OUT_PATH, JSON.stringify({ fileEarliest: Object.fromEntries(fileEarliest), matches }, null, 0));

  console.log(`고유 매치(그룹): ${groups.size}`);
  console.log(`  양쪽기록: ${bothSided}, 한쪽기록: ${oneSided}, 시그니처충돌(3+): ${collided}`);
  console.log(`고티어(이벤트/남성부) 상대 경기 제외: ${eventTierExcluded}건`);
  console.log(`${CUTOFF} 이후 매치: ${matches.length}`);
  console.log(`저장: ${OUT_PATH}`);
}

main();
