// MMR_SYSTEM_DESIGN.md 설계대로 2024-04-10 이후 전적을 순서대로 재생하며 MMR을 계산.
// 승급전/강등/소프트리셋은 이번 1차 계산에는 포함하지 않음 (§4~6은 다음 단계).
// 포함: §1(Elo) §2(초기 시드) §3(매치타입 K) §7(신규=유스시작 / 복귀자=배치고사, 임시상대 포함)

const fs = require("fs");
const path = require("path");
const { buildSeedIndex, TIER_BASELINE_MMR } = require("./lib/seed");
const { kEffective, expectedScore } = require("./lib/elo");
const {
  RENAMED_TO_SEED_NAME,
  FORCE_RETURNEE_NAMES,
  DIRECT_UID_SEED_OVERRIDES,
  EXCLUDED_PLAYER_NAMES,
  FORCED_TIER_OVERRIDES,
} = require("./lib/aliases");

const MONSTARZNEW_ROOT = "C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew";
const players = require(path.join(MONSTARZNEW_ROOT, "data", "manual", "players.json"));

const MATCHES_PATH = path.join(__dirname, "..", "data", "matches.json");
const OUT_PATH = path.join(__dirname, "..", "data", "mmr-result.json");
const CUTOFF = "2024-04-10";
const PLACEMENT_GAMES = 10;
const FALLBACK_UNRATED_MMR = 600; // 유스 기준선. 배치중 상대 추정치가 없을 때 사용.
const RELIABLE_MIN_MATCHES = 10; // 배치 판정용 상대로 인정하는 최소 검증 판수
const SAME_TIER_GAP_DAMPING = 0.5; // 같은 티어끼리는 MMR차이가 나도 체감 격차를 절반으로 줄여 페널티 완화
// ---- 신규 수렴 가드 (디플레이션 방지의 핵심) ----
// 신규는 유스(600)에서 시작하지만 실제 실력은 그보다 높은 경우가 대부분이라,
// 제 위치로 올라가는 동안 순수 제로섬이면 기존 인원들의 점수를 빨아먹으며 올라간다
// (신규 1명이 600->1100이면 기존 풀에서 500점 유출). 신규가 150명+이면 기존 전원이
// 체계적으로 가라앉는 구조적 디플레이션 발생 — 이것이 "전원 하락"의 진짜 원인.
// 해결: 신규가 아직 수렴 전(판수 < NEWCOMER_CONVERGENCE_GAMES)일 때
//   - 신규 본인: 정상 변동 (빨리 제 실력 찾아감, 오르든 내리든)
//   - 상대방(기존): 변동 ×NEWCOMER_GUARD_DAMPING 축소 (점수 유출/유입 차단)
// 복귀자 배치 기간의 "상대 보호 ×0.5"와 같은 원리를 신규에게 확장한 것.
const NEWCOMER_CONVERGENCE_GAMES = 30;
const NEWCOMER_GUARD_DAMPING = 0.4;
// 이변 패배(자기보다 하위 티어에게 짐) 시 패자의 손실만 완화. 승자(하위) 보상은 그대로.
// 제로섬이 깨져 소폭 인플레이션이 생기지만 6개월 소프트리셋 압축이 주기적으로 흡수.
const UPSET_LOSS_DAMPING = 0.7;
// 동일 상대 반복 감쇠 — 특정 상대 스폰 농사(지두두 vs 박듀듀 167판 +367점) 방지.
// 같은 날 같은 상대와 3판까지 정상, 4~6판째 ×0.5, 7판째부터 ×0.2.
const REPEAT_FULL_GAMES = 3;
const REPEAT_HALF_GAMES = 6;
const REPEAT_HALF_DAMPING = 0.5;
const REPEAT_TAIL_DAMPING = 0.2;

function repeatDampingFor(gamesToday) {
  // gamesToday: 오늘 이 매치업의 몇 번째 판인지 (1부터)
  if (gamesToday <= REPEAT_FULL_GAMES) return 1;
  if (gamesToday <= REPEAT_HALF_GAMES) return REPEAT_HALF_DAMPING;
  return REPEAT_TAIL_DAMPING;
}
// 3개월 이상 전적 공백 후 복귀 → 복귀자 재판정(배치고사 다시). 표시도 3개월 무전적이면 숨김.
const INACTIVE_MONTHS = 3;
const TEMP_INACTIVE_MONTHS = 1;

function isConverging(entry) {
  if (entry.seeded) return false;
  if (String(entry.note || "").includes("배치확정")) return false; // 배치 완료 = 이미 추정 실력으로 주입됨
  return entry.countedMatches < NEWCOMER_CONVERGENCE_GAMES;
}

// 배치고사 상대로 신뢰할 수 있는지: 시드 출신이거나, 본인도 충분히 검증된 판수를 채운 경우.
// "복귀자가 붙는 상대 = 그 사람 실력 정도"라는 매칭 신호를 믿되, 상대도 막 생긴 미검증
// 상대(600점 미러링/신규)면 그 신호 자체가 의미 없으므로 배치 표본에서 제외한다.
function isReliable(entry) {
  return entry.seeded === true || entry.countedMatches >= RELIABLE_MIN_MATCHES;
}
const RESET_INTERVAL_MONTHS = 6;
const RESET_COMPRESSION = 0.7; // MMR_SYSTEM_DESIGN.md §6 — 약한 압축(시즌 성과 보존 우선)
const TIER_RANK_ORDER = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "B", "Y"]; // 앞이 강함

function addMonths(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function rankOf(tier) {
  return TIER_RANK_ORDER.indexOf(tier);
}

function tierAtRank(rank) {
  const clamped = Math.max(0, Math.min(TIER_RANK_ORDER.length - 1, rank));
  return TIER_RANK_ORDER[clamped];
}

// ---- 시드(2024.04) <-> players.json 이름+종족 교차 매칭 (93명) ----
function buildSeedByUid() {
  const seedIndex = buildSeedIndex(); // name -> {tier, race, initialMMR}
  const byNameRace = new Map();
  for (const p of players) {
    byNameRace.set(`${String(p.name || "").trim()}:${p.race}`, p);
  }
  const seedByUid = new Map(); // uid:xxx -> {mmr, tier, name, race}
  let matched = 0;
  for (const [name, seed] of seedIndex.entries()) {
    const p = byNameRace.get(`${name}:${seed.race}`);
    if (!p || !p.userId) continue;
    seedByUid.set(`uid:${p.userId}`, {
      mmr: seedInjectionMmr(seed.tier),
      tier: seed.tier,
      name,
      race: seed.race,
    });
    matched += 1;
  }

  // 개명 확인된 인원 — eloboard 프로필이 개명과 함께 리셋돼 fileEarliest로는
  // 신규/복귀자 자동판별이 안 되므로 수동으로 시드 매칭시킨다.
  let aliasMatched = 0;
  for (const [currentName, seedName] of Object.entries(RENAMED_TO_SEED_NAME)) {
    const seed = seedIndex.get(seedName);
    const p = players.find((x) => String(x.name || "").trim() === currentName);
    if (!seed || !p || !p.userId) continue;
    seedByUid.set(`uid:${p.userId}`, {
      mmr: seedInjectionMmr(seed.tier),
      tier: seed.tier,
      name: currentName,
      race: p.race, // 실제 플레이 종족 기준(시드 목록 종족표기가 개명 전과 다를 수 있음)
    });
    aliasMatched += 1;
  }
  if (aliasMatched) console.log(`개명 확인 인원 매칭: ${aliasMatched}명`);

  // players.json에 아예 없는(로스터에서 빠진) 시드 인원 — raw-records로 직접 확인한 uid로 매칭
  let directMatched = 0;
  for (const [userId, seedName] of Object.entries(DIRECT_UID_SEED_OVERRIDES)) {
    const seed = seedIndex.get(seedName);
    if (!seed) continue;
    seedByUid.set(`uid:${userId}`, {
      mmr: seedInjectionMmr(seed.tier),
      tier: seed.tier,
      name: seedName,
      race: seed.race,
    });
    directMatched += 1;
  }
  if (directMatched) console.log(`로스터 이탈(직접 uid 확인) 인원 매칭: ${directMatched}명`);

  console.log(`시드 매칭: ${matched}명 (전체 시드 ${seedIndex.size}명 중)`);
  return seedByUid;
}

// 티어 경계선(계산 내부용): 고정 주입 사다리 그대로 사용.
// 캘리브레이션 파일을 여기 되먹이면 주입-경계 순환 드리프트가 생기므로 금지 —
// 표시 티어는 출력 단계에서 1회성 고정 캘리브레이션(data/calibration.json)을 읽어서 매긴다.
const BOUNDARY = { ...TIER_BASELINE_MMR };
const CALIBRATION_PATH = path.join(__dirname, "..", "data", "calibration.json");

function deriveTier(mmr) {
  for (let k = 1; k <= 8; k++) {
    if (mmr >= BOUNDARY[k]) return String(k);
  }
  return "Y";
}

// MMR 바닥 하한선 — 유스에서 한없이 추락하면 아무리 이겨도 복귀 불가능해지는
// "점수 무덤" 방지. 표시 경계선의 유스 하한(600, 고정 지정값)과 일치시킨다.
const TIER_WIDTH = BOUNDARY[7] - BOUNDARY[8];
const MMR_FLOOR = 600;

// 시드 주입 MMR — 티어 구간의 "최하위(하한값)"에서 시작.
// 중앙값 주입은 승률 무관하게 전체가 한 계단씩 밀려 보이는 왜곡을 만들어서 폐기 —
// 하한 시작이면 실력만큼 실제로 올라가야 표시티어가 오르므로 승률과 무관한 상승이 없다.
function seedInjectionMmr(tier) {
  if (tier === "Y") return TIER_BASELINE_MMR.Y;
  return TIER_BASELINE_MMR[Number(tier)];
}

function clampFloor(mmr) {
  return Math.max(MMR_FLOOR, mmr);
}

function ratingFor(entry) {
  return entry.mmr != null ? entry.mmr : FALLBACK_UNRATED_MMR;
}

function main() {
  const { fileEarliest, matches: allMatches } = JSON.parse(fs.readFileSync(MATCHES_PATH, "utf8"));
  // 누락자(상대 파일이 없어 한쪽 기록만 존재하는 경기) 전부 제외 — 양쪽 다 크롤링된 경기만 사용
  const matches = allMatches.filter((m) => m.bothSided);
  console.log(`전체 매치 ${allMatches.length}건 중 양쪽기록 매치 ${matches.length}건만 사용`);
  const seedByUid = buildSeedByUid();

  const registry = new Map(); // key -> entry

  // meetingRating: 크롤링 안 된 상대(nm: 키)를 처음 만났을 때 부여할 초기 MMR.
  // "만난 시점의 내(추적 대상) MMR과 동일" 규칙 — 상대 실력을 모르니 기대승률 50%로 중립 처리.
  function ensure(key, name, race, meetingRating) {
    let e = registry.get(key);
    if (e) {
      e.name = name; // 최신 이름으로 갱신
      return e;
    }
    if (seedByUid.has(key)) {
      const s = seedByUid.get(key);
      e = { mmr: s.mmr, tier: s.tier, status: "active", note: "시드(2024.04)", seeded: true };
    } else if (key.startsWith("uid:")) {
      const userId = key.slice(4);
      const earliest = fileEarliest[userId];
      const forced = FORCE_RETURNEE_NAMES.has(name);
      if ((earliest && earliest < CUTOFF) || forced) {
        e = { mmr: null, tier: null, status: "placement", placementList: [], note: "복귀자(배치중)" };
      } else if (process.env.NEWCOMER_MODE === "youth") {
        e = { mmr: FALLBACK_UNRATED_MMR, tier: "Y", status: "active", note: "신규(유스 시작)" };
      } else {
        // 신규도 복귀자와 동일하게 배치고사 — 유스(600) 고정 주입은 제로섬 풀에
        // 구조적 디플레이션을 일으킴(실제 실력과의 차액만큼 기존 인원이 잃음).
        // 붙는 상대 자체가 실력 신호("그 사람이랑 붙는 건 실력이 되니까")라는 원칙을 신규에도 적용.
        e = { mmr: null, tier: null, status: "placement", placementList: [], note: "신규(배치중)" };
      }
    } else {
      // 크롤링 대상 밖(자기 파일 없음) — 이름 기준 임시 추적, 상대 MMR 그대로 미러링해서 시작
      const initMmr = meetingRating != null ? meetingRating : FALLBACK_UNRATED_MMR;
      e = { mmr: initMmr, tier: deriveTier(initMmr), status: "active", note: "임시추적(비크롤링 상대)" };
    }
    e.name = name;
    e.race = race;
    e.wins = 0;
    e.losses = 0;
    e.countedMatches = 0;
    registry.set(key, e);
    return e;
  }

  function finalizePlacementIfReady(entry) {
    if (entry.status !== "placement" || entry.placementList.length < PLACEMENT_GAMES) return;
    const list = entry.placementList;
    const wins = list.filter((x) => x.win).length;
    const losses = list.length - wins;
    const avgOpp = list.reduce((s, x) => s + x.opponentRating, 0) / list.length;
    const perf = avgOpp + (400 * (wins - losses)) / list.length;
    entry.mmr = perf;
    entry.tier = deriveTier(perf);
    entry.status = "active";
    entry.note = entry.note === "신규(배치중)" ? "신규(배치확정)" : "복귀자(배치확정)";
    entry.placementSnapshot = list.slice(); // 검증용 — 배치 10경기 원본 기록 보존
  }

  // ---- 6개월 소프트 리셋 ----
  // 승급 조건(리셋당 1계단 제한) 삭제 — raw MMR이 가리키는 티어로 바로 이동.
  // MMR 압축(0.7)만 적용해서 시즌 인플레이션은 청소하되, 승급 속도는 제한하지 않는다.
  function applySoftReset() {
    let count = 0;
    for (const e of registry.values()) {
      if (e.status !== "active") continue; // 배치중/미확정은 리셋 대상 아님
      const newTier = deriveTier(e.mmr);
      // 유스는 하한이 없으므로(BOUNDARY.Y=-Inf) 압축 기준점은 8티어 하한을 사용
      const baseline = newTier === "Y" ? BOUNDARY[8] - (BOUNDARY[7] - BOUNDARY[8]) : BOUNDARY[newTier];
      const before = e.mmr;
      e.mmr = baseline + (e.mmr - baseline) * RESET_COMPRESSION;
      e.tier = newTier;
      if (TRACE_NAME && e.name === TRACE_NAME) {
        traceLog.push({ t: "reset", delta: e.mmr - before, my: e.mmr });
      }
      count += 1;
    }
    return count;
  }

  let nextResetDate = addMonths(CUTOFF, RESET_INTERVAL_MONTHS);
  let resetEvents = 0;

  // 특정 선수 점수 흐름 추적 (디버그): TRACE_NAME=이름 node scripts/calc-mmr.js
  const TRACE_NAME = process.env.TRACE_NAME || null;
  const traceLog = [];

  // 동일 상대 반복 감쇠용 — 날짜별 매치업 카운트 (매치가 날짜순 정렬이라 날짜 바뀌면 비움)
  let repeatDate = null;
  let repeatCounts = new Map();

  let processed = 0;
  for (const m of matches) {
    while (m.date >= nextResetDate) {
      const n = applySoftReset();
      resetEvents += 1;
      console.log(`  [소프트리셋 ${resetEvents}] ${nextResetDate} 기준 ${n}명 압축`);
      nextResetDate = addMonths(nextResetDate, RESET_INTERVAL_MONTHS);
    }

    // 한쪽만 크롤링 안 된(nm:) 경기는 추적 대상을 먼저 만들고, 그 mmr을 미러링해서 상대를 생성한다.
    const winnerUntracked = m.winnerKey.startsWith("nm:");
    const loserUntracked = m.loserKey.startsWith("nm:");
    let w, l;
    if (winnerUntracked && !loserUntracked) {
      l = ensure(m.loserKey, m.loserName, m.loserRace);
      w = ensure(m.winnerKey, m.winnerName, m.winnerRace, ratingFor(l));
    } else if (loserUntracked && !winnerUntracked) {
      w = ensure(m.winnerKey, m.winnerName, m.winnerRace);
      l = ensure(m.loserKey, m.loserName, m.loserRace, ratingFor(w));
    } else {
      w = ensure(m.winnerKey, m.winnerName, m.winnerRace);
      l = ensure(m.loserKey, m.loserName, m.loserRace);
    }

    // 3개월 이상 공백 후 복귀 → 복귀자 판정(표시용 뱃지). MMR은 리셋하지 않는다 —
    // 공백 전 점수는 그 당시 실제 전적으로 쌓인 데이터라 유지가 원칙이고,
    // 공백 중 소프트리셋 압축이 이미 기준선 쪽으로 자연 감쇠시킨다.
    for (const e of [w, l]) {
      if (e.status === "active" && e.lastMatchDate && m.date >= addMonths(e.lastMatchDate, INACTIVE_MONTHS)) {
        e.note = "복귀자(재측정중)";
        e.returnBadgeUntil = e.countedMatches + PLACEMENT_GAMES; // 복귀 후 10경기 동안 뱃지 표시
      }
      if (e.returnBadgeUntil != null && e.countedMatches >= e.returnBadgeUntil) {
        e.note = "복귀자(재측정완료)";
        e.returnBadgeUntil = null;
      }
      e.lastMatchDate = m.date;
    }

    w.countedMatches += 1;
    l.countedMatches += 1;
    w.wins += 1;
    l.losses += 1;

    const bothActive = w.status === "active" && l.status === "active";
    const bothPlacement = w.status === "placement" && l.status === "placement";

    // 승자 기준 델타: 항상 (승자레이팅, 패자레이팅)으로 표준 Elo 계산
    const winnerRatingForCalc = ratingFor(w);
    const loserRatingForCalc = ratingFor(l);
    const k = kEffective(m.multiplier);

    // 같은 티어끼리는 MMR차이가 나도 체감 격차를 절반으로 완화 — 티어 안에서의
    // 자잘한 순위다툼이 과한 페널티/보너스로 이어지지 않게 함.
    const sameTier = deriveTier(winnerRatingForCalc) === deriveTier(loserRatingForCalc);
    const gapDamping = sameTier ? SAME_TIER_GAP_DAMPING : 1;
    const dampedLoserRating = winnerRatingForCalc + (loserRatingForCalc - winnerRatingForCalc) * gapDamping;

    // 동일 상대 반복 감쇠 (같은 날 같은 매치업 N판째부터 양쪽 변동 축소 — 제로섬 유지)
    if (m.date !== repeatDate) {
      repeatDate = m.date;
      repeatCounts = new Map();
    }
    const pairKey = [m.winnerKey, m.loserKey].sort().join("|");
    const gamesToday = (repeatCounts.get(pairKey) || 0) + 1;
    repeatCounts.set(pairKey, gamesToday);
    const repeatDamping = repeatDampingFor(gamesToday);

    const baseDelta = k * (1 - expectedScore(winnerRatingForCalc, dampedLoserRating)) * repeatDamping;

    if (bothActive) {
      // 상대가 수렴 전 신규면 내 변동을 축소 (신규 본인은 정상 변동)
      const wDamping = isConverging(l) && !isConverging(w) ? NEWCOMER_GUARD_DAMPING : 1;
      let lDamping = isConverging(w) && !isConverging(l) ? NEWCOMER_GUARD_DAMPING : 1;
      // 이변 패배 완화: 패자가 승자보다 상위 티어면 손실만 축소 (승자 보상은 그대로)
      const loserIsHigherTier = rankOf(deriveTier(loserRatingForCalc)) < rankOf(deriveTier(winnerRatingForCalc));
      if (loserIsHigherTier) lDamping *= UPSET_LOSS_DAMPING;
      w.mmr += baseDelta * wDamping;
      l.mmr = clampFloor(l.mmr - baseDelta * lDamping);

      if (TRACE_NAME) {
        if (w.name === TRACE_NAME)
          traceLog.push({ t: "win", date: m.date, cat: m.category, opp: l.name, oppMmr: loserRatingForCalc, delta: baseDelta * wDamping, my: w.mmr });
        if (l.name === TRACE_NAME)
          traceLog.push({ t: "loss", date: m.date, cat: m.category, opp: w.name, oppMmr: winnerRatingForCalc, delta: -baseDelta * lDamping, upsetSaved: loserIsHigherTier ? baseDelta * (1 - UPSET_LOSS_DAMPING) : 0, my: l.mmr });
      }
    } else if (bothPlacement) {
      // 둘 다 배치중(미검증) — 서로를 기준으로 삼을 수 없으므로 배치 표본에서 제외.
      // 실제 매치 자체는 있었으니 통계(승/패/판수)는 위에서 이미 반영됨.
    } else {
      // 한쪽만 placement: 배치중 상대와 맞붙은 active측 변동은 절반으로 보호
      const activeEntry = w.status === "active" ? w : l;
      const activeIsWinner = activeEntry === w;
      const halfDelta = baseDelta * 0.5;
      if (activeIsWinner) activeEntry.mmr += halfDelta;
      else activeEntry.mmr = clampFloor(activeEntry.mmr - halfDelta);

      // active측이 신뢰 가능한 상대일 때만 배치 10경기 표본으로 인정.
      // (active측도 막 생긴 미검증 상대면 "실력 정도가 맞아서 붙었다"는 매칭 신호를 못 믿으므로 제외)
      if (isReliable(activeEntry)) {
        const placementEntry = activeEntry === w ? l : w;
        placementEntry.placementList.push({
          opponentRating: activeEntry.mmr,
          win: placementEntry === w,
        });
      }
    }

    finalizePlacementIfReady(w);
    finalizePlacementIfReady(l);

    processed += 1;
  }

  console.log(`소프트리셋 총 ${resetEvents}회 적용됨`);

  if (TRACE_NAME && traceLog.length) {
    console.log(`\n===== ${TRACE_NAME} 점수 흐름 분해 =====`);
    const wins = traceLog.filter((x) => x.t === "win");
    const losses = traceLog.filter((x) => x.t === "loss");
    const resets = traceLog.filter((x) => x.t === "reset");
    const sum = (arr) => arr.reduce((s, x) => s + x.delta, 0);
    console.log(`승리 ${wins.length}건 합계 +${sum(wins).toFixed(1)}`);
    console.log(`패배 ${losses.length}건 합계 ${sum(losses).toFixed(1)}`);
    console.log(`  └ 이변완화로 아낀 손실: +${losses.reduce((s, x) => s + (x.upsetSaved || 0), 0).toFixed(1)}`);
    console.log(`소프트리셋 ${resets.length}회 합계 ${sum(resets).toFixed(1)}`);
    console.log(`총 순변동: ${sum(traceLog).toFixed(1)}`);

    console.log(`\n[카테고리별]`);
    const byCat = {};
    for (const x of [...wins, ...losses]) {
      if (!byCat[x.cat]) byCat[x.cat] = { w: 0, l: 0, sum: 0 };
      if (x.t === "win") byCat[x.cat].w += 1;
      else byCat[x.cat].l += 1;
      byCat[x.cat].sum += x.delta;
    }
    for (const [cat, v] of Object.entries(byCat)) {
      console.log(`  ${cat}: ${v.w}승${v.l}패, 순변동 ${v.sum >= 0 ? "+" : ""}${v.sum.toFixed(1)}`);
    }

    console.log(`\n[상대별 순변동 TOP 12 (절대값)]`);
    const byOpp = {};
    for (const x of [...wins, ...losses]) {
      if (!byOpp[x.opp]) byOpp[x.opp] = { w: 0, l: 0, sum: 0 };
      if (x.t === "win") byOpp[x.opp].w += 1;
      else byOpp[x.opp].l += 1;
      byOpp[x.opp].sum += x.delta;
    }
    Object.entries(byOpp)
      .sort((a, b) => Math.abs(b[1].sum) - Math.abs(a[1].sum))
      .slice(0, 12)
      .forEach(([opp, v]) => {
        console.log(`  vs ${opp.padEnd(8)}: ${v.w}승${v.l}패, 순변동 ${v.sum >= 0 ? "+" : ""}${v.sum.toFixed(1)}`);
      });
  }

  // ---- 결과 집계 ----
  // 승급 게이트 삭제 — 출력 시점 최종 mmr 기준으로 티어를 다시 계산한다.
  // 마지막 전적이 3개월 이상 지난 사람은 hidden(휴면) — 티어표 표시에서 제외.
  // 마지막 전적이 1개월 이상 지난 사람은 isTemporaryDormant 처리.
  const dataMaxDate = matches.length ? matches[matches.length - 1].date : CUTOFF;
  const hiddenCutoff = addMonths(dataMaxDate, -INACTIVE_MONTHS);
  const tempDormantCutoff = addMonths(dataMaxDate, -TEMP_INACTIVE_MONTHS);

  const finalActive = [];
  const hidden = [];
  const stillPlacement = [];
  for (const [key, e] of registry.entries()) {
    if (e.status === "active") {
      e.tier = deriveTier(e.mmr);
      if (e.lastMatchDate && e.lastMatchDate < hiddenCutoff) {
        hidden.push({ key, ...e });
      } else {
        if (e.lastMatchDate && e.lastMatchDate < tempDormantCutoff) {
          e.isTemporaryDormant = true;
        }
        finalActive.push({ key, ...e });
      }
    } else {
      stillPlacement.push({ key, ...e, placementProgress: `${e.placementList.length}/${PLACEMENT_GAMES}` });
    }
  }
  finalActive.sort((a, b) => b.mmr - a.mmr);
  hidden.sort((a, b) => b.mmr - a.mmr);

  // ---- 표시 티어용 경계선: 1회성 고정 캘리브레이션 ----
  // 매 실행마다 재적합(self-calibration)하면 개인 성적과 무관하게 전체가 출렁이는
  // 왜곡이 생겨서 폐기함. data/calibration.json은 수동으로만 갱신되는 고정값 —
  // 여기서는 읽기만 한다. boundaries(수동 하한 지정) 또는 A/G(회귀) 둘 다 지원.
  let DISPLAY_BOUNDARY = BOUNDARY;
  if (fs.existsSync(CALIBRATION_PATH) && process.env.IGNORE_CALIBRATION !== "1") {
    const cal = JSON.parse(fs.readFileSync(CALIBRATION_PATH, "utf8"));
    if (cal.boundaries) {
      DISPLAY_BOUNDARY = {};
      for (let kk = 1; kk <= 8; kk++) DISPLAY_BOUNDARY[kk] = cal.boundaries[kk];
      console.log(`고정 경계선(수동 지정) 사용:`, cal.boundaries);
    } else {
      const { A, G } = cal;
      DISPLAY_BOUNDARY = {};
      for (let kk = 1; kk <= 8; kk++) DISPLAY_BOUNDARY[kk] = A - G * (kk + 0.5);
      console.log(`고정 캘리브레이션 경계선 사용: A=${A.toFixed(0)}, G=${G.toFixed(1)}`);
    }
  }

  function displayTier(mmr) {
    for (let kk = 1; kk <= 8; kk++) {
      if (mmr >= DISPLAY_BOUNDARY[kk]) return String(kk);
    }
    return "Y";
  }
  for (const p of finalActive) p.tier = displayTier(p.mmr);
  for (const p of hidden) p.tier = displayTier(p.mmr);

  // ---- 표시 제외 인원 (계산 풀에는 유지, 출력에서만 제거) ----
  const rosterNames = new Set(players.map(p => String(p.name).trim()));
  const displayActive = finalActive.filter((p) => !EXCLUDED_PLAYER_NAMES.has(p.name) && rosterNames.has(p.name));
  const displayHidden = hidden.filter((p) => !EXCLUDED_PLAYER_NAMES.has(p.name) && rosterNames.has(p.name));

  // 균등 재배치(분위수 강제 분할) 폐기 — 지정 경계선을 무시하고 순위로 억지 배분해서
  // MMR 1250 초과인데 6티어로 표시되는 등 경계선과 어긋나는 왜곡이 있었음.
  // 이제 displayTier(고정 경계선) 결과를 그대로 사용한다.

  // ---- 관리자 수동 티어 고정 ----
  const ctEntry = displayActive.find(e => e.name === "클템");
  if (ctEntry) {
    ctEntry.mmr = 2200; // 2티어 하한 MMR
    ctEntry.tier = "2";
    ctEntry.note = "복귀자(재측정중) / 관리자 2티어 강제조정";
    ctEntry.returnBadgeUntil = ctEntry.countedMatches + PLACEMENT_GAMES;
  }
  
  const sijoEntry = displayActive.find(e => e.name === "시조새") || hidden.find(e => e.name === "시조새");
  if (sijoEntry) {
    sijoEntry.mmr = 1950; // 3티어 하한 MMR
    sijoEntry.tier = "3";
    sijoEntry.note = "관리자 3티어 강제조정";
    sijoEntry.lastMatchDate = dataMaxDate; // 임시휴면(흑백) 방지
    sijoEntry.isTemporaryDormant = false;
    if (hidden.includes(sijoEntry)) {
      hidden.splice(hidden.indexOf(sijoEntry), 1);
      displayActive.push(sijoEntry);
      sijoEntry.status = "active";
    }
  }

  for (const p of displayActive) {
    const original = players.find(x => x.name === p.name);
    if (original && original.tierCode) {
      const ogRank = rankOf(original.tierCode);
      const calcRank = rankOf(p.tier);
      if (calcRank > ogRank) {
        p.tier = original.tierCode;
        p.note = (p.note || "") + " / 관리자 하한선 보호";
      }
    }
    
    if (FORCED_TIER_OVERRIDES[p.name]) {
      p.tier = FORCED_TIER_OVERRIDES[p.name];
      p.note = (p.note || "") + " / 관리자고정";
    }
  }
  displayActive.sort((a, b) => {
    const rankDiff = rankOf(a.tier) - rankOf(b.tier);
    return rankDiff !== 0 ? rankDiff : b.mmr - a.mmr;
  });

  const tierCounts = {};
  for (const p of displayActive) tierCounts[p.tier] = (tierCounts[p.tier] || 0) + 1;

  console.log(`처리한 매치: ${processed} (데이터 최종일 ${dataMaxDate}, 휴면 기준 ${hiddenCutoff} 이전)`);
  console.log(`표시 대상: ${finalActive.length}, 휴면(숨김): ${hidden.length}, 배치 진행중: ${stillPlacement.length}`);
  console.log("티어 분포(표시 대상):", tierCounts);
  console.log("\n상위 15명:");
  for (const p of displayActive.slice(0, 15)) {
    console.log(
      `  ${p.mmr.toFixed(1).padStart(8)}  [${p.tier}] ${p.name} (${p.race}) - ${p.wins}승${p.losses}패 [${p.note}]`
    );
  }

  // active = 표시 대상(제외자 필터 + 균등재배치 + 수동고정 반영).
  // placement(배치중)는 데이터 유지용으로만 저장 — 디스플레이에는 노출하지 않음.
  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), cutoff: CUTOFF, dataMaxDate, hiddenCutoff, active: displayActive, hidden: displayHidden, placement: stillPlacement },
      null,
      2
    )
  );
  console.log(`\n저장: ${OUT_PATH}`);
}

main();

