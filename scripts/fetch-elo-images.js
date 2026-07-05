const fs = require('fs');
const https = require('https');
const http = require('http');

const finalTiersPath = '../data/final-tiers.json';
const playersJsonPath = 'C:/Users/silve/OneDrive/Desktop/MONSTARZNEW_PROJECT_REPOS_20260617-104902/monstarznew/data/manual/players.json';
const indexPath = '../index.html';

const tiers = JSON.parse(fs.readFileSync(finalTiersPath, 'utf8'));
const players = JSON.parse(fs.readFileSync(playersJsonPath, 'utf8'));

// Extract all tier player names
const tierNames = new Set();
tiers.forEach(tier => {
    ['T', 'Z', 'P'].forEach(race => {
        if (tier[race]) {
            tier[race].forEach(name => tierNames.add(name));
        }
    });
});

// Map players to elo urls and fallback images
const playerEloMap = {};
const playerFallbackMap = {};
players.forEach(p => {
    if (tierNames.has(p.name)) {
        playerEloMap[p.name] = p.elo;
        playerFallbackMap[p.name] = p.image;
    }
    if (p.name === '얌지' && tierNames.has('다예')) {
        playerEloMap['다예'] = p.elo;
        playerFallbackMap['다예'] = p.image;
    }
    if (p.name === '단비송' && tierNames.has('단비송')) {
        playerEloMap['단비송'] = p.elo;
        playerFallbackMap['단비송'] = p.image;
    }
});

const getHtml = (url) => {
    return new Promise((resolve, reject) => {
        if (!url) return resolve(null);
        const req = url.startsWith('https') ? https : http;
        req.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', err => reject(err));
    });
};

const extractEloImage = (html) => {
    if (!html) return null;
    // Usually it's an img tag where src includes data/file/bj_list/ or data/file/bj_m_list/
    const imgRegex = /<img[^>]+src=["']([^"']+(?:data\/file\/bj_list|data\/file\/bj_m_list|data\/member_image)\/[^"']+)["']/g;
    let match = imgRegex.exec(html);
    if (match) {
        let url = match[1];
        if (url.startsWith('/')) {
            url = 'https://eloboard.com' + url;
        }
        return url;
    }
    return null;
};

async function main() {
    const photos = {};
    const names = Array.from(tierNames);
    console.log(`Need to fetch images for ${names.length} players...`);
    
    // Process in batches of 10
    for (let i = 0; i < names.length; i += 10) {
        const batch = names.slice(i, i + 10);
        await Promise.all(batch.map(async (name) => {
            const eloUrl = playerEloMap[name];
            if (eloUrl) {
                try {
                    const html = await getHtml(eloUrl);
                    const imgUrl = extractEloImage(html);
                    if (imgUrl) {
                        photos[name] = imgUrl;
                    } else {
                        console.log(`No image found in HTML for ${name} at ${eloUrl}. Using fallback.`);
                        if (playerFallbackMap[name]) photos[name] = playerFallbackMap[name];
                    }
                } catch (e) {
                    console.log(`Error fetching ${name}: ${e.message}. Using fallback.`);
                    if (playerFallbackMap[name]) photos[name] = playerFallbackMap[name];
                }
            } else {
                console.log(`No elo URL for ${name}. Using fallback.`);
                if (playerFallbackMap[name]) photos[name] = playerFallbackMap[name];
            }
        }));
        process.stdout.write(`\rProcessed ${Math.min(i + 10, names.length)} / ${names.length}`);
    }
    console.log('\nDone fetching images.');

    let indexContent = fs.readFileSync(indexPath, 'utf8');
    const photosJson = JSON.stringify(photos, null, 2);
    indexContent = indexContent.replace(/const PHOTOS = \{[^}]*\};/g, `const PHOTOS = ${photosJson};`);
    fs.writeFileSync(indexPath, indexContent);
    console.log('Successfully injected eloboard photos into index.html');
}

main();
