import { describe, it, expect } from 'vitest';
import { mk } from '../src/engine/cards.js';
import { sortCards, HandOrder } from '../src/ui/hand.js';

const S = 0, H = 1, D = 2, C = 3;
const hand = [mk(D, 3), mk(S, 14), mk(H, 2), mk(S, 4), mk(C, 10), mk(H, 12)];

describe('hand sorting', () => {
  it('groups suits black/red and sorts low to high by default', () => {
    expect(sortCards(hand)).toEqual([mk(S, 4), mk(S, 14), mk(H, 2), mk(H, 12), mk(C, 10), mk(D, 3)]);
  });
  it('sorts high to low when asked', () => {
    expect(sortCards(hand, { sortDir: 'desc' }).slice(0, 2)).toEqual([mk(S, 14), mk(S, 4)]);
  });
  it('can put trump first', () => {
    expect(sortCards(hand, { trumpFirst: true, trump: D })[0]).toBe(mk(D, 3));
  });
  it('keeps a custom order until reset or a new deal', () => {
    const o = new HandOrder();
    const first = o.arrange('a', hand, {});
    o.move(first[0], first.length);
    expect(o.arrange('a', hand, {}).at(-1)).toBe(first[0]);
    expect(o.arrange('a', hand.filter(c => c !== mk(C, 10)), {}).length).toBe(5);
    expect(o.arrange('b', hand, {})).toEqual(first);
  });
});
