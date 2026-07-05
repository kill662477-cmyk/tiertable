// calc-mmr.js와 완전히 동일한 Elo 계산 위에 "승급전(3판2선승) + 강등(4조건)" 게이트를 얹은 버전.
// 차이점: 표시 티어(displayTier)가 raw MMR을 즉시 따라가지 않고, 아래 게이트를 통과해야만 바뀐다.
//   - 승급: MMR이 상위 경계선+30 도달 && 현재 티어 15경기 이상 && 누적 10경기 이상
//           → 3판 진행, 2승 시 승급 확정 / 2패 시 실패(10경기 쿨다운 + MMR을 경계선-20으로 조정)
//   - 강등: 하한 미달 30일 이상 지속 && 미달중 10경기 이상 && 유예 소진 && 하한보다 50점 이상 깊은 미달
//           (4개 동시 충족happens해야 강등, 1티어만 하락)
// 결과는 data/mmr-result-gated.json, data/전체명단-승강제.txt 로 별도 저장 (기존 순수계산 결과는 안 건드림).

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
const OUT_PATH = path.join(__dirname, "..", "data", "mmr-result-gated.json");
const CUTOFF = "2024-04-10";
const PLACEMENT_GAMES = 10;
const FALLBACK_UNRATED_MMR = 600;
const RELIABLE_MIN_MATCHES = 10;
const SAME_TIER_GAP_DAMPING = 0.5;
const NEWCOMER_CONVERGENCE_GAMES = 30;
const NEWCOMER_GUARD_DAMPING = 0.4;
const UPSET_LOSS_DAMPING = 0.7;
const REPEAT_FULL_GAMES = 3;
const REPEAT_HALF_GAMES = 6;
const REPEAT_HALF_DAMPING = 0.5;
const REPEAT_TAIL_DAMPING = 0.2;
const INACTIVE_MONTHS = 3;
const RESET_INTERVAL_MONTHS = 6;
const RESET_COMPRESSION = 0.7;
const TIER_RANK_ORDER = ["1", "2", "3", "4", "5", "6", "7", "8", "Y"];

// ---- 승급전/강등 게이트 파라미터 ----
const PROMO_MARGIN = 30; // 상위 경계선 + 이만큼 넘어야 승급전 자격
const PROMO_MIN_GAMES_IN_TIER = 15;
const PROMO_MIN_TOTAL_GAMES = 10;
const PROMO_SERIES_GAMES = 3; // 3판 2선승
const PROMO_SERIES_WINS_NEEDED = 2;
const PROMO_WIN_MULT = 0.5; // 승급전 중 승리 시 절반만 획득
const PROMO_LOSS_MULT = 1.5; // 승급전 중 패배 시 1.5배 손실
const PROMO_FAIL_COOLDOWN_GAMES = 10;
const PROMO_FAIL_MMR_OFFSET = -20; // 실패 시 경계선-20으로 조정

const RELEGATION_DAYS = 30;
const RELEGATION_MIN_GAMES_BELOW = 10;
const RELEGATION_PROTECTION_START = 3;
const RELEGATION_DEPTH_MARGIN = 50; // 하한보다 이만큼 더 깊이 미달해야 강등 대상

function repeatDampingFor(gamesToday) {
  if (gamesToday <= REPEAT_FULL_GAMES) return 1;
  if (gamesToday <= REPEAT_HALF_GAMES) return REPEAT_HALF_DAMPING;
  return REPEAT_TAIL_DAMPING;
}

function isConverging(entry) {
  if (entry.seeded) return false;
  if (String(entry.note || "").includes("배치확정")) return false;
  return entry.countedMatches < NEWCOMER_CONVERGENCE_GAMES;
}

function isReliable(entry) {
  return entry.seeded === true || entry.countedMatches >= RELIABLE_MIN_MATCHES;
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function rankOf(tier) {
  return TIER_RANK_ORDER.indexOf(tier);
}
function tierAtRank(rank) {
  const clamped = Math.max(0, Math.min(TIER_RANK_ORDER.length - 1, rank));
  return TIER_RANK_ORDER[clamped];
}

function buildSeedByUid(seedInjectionMmr) {
  const seedIndex = buildSeedIndex();
  const byNameRace = new Map();
  for (const p of players) byNameRace.set(`${String(p.name || "").trim()}:${p.race}`, p);
  const seedByUid = new Map();
  let matched = 0;
  for (const [name, seed] of seedIndex.entries()) {
    const p = byNameRace.get(`${name}:${seed.race}`);
    if (!p || !p.userId) continue;
    seedByUid.set(`uid:${p.userId}`, { mmr: seedInjectionMmr(seed.tier), tier: seed.tier, name, race: seed.race });
    matched += 1;
  }
  for (const [currentName, seedName] of Object.entries(RENAMED_TO_SEED_NAME)) {
    const seed = seedIndex.get(seedName);
    const p = players.find((x) => String(x.name || "").trim() === currentName);
    if (!seed || !p || !p.userId) continue;
    seedByUid.set(`uid:${p.userId}`, { mmr: seedInjectionMmr(seed.tier), tier: seed.tier, name: currentName, race: p.race });
  }
  for (const [userId, seedName] of Object.entries(DIRECT_UID_SEED_OVERRIDES)) {
    const seed = seedIndex.get(seedName);
    if (!seed) continue;
    seedByUid.set(`uid:${userId}`, { mmr: seedInjectionMmr(seed.tier), tier: seed.tier, name: seedName, race: seed.race });
  }
  console.log(`시드 매칭: ${matched}명`);
  return seedByUid;
}

const BOUNDARY = { ...TIER_BASELINE_MMR };
const CALIBRATION_PATH = path.join(__dirname, "..", "data", "calibration.json");
let DISPLAY_BOUNDARY = BOUNDARY;
if (fs.existsSync(CALIBRATION_PATH)) {
  const cal = JSON.parse(fs.readFileSync(CALIBRATION_PATH, "utf8"));
  DISPLAY_BOUNDARY = {};
  if (cal.boundaries) {
    for (let k = 1; k <= 8; k++) DISPLAY_BOUNDARY[k] = cal.boundaries[k];
  } else {
    for (let k = 1; k <= 8; k++) DISPLAY_BOUNDARY[k] = cal.A - cal.G * (k + 0.5);
  }
}
console.log("표시 경계선(게이트용):", DISPLAY_BOUNDARY);

function rawTierOf(mmr) {
  for (let k = 1; k <= 8; k++) {
    if (mmr >= DISPLAY_BOUNDARY[k]) return String(k);
  }
  return "Y";
}
function lowerBoundOf(tier) {
  if (tier === "Y") return -Infinity;
  return DISPLAY_BOUNDARY[Number(tier)];
}
function upperNeighborLowerBound(tier) {
  // 현재 티어보다 한 단계 위 티어의 하한 (승급 목표선). 1티어는 승급 목표 없음.
  const k = tier === "Y" ? 9 : Number(tier);
  const targetK = k - 1;
  if (targetK < 1) return Infinity; // 이미 최상위
  return DISPLAY_BOUNDARY[targetK];
}

const TIER_WIDTH = BOUNDARY[7] - BOUNDARY[8];
const MMR_FLOOR = 600;
function clampFloor(mmr) {
  return Math.max(MMR_FLOOR, mmr);
}
function seedInjectionMmr(tier) {
  if (tier === "Y") return TIER_BASELINE_MMR.Y;
  return TIER_BASELINE_MMR[Number(tier)];
}
function ratingFor(entry) {
  return entry.mmr != null ? entry.mmr : FALLBACK_UNRATED_MMR;
}

function main() {
  const { fileEarliest, matches: allMatches } = JSON.parse(fs.readFileSync(MATCHES_PATH, "utf8"));
  const matches = allMatches.filter((m) => m.bothSided);
  const seedByUid = buildSeedByUid(seedInjectionMmr);
  const registry = new Map();

  function ensure(key, name, race, meetingRating) {
    let e = registry.get(key);
    if (e) {
      e.name = name;
      return e;
    }
    if (seedByUid.has(key)) {
      const s = seedByUid.get(key);
      e = { mmr: s.mmr, status: "active", note: "시드(2024.04)", seeded: true, displayTier: s.tier };
    } else if (key.startsWith("uid:")) {
      const userId = key.slice(4);
      const earliest = fileEarliest[userId];
      const forced = FORCE_RETURNEE_NAMES.has(name);
      if ((earliest && earliest < CUTOFF) || forced) {
        e = { mmr: null, status: "placement", placementList: [], note: "복귀자(배치중)" };
      } else {
        e = { mmr: null, status: "placement", placementList: [], note: "신규(배치중)" };
      }
    } else {
      const initMmr = meetingRating != null ? meetingRating : FALLBACK_UNRATED_MMR;
      e = { mmr: initMmr, status: "active", note: "임시추적(비크롤링 상대)", displayTier: rawTierOf(initMmr) };
    }
    e.name = name;
    e.race = race;
    e.wins = 0;
    e.losses = 0;
    e.countedMatches = 0;
    // 게이트 상태
    e.gamesInTier = 0;
    e.promoSeries = null; // { wins, losses }
    e.promoCooldownUntil = 0;
    e.belowSince = null;
    e.belowGames = 0;
    e.protection = RELEGATION_PROTECTION_START;
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
    entry.displayTier = rawTierOf(perf); // 배치 확정 시점엔 즉시 그 티어로 게시(설계서 §7 — 즉시 반영)
    entry.gamesInTier = 0;
    entry.status = "active";
    entry.note = entry.note === "신규(배치중)" ? "신규(배치확정)" : "복귀자(배치확정)";
    entry.placementSnapshot = list.slice();
  }

  function applySoftReset() {
    let count = 0;
    for (const e of registry.values()) {
      if (e.status !== "active") continue;
      const rawTier = rawTierOf(e.mmr);
      const baseline = rawTier === "Y" ? BOUNDARY[8] - (BOUNDARY[7] - BOUNDARY[8]) : DISPLAY_BOUNDARY[rawTier];
      e.mmr = baseline + (e.mmr - baseline) * RESET_COMPRESSION;
      // 소프트리셋은 raw MMR만 압축 — displayTier는 게이트를 거쳐야 바뀌므로 여기서 안 건드림
      count += 1;
    }
    return count;
  }

  // ---- 승급/강등 게이트 판정 (매 경기 후, 해당 선수에 대해 호출) ----
  function evaluateGates(e, matchIndex) {
    if (e.status !== "active") return;
    e.gamesInTier += 1;
    const curLower = lowerBoundOf(e.displayTier);
    const targetLower = upperNeighborLowerBound(e.displayTier);

    // --- 승급 진행 중이면 시리즈 결과만 체크 (별도 승/패 카운트는 evaluateGates 호출 시점에 알 수 없으므로
    //     매치 루프에서 result를 넘겨받아 처리한다 — 아래 processSeriesResult 참고) ---

    // --- 강등 추적 ---
    const isBelow = e.mmr < curLower;
    if (isBelow) {
      if (e.belowSince == null) e.belowSince = e.lastMatchDate;
      e.belowGames += 1;
    } else {
      e.belowSince = null;
      e.belowGames = 0;
      e.protection = RELEGATION_PROTECTION_START;
    }

    if (
      e.belowSince != null &&
      e.lastMatchDate >= addDays(e.belowSince, RELEGATION_DAYS) &&
      e.belowGames >= RELEGATION_MIN_GAMES_BELOW &&
      e.protection <= 0 &&
      e.mmr <= curLower - RELEGATION_DEPTH_MARGIN &&
      e.displayTier !== "8" // 8티어 아래는 유스(게이트 없이 raw로 표시)
    ) {
      e.displayTier = tierAtRank(rankOf(e.displayTier) + 1);
      e.gamesInTier = 0;
      e.belowSince = null;
      e.belowGames = 0;
      e.protection = RELEGATION_PROTECTION_START;
      e.gateLog = (e.gateLog || []).concat(`강등@${e.lastMatchDate}`);
    }

    // --- 승급 자격 체크 (시리즈 시작) ---
    if (
      e.promoSeries == null &&
      matchIndex >= e.promoCooldownUntil &&
      e.mmr >= targetLower + PROMO_MARGIN &&
      e.gamesInTier >= PROMO_MIN_GAMES_IN_TIER &&
      e.countedMatches >= PROMO_MIN_TOTAL_GAMES &&
      targetLower !== Infinity
    ) {
      e.promoSeries = { wins: 0, losses: 0, games: 0 };
    }
  }

  // 승급전 진행 중인 선수가 이번 매치에서 이겼는지/졌는지 반영
  function processSeriesResult(e, won, matchIndex) {
    if (e.status !== "active" || !e.promoSeries) return;
    e.promoSeries.games += 1;
    if (won) e.promoSeries.wins += 1;
    else e.promoSeries.losses += 1;

    if (e.promoSeries.wins >= PROMO_SERIES_WINS_NEEDED) {
      // 승급 확정
      e.displayTier = tierAtRank(rankOf(e.displayTier) - 1);
      e.gamesInTier = 0;
      e.promoSeries = null;
      e.gateLog = (e.gateLog || []).concat(`승급@${e.lastMatchDate}`);
    } else if (e.promoSeries.losses > PROMO_SERIES_GAMES - PROMO_SERIES_WINS_NEEDED || e.promoSeries.games >= PROMO_SERIES_GAMES) {
      // 실패 (2패 이상 확정적으로 못 이김, 또는 3판 다 소진)
      e.promoCooldownUntil = matchIndex + PROMO_FAIL_COOLDOWN_GAMES;
      // Y티어 하한은 -Infinity라 그대로 더하면 -Infinity(JSON에서 null)가 되므로 바닥으로 클램프
      e.mmr = clampFloor(lowerBoundOf(e.displayTier) + PROMO_FAIL_MMR_OFFSET);
      e.promoSeries = null;
      e.gateLog = (e.gateLog || []).concat(`승급실패@${e.lastMatchDate}`);
    }
  }

  let nextResetDate = addMonths(CUTOFF, RESET_INTERVAL_MONTHS);
  let resetEvents = 0;
  let repeatDate = null;
  let repeatCounts = new Map();
  let processed = 0;

  for (const m of matches) {
    while (m.date >= nextResetDate) {
      const n = applySoftReset();
      resetEvents += 1;
      nextResetDate = addMonths(nextResetDate, RESET_INTERVAL_MONTHS);
    }

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

    for (const e of [w, l]) {
      if (e.status === "active" && e.lastMatchDate && m.date >= addMonths(e.lastMatchDate, INACTIVE_MONTHS)) {
        e.note = "복귀자(재측정중)";
        e.returnBadgeUntil = e.countedMatches + PLACEMENT_GAMES;
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
    const winnerRatingForCalc = ratingFor(w);
    const loserRatingForCalc = ratingFor(l);
    const k = kEffective(m.multiplier);

    const sameTier = rawTierOf(winnerRatingForCalc) === rawTierOf(loserRatingForCalc);
    const gapDamping = sameTier ? SAME_TIER_GAP_DAMPING : 1;
    const dampedLoserRating = winnerRatingForCalc + (loserRatingForCalc - winnerRatingForCalc) * gapDamping;

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
      const wDamping = isConverging(l) && !isConverging(w) ? NEWCOMER_GUARD_DAMPING : 1;
      let lDamping = isConverging(w) && !isConverging(l) ? NEWCOMER_GUARD_DAMPING : 1;
      const loserIsHigherTier = rankOf(rawTierOf(loserRatingForCalc)) < rankOf(rawTierOf(winnerRatingForCalc));
      if (loserIsHigherTier) lDamping *= UPSET_LOSS_DAMPING;

      // 승급전 중이면 승리 절반/패배 1.5배 추가 배율
      const wPromoMult = w.promoSeries ? PROMO_WIN_MULT : 1;
      const lPromoMult = l.promoSeries ? PROMO_LOSS_MULT : 1;

      w.mmr += baseDelta * wDamping * wPromoMult;
      l.mmr = clampFloor(l.mmr - baseDelta * lDamping * lPromoMult);
    } else if (bothPlacement) {
      // 통계만 반영, mmr 변경 없음
    } else {
      const activeEntry = w.status === "active" ? w : l;
      const activeIsWinner = activeEntry === w;
      const halfDelta = baseDelta * 0.5;
      const promoMult = activeEntry.promoSeries ? (activeIsWinner ? PROMO_WIN_MULT : PROMO_LOSS_MULT) : 1;
      if (activeIsWinner) activeEntry.mmr += halfDelta * promoMult;
      else activeEntry.mmr = clampFloor(activeEntry.mmr - halfDelta * promoMult);

      if (isReliable(activeEntry)) {
        const placementEntry = activeEntry === w ? l : w;
        placementEntry.placementList.push({ opponentRating: activeEntry.mmr, win: placementEntry === w });
      }
    }

    finalizePlacementIfReady(w);
    finalizePlacementIfReady(l);

    // 게이트 판정 (active 상태인 쪽만, 순서: 승급전 결과 반영 -> 강등/승급자격 갱신)
    if (bothActive) {
      processSeriesResult(w, true, processed);
      processSeriesResult(l, false, processed);
      evaluateGates(w, processed);
      evaluateGates(l, processed);
    }

    processed += 1;
  }

  console.log(`소프트리셋 총 ${resetEvents}회 적용됨`);

  const dataMaxDate = matches.length ? matches[matches.length - 1].date : CUTOFF;
  const hiddenCutoff = addMonths(dataMaxDate, -INACTIVE_MONTHS);

  const finalActive = [];
  const hidden = [];
  const stillPlacement = [];
  for (const [key, e] of registry.entries()) {
    if (e.status === "active") {
      const record = { key, ...e, tier: e.displayTier };
      if (e.lastMatchDate && e.lastMatchDate < hiddenCutoff) hidden.push(record);
      else finalActive.push(record);
    } else {
      stillPlacement.push({ key, ...e, placementProgress: `${e.placementList.length}/${PLACEMENT_GAMES}` });
    }
  }
  finalActive.sort((a, b) => b.mmr - a.mmr);
  hidden.sort((a, b) => b.mmr - a.mmr);

  const displayActive = finalActive.filter((p) => !EXCLUDED_PLAYER_NAMES.has(p.name));
  const displayHidden = hidden.filter((p) => !EXCLUDED_PLAYER_NAMES.has(p.name));

  for (const p of displayActive) {
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

  console.log(`처리한 매치: ${processed}`);
  console.log(`표시 대상: ${displayActive.length}, 휴면: ${displayHidden.length}, 배치중: ${stillPlacement.length}`);
  console.log("티어 분포(게이트 적용):", tierCounts);

  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), cutoff: CUTOFF, dataMaxDate, hiddenCutoff, active: displayActive, hidden: displayHidden, placement: stillPlacement },
      null,
      2
    )
  );
  console.log(`저장: ${OUT_PATH}`);
}

main();
