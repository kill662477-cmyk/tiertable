const fs = require('fs');

const finalTiersPath = '../data/final-tiers.json';
const playersJsonPath = 'C:/Users/silve/OneDrive/Desktop/MONSTARZNEW_PROJECT_REPOS_20260617-104902/monstarznew/data/manual/players.json';
const indexPath = '../index.html';

const tiers = JSON.parse(fs.readFileSync(finalTiersPath, 'utf8'));
const players = JSON.parse(fs.readFileSync(playersJsonPath, 'utf8'));

const photos = {};

// Create a map from name to image URL
const playerMap = {};
players.forEach(p => {
    playerMap[p.name] = p.image;
    // Handle aliases if any
    if (p.name === '얌지') playerMap['다예'] = p.image;
    if (p.name === '단비송') playerMap['단비송'] = p.image;
});

tiers.forEach(tier => {
    ['T', 'Z', 'P'].forEach(race => {
        if (tier[race]) {
            tier[race].forEach(name => {
                if (playerMap[name]) {
                    photos[name] = playerMap[name];
                }
            });
        }
    });
});

let indexContent = fs.readFileSync(indexPath, 'utf8');

// Replace const PHOTOS = {}; with const PHOTOS = { ... };
const photosJson = JSON.stringify(photos, null, 2);
indexContent = indexContent.replace(/const PHOTOS = \{[^}]*\};/g, `const PHOTOS = ${photosJson};`);

fs.writeFileSync(indexPath, indexContent);
console.log('Successfully injected photos into index.html');
