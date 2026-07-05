const fs = require('fs');
const playersPath = 'C:/Users/silve/OneDrive/Desktop/MONSTARZNEW_PROJECT_REPOS_20260617-104902/monstarznew/data/manual/players.json';
const players = JSON.parse(fs.readFileSync(playersPath, 'utf8'));

const targets = ["진서랄까", "타마양", "온도이", "또아임니더", "김바다", "떠아", "낭니", "묘묘묫", "여지니", "휘연", "봄덕이", "하윤", "이아라", "유녜"];

const found = {};
targets.forEach(t => {
    const p = players.find(player => player.name === t);
    if (p) found[t] = p.race;
    else found[t] = "UNKNOWN";
});

console.log(JSON.stringify(found, null, 2));
