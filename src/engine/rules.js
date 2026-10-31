import { suitOf, rankOf } from './cards.js';

// Must follow suit when possible; otherwise anything. No obligation to trump or overtake.
export function legal(hand, trick) {
  if (!trick.length) return hand.slice();
  const ls = suitOf(trick[0].c);
  const f = hand.filter(c => suitOf(c) === ls);
  return f.length ? f : hand.slice();
}

// Does card c beat the currently winning card w?
export function beats(c, w, trump) {
  const sc = suitOf(c), sw = suitOf(w);
  if (sc === sw) return rankOf(c) > rankOf(w);
  return sc === trump;
}

export function winnerOf(trick, trump) {
  let b = trick[0];
  for (let i = 1; i < trick.length; i++) if (beats(trick[i].c, b.c, trump)) b = trick[i];
  return b.p;
}
