const fs = require('fs');
const playersPath = 'C:/Users/silve/OneDrive/Desktop/MONSTARZNEW_PROJECT_REPOS_20260617-104902/monstarznew/data/players.json';
const data = JSON.parse(fs.readFileSync(playersPath, 'utf8'));
console.log(Object.keys(data.meta));
console.log("Is 우리밍 visible?", data.players.some(p => p.name === "우리밍"));
console.log("Is 한쪼니 visible?", data.players.some(p => p.name === "한쪼니"));
