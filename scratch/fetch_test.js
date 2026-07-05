const url1 = 'https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=475'; // 지두두
const url2 = 'https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=715'; // 뚜비
const url3 = 'https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=1023'; // 햄희

async function fetchAndLog(name, url) {
    const res = await fetch(url);
    const text = await res.text();
    const imgs = [];
    const regex = /<img[^>]+src=[\"\']([^\"\']+)[\"\']/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
        if (match[1].includes('data/file/')) {
            imgs.push(match[1]);
        }
    }
    console.log(name, imgs);
}

async function run() {
    await fetchAndLog('지두두', url1);
    await fetchAndLog('뚜비', url2);
    await fetchAndLog('햄희', url3);
}

run();
