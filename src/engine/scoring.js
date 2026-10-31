// Wiezen contracts in bidding order (low to high). Vraag/Mee share a rank.
export const WDEF = {
  vraag: { rank: 10 },
  mee: { rank: 10 },
  abon9: { rank: 20, need: 9 },
  abon10: { rank: 30, need: 10 },
  abon11: { rank: 40, need: 11 },
  miserie: { rank: 45, need: 0 },
  abon12: { rank: 50, need: 12 },
  openmis: { rank: 60, need: 0 },
  solo: { rank: 70, need: 13 },
  soloslim: { rank: 80, need: 13 }
};
export const SPECIALS = ['abon9', 'abon10', 'abon11', 'miserie', 'abon12', 'openmis', 'solo', 'soloslim'];
export const ABON_BASE = { 9: 5, 10: 7, 11: 8, 12: 9 };
export const isMis = k => k === 'miserie' || k === 'openmis';

// Tricks taken by the contract side.
export function sideTricks(mode, C, tr) {
  if (mode === 'wiezen') return tr[C.bidder] + (C.partner != null ? tr[C.partner] : 0);
  return tr[C.team] + tr[C.team + 2];
}

// Wiezen: zero-sum points per player. Solo contracts are paid by each of the three opponents.
export function scoreW(C, tr) {
  const T = sideTricks('wiezen', C, tr), d = [0, 0, 0, 0];
  let s;
  if (C.k === 'vraag' || C.k === 'troel') {
    const base = C.k === 'vraag' ? 2 : 4, per = C.k === 'vraag' ? 1 : 2, all = C.k === 'vraag' ? 10 : 20;
    s = T >= C.need ? (T === 13 ? all : base + per * (T - C.need)) : -(base + per * (C.need - T));
    for (let p = 0; p < 4; p++) d[p] = p === C.bidder || p === C.partner ? s : -s;
    return d;
  }
  if (C.k === 'alleen') s = T >= 5 ? 2 + (T - 5) : -(2 + (5 - T));
  else if (C.k.startsWith('abon')) { const b = ABON_BASE[C.need]; s = T >= C.need ? b + (T - C.need) : -b; }
  else if (C.k === 'miserie') s = T === 0 ? 7 : -7;
  else if (C.k === 'openmis') s = T === 0 ? 14 : -14;
  else if (C.k === 'solo') s = T === 13 ? 25 : -25;
  else if (C.k === 'soloslim') s = T === 13 ? 30 : -30;
  for (let p = 0; p < 4; p++) d[p] = p === C.bidder ? 3 * s : -s;
  return d;
}

// Boomkewies (pagat.com): points per team [team 0 = seats 0&2, team 1 = seats 1&3].
export function scoreB(C, tr) {
  const t = C.team, T = tr[t] + tr[t + 2], O = 13 - T, d = [0, 0];
  if (C.k === 'meetje') { if (T >= 7) d[t] = 1; else d[1 - t] = 1; return d; }
  const L = C.level;
  if (L === 13) { if (T === 13) d[t] = 5; else { d[t] = -5; d[1 - t] = 5; } return d; }
  if (T >= L) { d[t] = T === 13 ? 3 : T >= 10 ? 2 : 1; return d; }
  if (L <= 9) { d[t] = -1; d[1 - t] = O >= 10 ? 2 : 1; } else { d[t] = -2; d[1 - t] = 2; }
  return d;
}

export function scoreHand(mode, C, tr) {
  if (mode === 'wiezen') return scoreW(C, tr);
  if (mode === 'boomke') return scoreB(C, tr);
  return [tr[0] + tr[2], tr[1] + tr[3]];
}
