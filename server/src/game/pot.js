export function splitPot(pot, winners, dealerLeftIndex) {
  const base = Math.floor(pot / winners.length);
  const remainder = pot % winners.length;
  return winners.map((playerId, i) => ({
    playerId,
    amount: base + (i === dealerLeftIndex % winners.length ? remainder : 0),
  }));
}
