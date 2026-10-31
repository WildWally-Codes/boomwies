// Cards are integers 0..51: suit = floor(c / 13), rank = c % 13 + 2 (2..14, ace high).
// Suits: 0 spades, 1 hearts, 2 diamonds, 3 clubs.
export const SYM = ['♠', '♥', '♦', '♣'];
export const suitOf = c => Math.floor(c / 13);
export const rankOf = c => c % 13 + 2;
export const mk = (s, r) => s * 13 + r - 2;
export const isRed = s => s === 1 || s === 2;

export function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sum = a => a.reduce((x, y) => x + y, 0);
export const minBy = (a, f) => a.reduce((b, x) => (f(x) < f(b) ? x : b));
export const maxBy = (a, f) => a.reduce((b, x) => (f(x) > f(b) ? x : b));
