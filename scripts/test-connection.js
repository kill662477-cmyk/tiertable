const { loadMonstarznewEnv } = require("./lib/loadEnv");
loadMonstarznewEnv();
const { listObjects } = require("./lib/supabaseStorage");

async function main() {
  const objs = await listObjects("records/");
  console.log("records/ 하위 객체 수:", objs.length);
  console.log("샘플 5개:", objs.slice(0, 5).map((o) => o.name));
}

main().catch((e) => {
  console.error("연결 실패:", e.message);
  process.exit(1);
});
