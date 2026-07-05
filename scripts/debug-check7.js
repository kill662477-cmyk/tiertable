const { buildSeedIndex, TIER_BASELINE_MMR } = require("./lib/seed");
const idx = buildSeedIndex();
console.log("햇살 시드:", idx.get("햇살"));
const seed = idx.get("햇살");
const k = Number(seed.tier);
const TIER_WIDTH = TIER_BASELINE_MMR[7] - TIER_BASELINE_MMR[8];
const lower = TIER_BASELINE_MMR[k];
const upper = k === 1 ? TIER_BASELINE_MMR[1] + TIER_WIDTH : TIER_BASELINE_MMR[k - 1];
console.log("주입 MMR(중앙값):", (lower + upper) / 2, "( tier", k, "구간", lower, "~", upper, ")");
