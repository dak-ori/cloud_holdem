const RANK_ORDER = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const rankValue = r => RANK_ORDER.indexOf(r);

function parseCard(card) {
  return { rank: card.slice(0, -1), suit: card.slice(-1) };
}

function getBest5(cards) {
  const combos = [];
  for (let i = 0; i < cards.length - 1; i++)
    for (let j = i + 1; j < cards.length; j++)
      combos.push(cards.filter((_, idx) => idx !== i && idx !== j));
  return combos.reduce((best, combo) => {
    const ev = evaluate5(combo);
    return !best || compareHands(ev, best) < 0 ? ev : best;
  }, null);
}

function evaluate5(cards) {
  const parsed = cards.map(parseCard);
  const ranks = parsed.map(c => rankValue(c.rank)).sort((a, b) => b - a);
  const suits = parsed.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = checkStraight(ranks);
  const counts = countRanks(ranks);
  const groups = Object.values(counts).sort((a, b) => b - a);

  // 같은 족보끼리는 묶음(페어/트립스) 랭크부터 비교해야 한다 —
  // 단순 내림차순이면 "2 페어 + A 키커"가 "K 페어"를 이겨버린다
  let tiebreak = [...ranks].sort((a, b) => counts[b] - counts[a] || b - a);
  // A-2-3-4-5 휠 스트레이트는 5-high로 취급 (A는 가장 낮은 끝)
  if (isStraight && ranks[0] === 12 && ranks[1] === 3) tiebreak = [3, 2, 1, 0, -1];

  if (isFlush && isStraight && ranks[0] === 12) return { rank: 1, name: 'Royal Flush', tiebreak };
  if (isFlush && isStraight)                    return { rank: 2, name: 'Straight Flush', tiebreak };
  if (groups[0] === 4)                          return { rank: 3, name: 'Four of a Kind', tiebreak };
  if (groups[0] === 3 && groups[1] === 2)       return { rank: 4, name: 'Full House', tiebreak };
  if (isFlush)                                  return { rank: 5, name: 'Flush', tiebreak };
  if (isStraight)                               return { rank: 6, name: 'Straight', tiebreak };
  if (groups[0] === 3)                          return { rank: 7, name: 'Three of a Kind', tiebreak };
  if (groups[0] === 2 && groups[1] === 2)       return { rank: 8, name: 'Two Pair', tiebreak };
  if (groups[0] === 2)                          return { rank: 9, name: 'One Pair', tiebreak };
  return                                               { rank: 10, name: 'High Card', tiebreak: ranks };
}

function checkStraight(sortedRanks) {
  const uniq = [...new Set(sortedRanks)];
  if (uniq.length < 5) return false;
  if (uniq[0] - uniq[4] === 4) return true;
  // A-2-3-4-5 (wheel)
  if (JSON.stringify(uniq.slice(0, 5)) === JSON.stringify([12,3,2,1,0])) return true;
  return false;
}

function countRanks(ranks) {
  return ranks.reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {});
}

export function evaluateHand(holeCards, communityCards) {
  return getBest5([...holeCards, ...communityCards]);
}

export function compareHands(h1, h2) {
  if (h1.rank !== h2.rank) return h1.rank < h2.rank ? -1 : 1;
  for (let i = 0; i < h1.tiebreak.length; i++) {
    if (h1.tiebreak[i] !== h2.tiebreak[i]) {
      return h1.tiebreak[i] > h2.tiebreak[i] ? -1 : 1;
    }
  }
  return 0;
}
