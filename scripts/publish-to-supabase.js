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
  
  // 1. 관리자용 일일 업로드 (항상 실행)
  const rAdmin = await uploadPlainJson(BUCKET, "tiertable/mmr-result-admin.json", mmr);
  console.log(`[Admin] 업로드 완료: tiertable/mmr-result-admin.json (${rAdmin.size} bytes)`);

  // 2. 퍼블릭 업로드 (15일, 30일(또는 말일)에만 실행)
  // 한국 시간(KST) 기준으로 날짜 판별
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(now.getTime() + kstOffset);
  const day = kstDate.getUTCDate();
  
  // 다음날이 1일인지 판별 (말일 판별 로직: 2월 28/29일, 30일이 없는 달 등)
  const tomorrow = new Date(kstDate.getTime() + 24 * 60 * 60 * 1000);
  const isLastDay = tomorrow.getUTCDate() === 1;

  if (day === 15 || day === 30 || isLastDay) {
    const rPublic = await uploadPlainJson(BUCKET, "tiertable/mmr-result.json", mmr);
    console.log(`[Public] 업로드 완료: tiertable/mmr-result.json (${rPublic.size} bytes) - 오늘은 KST ${day}일입니다.`);
  } else {
    console.log(`[Public] 업로드 스킵: 오늘은 KST ${day}일입니다. (15일/30일/말일 아님)`);
  }
}

main().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});
