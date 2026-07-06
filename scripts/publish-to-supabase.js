// data/mmr-result.json (+ 있으면 photos.json)을 실제 배포 사이트가 읽는
// Supabase Storage 경로(calmsv-assets/tiertable/*)에 업로드한다.
const fs = require("fs");
const path = require("path");
const { loadMonstarznewEnv } = require("./lib/loadEnv");
loadMonstarznewEnv();
const { uploadGzJson } = require("./lib/supabaseStorage");

const BUCKET = "calmsv-assets";

function getConfig() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  return { url, serviceKey };
}

// 이 버킷은 비압축 원문 JSON을 그대로 쓰고 있어서(공개 GET 응답이 gzip이 아님),
// uploadGzJson(gzip 압축) 대신 평문 JSON을 그대로 올리는 함수를 따로 둔다.
async function uploadPlainJson(bucket, objectPath, data) {
  const cfg = getConfig();
  if (!cfg.url || !cfg.serviceKey) throw new Error("Supabase 환경변수 없음");
  const body = JSON.stringify(data);
  const res = await fetch(`${cfg.url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: cfg.serviceKey,
      Authorization: "Bearer " + cfg.serviceKey,
      "Content-Type": "application/json",
      "x-upsert": "true",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`upload_failed_${res.status}: ${text.slice(0, 300)}`);
  return { size: body.length };
}

async function main() {
  const mmrPath = path.join(__dirname, "..", "data", "mmr-result.json");
  const mmr = JSON.parse(fs.readFileSync(mmrPath, "utf8"));
  const r1 = await uploadPlainJson(BUCKET, "tiertable/mmr-result.json", mmr);
  console.log(`업로드 완료: tiertable/mmr-result.json (${r1.size} bytes)`);
}

main().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});
