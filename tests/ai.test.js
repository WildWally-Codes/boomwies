import { describe, it, expect } from 'vitest';
import { createGame, applyAction, waitingFor, legalCards } from '../src/engine/game.js';
import { chooseAction, wantedSuit, partnerSignal } from '../src/ai/index.js';
import { aiParams, LEVELS, AGGRESSION } from '../src/ai/config.js';
import { bestSuit } from '../src/ai/evaluate.js';
import { mk, suitOf } from '../src/engine/cards.js';

const seats = ai => [0, 1, 2, 3].map(i => ({ name: 'P' + i, kind: 'ai', ai }));

describe('ai settings', () => {
  it('resolves unknown settings to the defaults', () => {
    expect(aiParams({ level: 'nope', aggression: 'nope' })).toMatchObject({ level: 'club', aggr: 0 });
    expect(aiParams({ level: 'master', aggression: 'reckless' })).toMatchObject({ level: 'master', aggr: 2, endgame: true });
  });

  it('never picks a trump suit the hand does not hold', () => {
    // No spades, no suit longer than three cards: honour points alone used to tie on the void suit.
    const hand = [mk(1, 14), mk(1, 13), mk(1, 2), mk(2, 14), mk(2, 5), mk(2, 3), mk(3, 12), mk(3, 9), mk(3, 4)];
    expect(bestSuit(hand).s).not.toBe(0);
    expect(hand.some(c => suitOf(c) === bestSuit(hand).s)).toBe(true);
  });

  it('asks for a suit headed by a sure winner, never trump or a singleton', () => {
    const played = new Uint8Array(52);
    // A♣ 5♣ 2♣ (sure winner), K♦ alone, trump hearts long.
    const hand = [mk(3, 14), mk(3, 5), mk(3, 2), mk(2, 13), mk(1, 14), mk(1, 13), mk(1, 9), mk(1, 4)];
    expect(wantedSuit(hand, 1, played)).toBe(3);
    expect(wantedSuit([mk(2, 13), mk(1, 14), mk(1, 3)], 1, played)).toBe(null);
  });

  it("reads partner's first low discard as the suit to lead", () => {
    const H = { trump: 1, discards: [{ p: 3, c: mk(0, 9) }, { p: 2, c: mk(3, 3) }, { p: 2, c: mk(0, 4) }] };
    expect(partnerSignal(H, [2])).toBe(3);         // seat 2's first discard was a low club
    expect(partnerSignal(H, [1])).toBe(null);      // seat 1 has not discarded
    expect(partnerSignal({ trump: 1, discards: [{ p: 2, c: mk(3, 13) }] }, [2])).toBe(null); // a king is not a signal
  });

  it('bolder players open the Boomke bidding more often', () => {
    const opens = aggression => {
      let n = 0;
      for (let i = 0; i < 300; i++) {
        const G = createGame({ mode: 'boomke', maxDeals: 1, players: seats({ level: 'club', aggression }), dealer: 3 });
        if (chooseAction(G, 0).bid !== 'pass') n++;
      }
      return n;
    };
    const cautious = opens('cautious'), reckless = opens('reckless');
    expect(reckless).toBeGreaterThan(cautious + 30);
  });

  it('every level and aggression plays only legal cards', () => {
    for (const level of LEVELS) {
      const aggression = AGGRESSION[LEVELS.indexOf(level)];
      const G = createGame({ mode: level === 'expert' ? 'boomke' : 'wiezen', maxDeals: 2, players: seats({ level, aggression }) });
      let guard = 0;
      while (G.phase !== 'over' && guard++ < 3000) {
        const w = waitingFor(G), H = G.hand;
        if (w == null) { applyAction(G, { type: H.phase === 'trickDone' ? 'collect' : H.phase === 'redeal' ? 'redeal' : 'next' }); continue; }
        const a = chooseAction(G, w);
        if (a.type === 'play') expect(legalCards(G, w)).toContain(a.card);
        applyAction(G, a);
      }
      expect(G.phase).toBe('over');
    }
  }, 120000);
});
