const fs = require('fs');
const playersPath = 'C:/Users/silve/OneDrive/Desktop/MONSTARZNEW_PROJECT_REPOS_20260617-104902/monstarznew/data/manual/players.json';
const players = JSON.parse(fs.readFileSync(playersPath, 'utf8'));

console.log(players.filter(p => p.name.includes("또아") || p.name.includes("유녜") || p.name.includes("임니더")).map(p => p.name + " (" + p.race + ")"));
