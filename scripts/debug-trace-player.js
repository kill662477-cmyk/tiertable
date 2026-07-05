// 특정 선수(이름)의 경기별 델타 내역을 재생하며 추적 — 왜 하락했는지 원인 진단용.
const fs = require("fs");
const path = require("path");
const { buildSeedIndex, TIER_BASELINE_MMR } = require("./lib/seed");
const { kEffective, expectedScore } = require("./lib/elo");
const { RENAMED_TO_SEED_NAME } = require("./lib/aliases");

const TARGET_NAME = process.argv[2] || "히엉";

const MONSTARZNEW_ROOT = "C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew";
const players = require(path.join(MONSTARZNEW_ROOT, "data", "manual", "players.json"));

const MATCHES_PATH = path.join(__dirname, "..", "data", "matches.json");
const CUTOFF = "2024-04-10";
const RELIABLE_MIN_MATCHES = 10;

function buildSeedByUid() {
  const seedIndex = buildSeedIndex();
  const byNameRace = new Map();
  for (const p of players) byNameRace.set(`${String(p.name || "").trim()}:${p.race}`, p);
  const seedByUid = new Map();
  for (const [name, seed] of seedIndex.entries()) {
    const p = byNameRace.get(`${name}:${seed.race}`);
    if (!p || !p.userId) continue;
    seedByUid.set(`uid:${p.userId}`, { mmr: seed.initialMMR, tier: seed.tier, name, race: seed.race });
  }
  for (const [currentName, seedName] of Object.entries(RENAMED_TO_SEED_NAME)) {
    const seed = seedIndex.get(seedName);
    const p = players.find((x) => String(x.name || "").trim() === currentName);
    if (!seed || !p || !p.userId) continue;
    seedByUid.set(`uid:${p.userId}`, { mmr: seed.initialMMR, tier: seed.tier, name: currentName, race: p.race });
  }
  return seedByUid;
}

function deriveTier(mmr) {
  const order = [["1",2200],["2",2000],["3",1800],["4",1600],["5",1400],["6",1200],["7",1000],["8",800]];
  for (const [t, b] of order) if (mmr >= b) return t;
  return "Y";
}
function ratingFor(e) { return e.mmr != null ? e.mmr : 600; }
function isReliable(e) { return e.seeded === true || e.countedMatches >= RELIABLE_MIN_MATCHES; }

function main() {
  const { fileEarliest, matches: allMatches } = JSON.parse(fs.readFileSync(MATCHES_PATH, "utf8"));
  const matches = allMatches.filter((m) => m.bothSided);
  const seedByUid = buildSeedByUid();
  const registry = new Map();

  function ensure(key, name, race) {
    let e = registry.get(key);
    if (e) { e.name = name; return e; }
    if (seedByUid.has(key)) {
      const s = seedByUid.get(key);
      e = { mmr: s.mmr, tier: s.tier, status: "active", note: "시드", seeded: true };
    } else if (key.startsWith("uid:")) {
      const userId = key.slice(4);
      const earliest = fileEarliest[userId];
      if (earliest && earliest < CUTOFF) e = { mmr: null, tier: null, status: "placement", placementList: [], note: "복귀자" };
      else e = { mmr: 600, tier: "Y", status: "active", note: "신규" };
    } else {
      e = { mmr: 600, tier: "Y", status: "active", note: "임시" };
    }
    e.name = name; e.race = race; e.wins = 0; e.losses = 0; e.countedMatches = 0;
    registry.set(key, e);
    return e;
  }
  function finalize(e) {
    if (e.status !== "placement" || e.placementList.length < 10) return;
    const list = e.placementList;
    const wins = list.filter((x) => x.win).length;
    const losses = list.length - wins;
    const avg = list.reduce((s, x) => s + x.opponentRating, 0) / list.length;
    e.mmr = avg + (400 * (wins - losses)) / list.length;
    e.tier = deriveTier(e.mmr);
    e.status = "active";
    e.note = "복귀자확정";
  }

  const trace = [];
  for (const m of matches) {
    const w = ensure(m.winnerKey, m.winnerName, m.winnerRace);
    const l = ensure(m.loserKey, m.loserName, m.loserRace);
    w.countedMatches += 1; l.countedMatches += 1; w.wins += 1; l.losses += 1;

    const bothActive = w.status === "active" && l.status === "active";
    const bothPlacement = w.status === "placement" && l.status === "placement";
    const winnerRating = ratingFor(w), loserRating = ratingFor(l);
    const k = kEffective(m.multiplier);
    const baseDelta = k * (1 - expectedScore(winnerRating, loserRating));

    const isTargetWinner = w.name === TARGET_NAME;
    const isTargetLoser = l.name === TARGET_NAME;

    if (bothActive) {
      w.mmr += baseDelta; l.mmr -= baseDelta;
      if (isTargetWinner) trace.push({ date: m.date, vs: l.name, oppRating: loserRating.toFixed(0), result: "W", delta: +baseDelta.toFixed(2), newMmr: w.mmr.toFixed(1), oppNote: l.note });
      if (isTargetLoser) trace.push({ date: m.date, vs: w.name, oppRating: winnerRating.toFixed(0), result: "L", delta: -baseDelta.toFixed(2), newMmr: l.mmr.toFixed(1), oppNote: w.note });
    } else if (!bothPlacement) {
      const activeEntry = w.status === "active" ? w : l;
      const activeIsWinner = activeEntry === w;
      const halfDelta = baseDelta * 0.5;
      if (activeIsWinner) activeEntry.mmr += halfDelta; else activeEntry.mmr -= halfDelta;
      if (isReliable(activeEntry)) {
        const placementEntry = activeEntry === w ? l : w;
        placementEntry.placementList.push({ opponentRating: activeEntry.mmr, win: placementEntry === w });
      }
    }
    finalize(w); finalize(l);
  }

  const wins = trace.filter((t) => t.result === "W");
  const losses = trace.filter((t) => t.result === "L");
  console.log(`${TARGET_NAME}: 총 추적된 경기 ${trace.length} (활성상태 상대와의 경기만, 배치중 상대전은 제외됨)`);
  console.log(`승 ${wins.length}건 평균 획득 ${(wins.reduce((s, t) => s + t.delta, 0) / (wins.length || 1)).toFixed(2)}`);
  console.log(`패 ${losses.length}건 평균 손실 ${(losses.reduce((s, t) => s + t.delta, 0) / (losses.length || 1)).toFixed(2)}`);
  console.log(`총 순변동 ${trace.reduce((s, t) => s + t.delta, 0).toFixed(1)}`);

  // 상대 종류별(신규/시드/복귀자) 분해
  const byOppNote = {};
  for (const t of trace) {
    const k = t.oppNote || "?";
    if (!byOppNote[k]) byOppNote[k] = { w: 0, l: 0, sum: 0 };
    if (t.result === "W") byOppNote[k].w += 1; else byOppNote[k].l += 1;
    byOppNote[k].sum += t.delta;
  }
  console.log("\n상대 유형별 전적/순변동:");
  for (const [k, v] of Object.entries(byOppNote)) {
    console.log(`  vs ${k}: ${v.w}승${v.l}패, 순변동 ${v.sum.toFixed(1)}`);
  }

  console.log("\n가장 큰 손실 TOP 10:");
  losses.sort((a, b) => a.delta - b.delta).slice(0, 10).forEach((t) => {
    console.log(`  ${t.date} vs ${t.vs}(${t.oppNote}, ${t.oppRating}) ${t.delta}`);
  });

  if (process.env.DUMP_VS) {
    console.log(`\n--- vs ${process.env.DUMP_VS} 전체 경기 ---`);
    trace.filter((t) => t.oppNote === process.env.DUMP_VS).forEach((t) => {
      console.log(`  ${t.date} vs ${t.vs.padEnd(8)} 상대레이팅=${String(t.oppRating).padStart(5)} ${t.result} 델타=${t.delta.toString().padStart(7)} ->내MMR=${t.newMmr}`);
    });
  }
}

main();
