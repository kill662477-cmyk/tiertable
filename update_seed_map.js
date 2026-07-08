const fs = require('fs');
let c = fs.readFileSync('scripts/lib/seed.js', 'utf8');

c = c.replace(/const index = \{\};/, 'const index = new Map();');
c = c.replace(/index\[p\] =/g, 'index.set(p,');
c = c.replace(/initialMMR: TIER_BASELINE_MMR\[t.id\] \};/g, 'initialMMR: TIER_BASELINE_MMR[t.id] });');

fs.writeFileSync('scripts/lib/seed.js', c);
