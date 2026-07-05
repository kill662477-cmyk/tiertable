// Supabase Storage(tier-records 버킷)에서 전적 원본(.json.gz)을 읽어오는 최소 클라이언트.
// monstarznew/lib/supabase/storage.js 와 동일한 프로토콜(REST + service key), 읽기 전용.

const zlib = require("zlib");

const DEFAULT_BUCKET = "tier-records";

function getConfig() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !serviceKey) {
    throw new Error("Supabase 환경변수가 없습니다 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return { url, serviceKey };
}

function headers(cfg, extra) {
  return Object.assign(
    { apikey: cfg.serviceKey, Authorization: "Bearer " + cfg.serviceKey },
    extra || {}
  );
}

// prefix 하위 객체 목록 (페이지네이션)
async function listObjects(prefix, bucket) {
  const cfg = getConfig();
  bucket = bucket || DEFAULT_BUCKET;
  const all = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const res = await fetch(`${cfg.url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: headers(cfg, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix, limit, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`list_failed_${res.status}: ${text.slice(0, 200)}`);
    }
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }
  return all;
}

async function downloadGzJson(objectPath, bucket) {
  const cfg = getConfig();
  bucket = bucket || DEFAULT_BUCKET;
  const res = await fetch(`${cfg.url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "GET",
    headers: headers(cfg),
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`download_failed_${res.status}: ${objectPath}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let raw;
  try {
    raw = zlib.gunzipSync(buf);
  } catch (e) {
    raw = buf;
  }
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch (e) {
    return null;
  }
}

module.exports = { listObjects, downloadGzJson, DEFAULT_BUCKET };
