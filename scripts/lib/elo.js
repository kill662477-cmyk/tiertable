// 표준 Elo 계산 엔진. MMR_SYSTEM_DESIGN.md §1~3 그대로 구현.
// 판수 보정(provisional) 없음. K 상한 32.

// 실험용: env로 임시 오버라이드 가능 (기본값은 설계서의 16/32)
const K_BASE = Number(process.env.MMR_K_BASE || 16);
const K_CAP = Number(process.env.MMR_K_CAP || 32);

function expectedScore(ratingSelf, ratingOpp) {
  return 1 / (1 + Math.pow(10, (ratingOpp - ratingSelf) / 400));
}

function kEffective(multiplier) {
  return Math.min(K_BASE * multiplier, K_CAP);
}

// 승자/패자 관점에서 델타(제로섬) 계산.
// winnerRating/loserRating: 경기 전 MMR. multiplier: classify.multiplierFor 결과.
function computeDelta(winnerRating, loserRating, multiplier) {
  const k = kEffective(multiplier);
  const expectedWinner = expectedScore(winnerRating, loserRating);
  const delta = k * (1 - expectedWinner);
  return delta; // winner += delta, loser -= delta
}

module.exports = { K_BASE, K_CAP, expectedScore, kEffective, computeDelta };
