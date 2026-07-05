const players = require("C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew\\data\\manual\\players.json");
const byTier = {};
for (const p of players) {
  const t = p.tier || "(없음)";
  if (!byTier[t]) byTier[t] = [];
  byTier[t].push(p.name);
}
for (const [t, names] of Object.entries(byTier).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${t} (${names.length}명):`, names.slice(0, 6).join(", "), names.length > 6 ? "..." : "");
}
