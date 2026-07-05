// 2024년 4월 시드 명단 이후 닉네임이 바뀐 것으로 확인된 인원 수동 매핑.
// eloboard 프로필이 개명과 함께 리셋되는 경우가 있어 fileEarliest(첫 기록일)만으로는
// 신규/복귀자를 자동 판별할 수 없다 — 확인된 케이스만 여기 등록한다.
// key: 현재 players.json 상의 이름, value: 2024.04 시드 명단상의 원래 이름
const RENAMED_TO_SEED_NAME = {
  다예: "얌지금",
};

// 2024.04 시드 명단엔 없지만 실제로는 신규가 아니라 복귀자로 확인된 인원.
// eloboard 자체 기록(fileEarliest)이 2024-04-10 이후부터라 자동판별로는 신규로 잡히는 케이스.
const FORCE_RETURNEE_NAMES = new Set(["유복실", "상어녀", "연둥바둥", "삐약삐약", "사랑e"]);

// players.json(현재 로스터)에 아예 없어서 이름+종족 교차매칭이 안 되는 시드 인원.
// raw-records 파일에서 직접 확인한 실제 userId로 시드 매칭시킨다.
// key: eloboard userId, value: 2024.04 시드 명단상의 이름
const DIRECT_UID_SEED_OVERRIDES = {
  rhakdncjs90: "으냉이", // players.json에 없음(로스터에서 빠짐), raw-records로 직접 확인
};

// 표시(디스플레이)에서 완전히 제외할 인원 — 계산 풀에는 남아있어 상대들 점수에는 영향 없음
const EXCLUDED_PLAYER_NAMES = new Set(["나도현", "엄키키", "지아송"]);

// 관리자 수동 티어 고정 — 계산 결과와 무관하게 표시 티어를 강제
const FORCED_TIER_OVERRIDES = {
  보혜: "1",
  깅예솔: "6",
  김세주: "7",
  이지다: "7",
  요시: "7",
  모비: "7",
  김유나: "8",
  오세은: "8",
  이응씨: "8",
  은조: "8",
  삼교: "8",
  황단비: "8",
  진땅콩: "8",
  구키: "8",
  연또: "8",
  으니: "B",
  햄희: "8",
  먹체토: "8",
  혜냥: "8",
  찡찡시아: "8",
  김말랑: "8",
  세월: "8",
};

module.exports = {
  RENAMED_TO_SEED_NAME,
  FORCE_RETURNEE_NAMES,
  DIRECT_UID_SEED_OVERRIDES,
  EXCLUDED_PLAYER_NAMES,
  FORCED_TIER_OVERRIDES,
};
