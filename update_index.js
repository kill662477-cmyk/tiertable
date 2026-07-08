const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');

c = c.replace(/const TIERS = \["1", "2", "3", "4", "5", "6", "7", "8", "Y"\];/g, 'const TIERS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "Y"];');

if (!c.includes('#tier-0{--acc:#ffaa00}')) {
    c = c.replace('#tier-1{--acc:#fff176}', '#tier-0{--acc:#ffaa00}\n#tier-1{--acc:#fff176}');
}

fs.writeFileSync('index.html', c);
