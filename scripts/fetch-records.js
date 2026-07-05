// Supabase Storage(tier-records/records/*.json.gz) 전체를 로컬 캐시로 내려받는다.
// 반복 계산 개발 중 매번 네트워크를 타지 않기 위한 캐시 용도.
// 사용: node scripts/fetch-records.js

const fs = require("fs");
const path = require("path");
const { loadMonstarznewEnv } = require("./lib/loadEnv");
loadMonstarznewEnv();
const { listObjects, downloadGzJson } = require("./lib/supabaseStorage");

const CACHE_DIR = path.join(__dirname, "..", "data", "raw-records");

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const objs = await listObjects("records/");
  console.log(`records/ 목록: ${objs.length}개 파일`);

  let ok = 0;
  let fail = 0;
  let totalRows = 0;

  for (let i = 0; i < objs.length; i++) {
    const obj = objs[i];
    const key = obj.name.replace(/\.json\.gz$/, "");
    try {
      const data = await downloadGzJson(`records/${obj.name}`);
      const rows = Array.isArray(data) ? data : [];
      fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(rows));
      totalRows += rows.length;
      ok += 1;
    } catch (e) {
      fail += 1;
      console.error(`  실패: ${obj.name} - ${e.message}`);
    }
    if ((i + 1) % 50 === 0) console.log(`  ...${i + 1}/${objs.length}`);
  }

  console.log(`완료: 성공 ${ok}, 실패 ${fail}, 총 전적행 ${totalRows}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
