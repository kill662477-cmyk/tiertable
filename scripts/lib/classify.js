// eloboard 전적의 memo(메모) 텍스트로 경기 카테고리를 분류.
// 판정 순서가 중요: 먼저 걸리는 카테고리를 적용한다. (MMR_SYSTEM_DESIGN.md §3)
//   1) 대회   : JPL, 큐센, 대학리그, 씨나인배, 라네트배, 숲퍼컵, 스타워즈
//   2) 대학대전: "대학대전" 또는 "스타대전" 포함 && "미니" 미포함
//   3) CK     : CK, PL, 미니대전, 끝장전 (미니대학대전 포함)
//   4) 스폰   : 나머지 전부 (기본값)

const TOURNAMENT_KEYWORDS = ["JPL", "큐센", "대학리그", "씨나인배", "라네트배", "숲퍼컵", "스타워즈"];
const CK_KEYWORDS = ["CK", "PL", "미니대전", "끝장전"];

const MULTIPLIER = {
  대회: 3,
  대학대전: 2,
  CK: 1.5,
  스폰: 0.5, // 일반 스폰은 물량이 많아 비중 축소 (실효 K = 16×0.5 = 8)
};

function classifyMatchType(memo) {
  const text = String(memo || "");

  if (TOURNAMENT_KEYWORDS.some((kw) => text.includes(kw))) return "대회";

  const hasUniv = text.includes("대학대전") || text.includes("스타대전");
  const hasMini = text.includes("미니");
  if (hasUniv && !hasMini) return "대학대전";

  if (CK_KEYWORDS.some((kw) => text.includes(kw))) return "CK";

  return "스폰";
}

function multiplierFor(category) {
  return MULTIPLIER[category] ?? MULTIPLIER["스폰"];
}

// 팀플(2:2 등) 경기 감지 — 개인 1:1 실력 지표가 아니므로 Elo 계산에서 통째로 제외한다.
// "N:N" 팀 스코어 표기, "팀배"/"팀전", "[Team A vs Team B]" 패턴만 잡는다.
// 주의: "프로리그"는 그 자체로는 정상적인 경기 카테고리(대회성 1:1도 있음)이므로
// 이 키워드 하나만으로 팀플 취급하지 않는다 — 반드시 "2:2" 같은 팀 스코어 표기가 같이 있어야 함.
// (matchType의 "3/2" 같은 세트 스코어 표기와는 구분: 콜론 있는 "2:2"만 팀플로 취급)
const TEAM_MATCH_PATTERN = /\d+\s*:\s*\d+|팀배|팀전|\[\s*team\b/i;

function isTeamMatch(matchType, memo) {
  return TEAM_MATCH_PATTERN.test(String(matchType || "")) || TEAM_MATCH_PATTERN.test(String(memo || ""));
}

module.exports = { classifyMatchType, multiplierFor, isTeamMatch, TOURNAMENT_KEYWORDS, CK_KEYWORDS, MULTIPLIER };
