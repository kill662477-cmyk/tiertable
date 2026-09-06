const fs = require("fs");
const path = require("path");
const { loadMonstarznewEnv } = require("./lib/loadEnv");
loadMonstarznewEnv();

const BUCKET = "calmsv-assets";
const PHOTOS_OBJECT = "tiertable/photos.json";
const ELOBOARD_ORIGIN = "https://eloboard.com";
const ELOBOARD_API = "https://eloboard.com/api";
// Profile images are served from the .co.kr host, not the site origin.
const ELOBOARD_IMAGE_ORIGIN = "https://eloboard.co.kr/static/";

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

function absolutizePhotoUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("//")) return "https:" + value;
  if (value.startsWith("/")) return ELOBOARD_ORIGIN + value;
  return value;
}

function normalizeExistingPhotos(photos) {
  let updated = 0;
  for (const [name, url] of Object.entries(photos)) {
    const normalized = absolutizePhotoUrl(url);
    if (normalized && normalized !== url) {
      photos[name] = normalized;
      updated++;
    }
  }
  return updated;
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

// eloboard moved to a Next.js app, so the old profile HTML no longer carries a
// data/file/bj_list image tag. Its JSON API exposes soop_id, which lets us look a
// player up directly instead of scraping.
let eloboardIndexPromise = null;

async function loadEloboardIndex() {
  if (eloboardIndexPromise) return eloboardIndexPromise;

  eloboardIndexPromise = (async () => {
    const rows = [];
    for (let offset = 0; ; offset += 200) {
      const res = await fetch(`${ELOBOARD_API}/players?limit=200&offset=${offset}`, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`eloboard players HTTP ${res.status}`);
      const batch = await res.json();
      if (!Array.isArray(batch)) break;
      rows.push(...batch);
      if (batch.length < 200) break;
      if (offset > 50000) break;
    }

    const bySoopId = new Map();
    const byName = new Map();
    for (const row of rows) {
      if (!row || !row.id) continue;
      const soopId = String(row.soop_id || "").trim().toLowerCase();
      if (soopId) {
        if (!bySoopId.has(soopId)) bySoopId.set(soopId, []);
        bySoopId.get(soopId).push(row);
      }
      const name = String(row.name || "").trim();
      if (name) {
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push(row);
      }
    }

    console.log(`[eloboard] ${rows.length}명 색인, soop id ${bySoopId.size}개`);
    return { bySoopId, byName };
  })().catch((e) => {
    eloboardIndexPromise = null;
    throw e;
  });

  return eloboardIndexPromise;
}

function pickEntry(list, race) {
  if (!list || !list.length) return null;
  const target = String(race || "").trim().toUpperCase();
  const sameRace = list.filter((row) => String(row.main_race || "").trim().toUpperCase() === target);
  const pool = sameRace.length ? sameRace : list;
  return pool.find((row) => row.is_main_race) || pool[0];
}

function eloboardPhotoUrl(entry) {
  const thumb = String(entry && entry.thumb_url || "").trim();
  if (!thumb) return "";
  if (/^https?:\/\//i.test(thumb)) return thumb;
  if (thumb.startsWith("//")) return "https:" + thumb;
  return ELOBOARD_IMAGE_ORIGIN + thumb.replace(/^\/+/, "");
}

async function findEloboardPhoto(player) {
  const index = await loadEloboardIndex();
  const entry =
    pickEntry(index.bySoopId.get(String(player.userId || "").trim().toLowerCase()), player.race) ||
    pickEntry(index.byName.get(String(player.name || "").trim()), player.race);

  return eloboardPhotoUrl(entry);
}
async function main() {
  const playersPath = path.join(__dirname, "..", "data", "players.json");
  if (!fs.existsSync(playersPath)) {
    console.log("players.json 없음");
    return;
  }
  const players = JSON.parse(fs.readFileSync(playersPath, "utf8"));
  
  let photos = await fetchCurrentPhotos();
  let updated = normalizeExistingPhotos(photos);

  for (const p of players) {
    const tc = String(p.tierCode);
    const isTargetTier = tc === "B" || ["0","1","2","3","4","5","6","7","8"].includes(tc) || (p.tier && p.tier.match(/[0-8]티어/));
    
    if (isTargetTier) {
      const currentPhoto = photos[p.name] || "";
      // 아프리카TV 프사(sooplive.com, afreecatv.com)이거나 사진이 없는 경우
      if (!currentPhoto || currentPhoto.includes("sooplive.com") || currentPhoto.includes("afreecatv.com")) {
        console.log(`${p.name} eloboard 이미지 찾는 중...`);
        const eloImg = await findEloboardPhoto(p).catch(() => "");
        if (eloImg) {
          photos[p.name] = eloImg;
          updated++;
          console.log(`  => 찾음: ${eloImg}`);
        } else {
          console.log(`  => 실패`);
        }
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
