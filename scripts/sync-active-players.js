const fs = require('fs');
const path = require('path');

const mmrResultPath = path.join(__dirname, '..', 'data', 'mmr-result.json');
const indexPath = path.join(__dirname, '..', 'index.html');

const mmrResult = JSON.parse(fs.readFileSync(mmrResultPath, 'utf8'));

// 1. ACTIVE_PLAYERS
const activeNames = mmrResult.active.map(p => p.name);
// 2. TEMP_DORMANT_PLAYERS (isTemporaryDormant: true)
const tempDormantNames = mmrResult.active.filter(p => p.isTemporaryDormant).map(p => p.name);
// 3. RETURNEES
const returnees = mmrResult.active.filter(p => p.note && p.note.includes('복귀자(재측정중)')).map(p => p.name);

let indexContent = fs.readFileSync(indexPath, 'utf8');

// Inject ACTIVE_PLAYERS
const activePlayersArrayStr = JSON.stringify(activeNames);
const activePlayersCode = `\n/* 활성 선수 목록 (Supabase/players.json 기준) - 휴면 인원 필터링용 */\nconst ACTIVE_PLAYERS = new Set(${activePlayersArrayStr});\n`;

if (!indexContent.includes('const ACTIVE_PLAYERS = new Set')) {
    indexContent = indexContent.replace('const RACE_ORDER = ["T","Z","P"];', `${activePlayersCode}\nconst RACE_ORDER = ["T","Z","P"];`);
} else {
    indexContent = indexContent.replace(/const ACTIVE_PLAYERS = new Set\(\[.*?\]\);/s, `const ACTIVE_PLAYERS = new Set(${activePlayersArrayStr});`);
}

// Inject TEMP_DORMANT_PLAYERS
const tempDormantArrayStr = JSON.stringify(tempDormantNames);
const tempDormantCode = `const TEMP_DORMANT_PLAYERS = new Set(${tempDormantArrayStr});\n`;

if (!indexContent.includes('const TEMP_DORMANT_PLAYERS = new Set')) {
    indexContent = indexContent.replace('const RACE_ORDER = ["T","Z","P"];', `${tempDormantCode}const RACE_ORDER = ["T","Z","P"];`);
} else {
    indexContent = indexContent.replace(/const TEMP_DORMANT_PLAYERS = new Set\(\[.*?\]\);\n/s, tempDormantCode);
}

// Inject Returnee badges into BADGES object without removing manual ones
// Parse existing BADGES object
const badgeMatch = indexContent.match(/const BADGES = (\{[\s\S]*?\});/);
if (badgeMatch) {
    let badgesObj = {};
    try {
        // Evaluate the matched object
        badgesObj = eval('(' + badgeMatch[1] + ')');
    } catch(e) {}
    
    // Remove existing 'return' badges to refresh them
    for (const key in badgesObj) {
        if (badgesObj[key] === 'return') delete badgesObj[key];
    }
    // Add current returnees
    returnees.forEach(name => {
        badgesObj[name] = 'return';
    });
    
    const newBadgeStr = `const BADGES = ${JSON.stringify(badgesObj, null, 2)};`;
    indexContent = indexContent.replace(/const BADGES = \{[\s\S]*?\};/, newBadgeStr);
}

fs.writeFileSync(indexPath, indexContent);
console.log('Successfully applied dormant & returnee filtering logic to index.html');
