import { suitOf, rankOf } from '../engine/cards.js';

// Rough number of tricks a hand takes on its own with the given trump suit (null = no trump).
export function est(hand, trump) {
  const by = [[], [], [], []];
  hand.forEach(c => by[suitOf(c)].push(rankOf(c)));
  const tl = trump == null ? 0 : by[trump].length;
  let t = 0;
  for (let s = 0; s < 4; s++) {
    const a = by[s], n = a.length, A = a.includes(14), K = a.includes(13), Q = a.includes(12);
    if (A) t += 1;
    if (K) t += A ? 0.9 : n >= 2 ? 0.55 : 0.15;
    if (Q) t += A && K ? 0.8 : n >= 3 ? 0.35 : 0.1;
    if (a.includes(11) && n >= 4) t += 0.2;
    if (s === trump) t += Math.max(0, n - 3) * 0.85;
    else if (trump != null) { if (tl >= 3) { if (n === 0) t += Math.min(tl - 2, 2) * 0.8; else if (n === 1) t += 0.45; } }
    else if (n >= 5) t += (n - 4) * 0.5;
  }
  return t;
}

export function bestSuit(hand) {
  let b = 0, bv = -1;
  for (let s = 0; s < 4; s++) { const v = est(hand, s); if (v > bv) { bv = v; b = s; } }
  return { s: b, v: bv };
}

// How likely a hand is to be forced to take a trick in miserie (0 = very safe).
export function misRisk(hand, strict) {
  let risk = 0;
  for (let s = 0; s < 4; s++) {
    const a = hand.filter(c => suitOf(c) === s).map(rankOf).sort((x, y) => x - y);
    a.forEach((r, i) => { const thr = strict ? 3 + 2 * i : 4 + 2.2 * i; if (r > thr) risk += r - thr; });
  }
  return risk;
}
