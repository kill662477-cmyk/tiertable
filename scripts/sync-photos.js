const fs = require("fs");
const path = require("path");
const { loadMonstarznewEnv } = require("./lib/loadEnv");
loadMonstarznewEnv();

const BUCKET = "calmsv-assets";
const PHOTOS_OBJECT = "tiertable/photos.json";

function getConfig() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  return { url, serviceKey };
}

async function fetchCurrentPhotos() {
  const cfg = getConfig();
  try {
    const res = await fetch(`${cfg.url}/storage/v1/object/public/${BUCKET}/${PHOTOS_OBJECT}?t=${Date.now()}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.log("기존 photos.json 로드 실패, 빈 객체로 시작합니다.");
  }
  return {};
}

async function uploadPhotos(data) {
  const cfg = getConfig();
  if (!cfg.url || !cfg.serviceKey) throw new Error("Supabase 환경변수 없음");
  const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${PHOTOS_OBJECT}`, {
    method: "POST",
    headers: {
      apikey: cfg.serviceKey,
      Authorization: "Bearer " + cfg.serviceKey,
      "Content-Type": "application/json",
      "x-upsert": "true",
    },
    body: JSON.stringify(data, null, 2)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload Failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function scrapeEloboardImage(url) {
  try {
    const res = await fetch(url);
    const html = await res.text();
    const match = html.match(/<img[^>]+src=[\`"']([^>]+data\/file\/(?:bj_list|bj_m_list)[^>]+)[\`"'][^>]*>/i);
    if (match && match[1]) {
      return match[1].split('"')[0].split("'")[0];
    }
  } catch (e) {
    // Ignore fetch errors
  }
  return null;
}

async function main() {
  const playersPath = path.join(__dirname, "..", "data", "players.json");
  if (!fs.existsSync(playersPath)) {
    console.log("players.json 없음");
    return;
  }
  const players = JSON.parse(fs.readFileSync(playersPath, "utf8"));
  
  let photos = await fetchCurrentPhotos();
  let updated = 0;

  for (const p of players) {
    if (p.elo && p.elo.trim() !== "") {
      const currentPhoto = photos[p.name] || "";
      // 아프리카TV 프사(sooplive.com, afreecatv.com)이거나 사진이 없는 경우
      if (!currentPhoto || currentPhoto.includes("sooplive.com") || currentPhoto.includes("afreecatv.com")) {
        console.log(`${p.name} eloboard 이미지 찾는 중...`);
        const eloImg = await scrapeEloboardImage(p.elo);
        if (eloImg) {
          photos[p.name] = eloImg;
          updated++;
          console.log(`  => 찾음: ${eloImg}`);
        } else {
          console.log(`  => 실패`);
        }
        await new Promise(r => setTimeout(r, 500)); // 속도 제한
      }
    }
  }

  if (updated > 0) {
    await uploadPhotos(photos);
    console.log(`\n[Photos] ${updated}명의 사진을 Eloboard 이미지로 업데이트 완료!`);
  } else {
    console.log("\n[Photos] 업데이트할 사진이 없습니다.");
  }
}

main().catch(console.error);
