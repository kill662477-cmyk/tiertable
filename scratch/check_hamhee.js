const fs = require('fs');
async function run() {
    const res = await fetch('https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=1023');
    const text = await res.text();
    const imgs = [];
    const regex = /<img[^>]+src=[\"\']([^\"\']+)[\"\']/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
        imgs.push(match[1]);
    }
    console.log(imgs);
}
run();
