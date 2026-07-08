const fs = require('fs');

let c = fs.readFileSync('scripts/calc-mmr.js', 'utf8');

// 1. Change CUTOFF
c = c.replace(/const CUTOFF = "[^"]+";/, 'const CUTOFF = "2025-09-30";');

// 2. Change TIER_RANK_ORDER
c = c.replace(/const TIER_RANK_ORDER = \[[^\]]+\];/, 'const TIER_RANK_ORDER = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "Y"];');

// 3. Fix DISPLAY_BOUNDARY loop to include 0
c = c.replace(/for \(let kk = 1; kk <= 8; kk\+\+\) DISPLAY_BOUNDARY\[kk\] = cal\.boundaries\[kk\];/g, 
              'for (let kk = 0; kk <= 8; kk++) DISPLAY_BOUNDARY[kk] = cal.boundaries[kk];');
c = c.replace(/for \(let kk = 1; kk <= 8; kk\+\+\) DISPLAY_BOUNDARY\[kk\] = A - G \* \(kk \+ 0\.5\);/g, 
              'for (let kk = 0; kk <= 8; kk++) DISPLAY_BOUNDARY[kk] = A - G * (kk + 0.5);');

// 4. Update the placement logic
const oldPlacementBlock = `    } else {
      // 한쪽만 placement: 배치중 상대와 맞붙은 active측 변동은 절반으로 보호
      const activeEntry = w.status === "active" ? w : l;
      const activeIsWinner = activeEntry === w;
      const halfDelta = baseDelta * 0.5;
      if (activeIsWinner) activeEntry.mmr += halfDelta;
      else activeEntry.mmr = clampFloor(activeEntry.mmr - halfDelta);`;

const newPlacementBlock = `    } else {
      // 한쪽만 placement: 배치중 상대(장기휴면/신규)와 맞붙은 active측 변동 보호
      // 상대와 동일한 MMR(승률 50%)이라고 간주하여 점수 변동
      const activeEntry = w.status === "active" ? w : l;
      const activeIsWinner = activeEntry === w;
      const safeDelta = k * 0.5 * repeatDamping;
      if (activeIsWinner) activeEntry.mmr += safeDelta;
      else activeEntry.mmr = clampFloor(activeEntry.mmr - safeDelta);`;

c = c.replace(oldPlacementBlock, newPlacementBlock);

// 5. Add applySoftReset() call to the loop when passing the reset date
// First, find where date changes. We can do it where match date is processed.
const resetLogicOld = `  console.log(\`소프트리셋 총 \${resetEvents}회 적용됨\`);`;
const resetLogicCheck = `
    // Check if we need to apply soft reset before processing this match
    while (m.date >= nextResetDate) {
      applySoftReset();
      resetEvents += 1;
      nextResetDate = addMonths(nextResetDate, 6);
    }
`;

// Insert the check into the match loop
// Find `for (const m of filteredMatches) {`
c = c.replace('for (const m of filteredMatches) {', 'for (const m of filteredMatches) {' + resetLogicCheck);

fs.writeFileSync('scripts/calc-mmr.js', c);
