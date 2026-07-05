const players = require("C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew\\data\\manual\\players.json");
const hit = players.filter((x) => x.name && x.name.includes("람지"));
console.log(JSON.stringify(hit.map((x) => ({ name: x.name, race: x.race, userId: x.userId, tier: x.tier })), null, 2));
console.log("total", players.length);
