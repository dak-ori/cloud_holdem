const BLIND_STRUCTURE = {
  4: { sb: 10, bb: 20 },
  3: { sb: 20, bb: 40 },
  2: { sb: 40, bb: 80 },
};

export function getBlinds(playerCount) {
  const blinds = BLIND_STRUCTURE[playerCount];
  if (!blinds) throw new Error('invalid player count');
  return blinds;
}
