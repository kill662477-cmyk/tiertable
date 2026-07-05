const https = require('https');

https.get('https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=28', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        // use regex to find img tags
        const imgRegex = /<img[^>]+src="([^">]+)"/g;
        let match;
        while ((match = imgRegex.exec(data)) !== null) {
            console.log(match[1]);
        }
    });
}).on('error', err => console.log('Error: ', err.message));
