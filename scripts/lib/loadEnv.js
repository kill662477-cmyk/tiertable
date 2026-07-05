// monstarznew/.env.local 을 읽어 현재 프로세스 env로 주입.
// 이 리포(tiertable)에는 비밀값을 복제/커밋하지 않고, 실행 시점에만 참조한다.

const fs = require("fs");
const path = require("path");

const MONSTARZNEW_ENV_PATH = path.join(
  "C:\\Users\\silve\\OneDrive\\Desktop\\MONSTARZNEW_PROJECT_REPOS_20260617-104902\\monstarznew",
  ".env.local"
);

function loadMonstarznewEnv() {
  const raw = fs.readFileSync(MONSTARZNEW_ENV_PATH, "utf8");
  const lines = raw.split(/\r?\n/);
  let loaded = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!key || !value) continue;
    if (!process.env[key]) {
      process.env[key] = value;
      loaded += 1;
    }
  }
  return loaded;
}

module.exports = { loadMonstarznewEnv };
