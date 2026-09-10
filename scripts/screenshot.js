// 티어표 페이지를 통째로 찍어 Supabase Storage에 올린다.
// 공개본(mmr-result.json)이 갱신된 회차에만 워크플로가 이 스크립트를 부른다.
//
// 폭 540은 카드가 한 줄에 4장씩 들어가는 값이라 커뮤니티에 올렸을 때 이름이 읽힌다.
// 더 넓히면 한 줄에 8~9장이 들어가 조밀해지고, 더 좁히면 카드 자체가 작아진다.

const fs = require("fs");
const path = require("path");
const os = require("os");
const puppeteer = require("puppeteer-core");
const { loadMonstarznewEnv } = require("./lib/loadEnv");
loadMonstarznewEnv();

const PAGE_URL = process.env.TIERTABLE_URL || "https://kill662477-cmyk.github.io/tiertable/";
const WIDTH = Math.max(320, Number(process.env.SHOT_WIDTH || 540));
const BUCKET = "calmsv-assets";
const OBJECT = "tiertable/tiertable.jpg";
const QUALITY = Math.min(100, Math.max(1, Number(process.env.SHOT_QUALITY || 90)));

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
  ];

  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("크롬 실행 파일을 찾지 못했습니다. CHROME_PATH를 지정하세요.");
  return found;
}

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: 1200, deviceScaleFactor: 1 });
    await page.goto(PAGE_URL, { waitUntil: "networkidle2", timeout: 120000 });

    // 티어 섹션이 그려질 때까지 기다린다(데이터는 Supabase에서 런타임에 받아온다).
    await page.waitForSelector("section[id^='tier-'] .card", { timeout: 120000 });

    // 사진은 전부 외부 호스트라 늦게 온다. 끝까지 훑어 전부 요청시킨 뒤 로드를 기다린다.
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });

    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const pending = [...document.images].filter((img) => !img.complete);
          if (!pending.length) return resolve();

          let left = pending.length;
          const done = () => (--left <= 0 ? resolve() : undefined);
          pending.forEach((img) => {
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          });
          setTimeout(resolve, 60000);
        })
    );

    const stats = await page.evaluate(() => ({
      height: document.body.scrollHeight,
      cards: document.querySelectorAll("section[id^='tier-'] .card").length,
      broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
    }));
    console.log(`[shot] ${WIDTH}x${stats.height}, 카드 ${stats.cards}장, 로드 실패 이미지 ${stats.broken}장`);

    if (!stats.cards) throw new Error("카드가 하나도 없습니다 — 데이터 로드 실패로 보입니다.");

    const out = path.join(os.tmpdir(), "tiertable.jpg");
    await page.screenshot({ path: out, type: "jpeg", quality: QUALITY, fullPage: true });
    return { file: out, ...stats };
  } finally {
    await browser.close();
  }
}

async function upload(file) {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw new Error("Supabase 환경변수 없음");

  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${OBJECT}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
      "cache-control": "max-age=300",
    },
    body: fs.readFileSync(file),
  });

  if (!res.ok) throw new Error(`업로드 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `${url}/storage/v1/object/public/${BUCKET}/${OBJECT}`;
}

async function main() {
  const shot = await capture();
  const size = fs.statSync(shot.file).size;
  const publicUrl = await upload(shot.file);
  console.log(`[shot] 업로드 완료 ${(size / 1048576).toFixed(2)}MB`);
  console.log(`[shot] ${publicUrl}`);
}

main().catch((e) => {
  console.error("스샷 실패:", e.message);
  process.exit(1);
});
