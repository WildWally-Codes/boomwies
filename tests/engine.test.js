import { describe, it, expect } from 'vitest';
import { mk, suitOf } from '../src/engine/cards.js';
import { legal, winnerOf } from '../src/engine/rules.js';
import { scoreW, scoreB } from '../src/engine/scoring.js';
import { createGame, applyAction, bidOptions, waitingFor } from '../src/engine/game.js';
import { chooseAction } from '../src/ai/index.js';

const S = 0, H = 1, D = 2, C = 3;
const players = () => [0, 1, 2, 3].map(i => ({ name: 'P' + i, kind: 'ai' }));

describe('rules', () => {
  it('must follow suit when possible', () => {
    const hand = [mk(S, 5), mk(H, 9), mk(H, 2)];
    expect(legal(hand, [{ p: 1, c: mk(H, 14) }]).sort()).toEqual([mk(H, 9), mk(H, 2)].sort());
    expect(legal(hand, [{ p: 1, c: mk(D, 14) }]).length).toBe(3);
  });
  it('highest trump wins, else highest of led suit', () => {
    const t = [{ p: 0, c: mk(H, 10) }, { p: 1, c: mk(H, 14) }, { p: 2, c: mk(S, 2) }, { p: 3, c: mk(C, 14) }];
    expect(winnerOf(t, S)).toBe(2);
    expect(winnerOf(t, D)).toBe(1);
    expect(winnerOf(t, null)).toBe(1);
  });
});

describe('wiezen scoring', () => {
  it('vraag made with overtricks, all 13, and failed', () => {
    const c = { k: 'vraag', bidder: 0, partner: 2, need: 8 };
    expect(scoreW(c, [5, 1, 5, 2])).toEqual([4, -4, 4, -4]);
    expect(scoreW(c, [7, 0, 6, 0])).toEqual([10, -10, 10, -10]);
    expect(scoreW(c, [3, 3, 3, 4])).toEqual([-4, 4, -4, 4]);
  });
  it('solo contracts pay three times', () => {
    expect(scoreW({ k: 'miserie', bidder: 1, partner: null, need: 0 }, [4, 0, 5, 4])).toEqual([-7, 21, -7, -7]);
    expect(scoreW({ k: 'abon9', bidder: 3, partner: null, need: 9 }, [1, 1, 1, 10])).toEqual([-6, -6, -6, 18]);
  });
});

describe('boomke scoring', () => {
  it('matches the pagat table', () => {
    expect(scoreB({ k: 'bid', level: 7, team: 0 }, [4, 2, 4, 3])).toEqual([1, 0]);
    expect(scoreB({ k: 'bid', level: 8, team: 0 }, [6, 0, 5, 2])).toEqual([2, 0]);
    expect(scoreB({ k: 'bid', level: 9, team: 1 }, [5, 1, 5, 2])).toEqual([2, -1]);
    expect(scoreB({ k: 'bid', level: 11, team: 1 }, [2, 5, 2, 4])).toEqual([2, -2]);
    expect(scoreB({ k: 'bid', level: 13, team: 0 }, [1, 0, 0, 0])).toEqual([-5, 5]);
    expect(scoreB({ k: 'meetje', level: 7, team: 1 }, [4, 2, 3, 4])).toEqual([1, 0]);
  });
});

describe('auctions', () => {
  it('boomke dealer is forced after three passes', () => {
    const G = createGame({ mode: 'boomke', maxDeals: 1, players: players(), dealer: 3 });
    for (const s of [0, 1, 2]) applyAction(G, { type: 'bid', seat: s, bid: 'pass' });
    expect(G.hand.turn).toBe(3);
    expect(bidOptions(G, 3)).toEqual([7, 13, 'meetje']);
    applyAction(G, { type: 'bid', seat: 3, bid: 'meetje' });
    expect(G.hand.phase).toBe('play');
    expect(G.hand.turn).toBe(3);
  });
  it('rejects out-of-turn and illegal actions', () => {
    const G = createGame({ mode: 'boomke', maxDeals: 1, players: players(), dealer: 3 });
    expect(() => applyAction(G, { type: 'bid', seat: 2, bid: 7 })).toThrow();
    expect(() => applyAction(G, { type: 'bid', seat: 0, bid: 5 })).toThrow();
  });
  it('wiezen all-pass leads to a redeal by the same dealer', () => {
    let G;
    do G = createGame({ mode: 'wiezen', maxDeals: 1, players: players(), dealer: 0 }); while (G.hand.A.cur);
    while (G.hand.phase === 'bid') applyAction(G, { type: 'bid', seat: G.hand.turn, bid: 'pass' });
    expect(G.hand.phase).toBe('redeal');
    applyAction(G, { type: 'redeal' });
    expect(G.dealer).toBe(0);
    expect(G.dealNo).toBe(1);
  });
  it('wiezen turned card belongs to the dealer', () => {
    const G = createGame({ mode: 'wiezen', maxDeals: 1, players: players(), dealer: 2 });
    expect(G.hand.hands[2]).toContain(G.hand.turnCard);
    expect(G.hand.hands.every(h => h.length === 13)).toBe(true);
  });
});

function autoplay(mode, deals) {
  const G = createGame({ mode, maxDeals: deals, players: players() });
  let guard = 0;
  while (G.phase !== 'over' && guard++ < 50000) {
    const w = waitingFor(G), H = G.hand;
    if (w == null) applyAction(G, { type: H.phase === 'trickDone' ? 'collect' : H.phase === 'redeal' ? 'redeal' : 'next' });
    else applyAction(G, chooseAction(G, w));
  }
  return G;
}

describe('full games with computer players', () => {
  it('wiezen stays zero-sum', () => {
    const G = autoplay('wiezen', 12);
    expect(G.phase).toBe('over');
    expect(G.scores.reduce((a, b) => a + b, 0)).toBe(0);
    expect(G.history.length).toBe(12);
  });
  it('boomke and classic finish', () => {
    expect(autoplay('boomke', 12).history.length).toBe(12);
    const K = autoplay('klassiek', 3);
    expect(K.scores[0] + K.scores[1]).toBe(39);
  });
});
