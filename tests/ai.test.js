import { describe, it, expect } from 'vitest';
import { createGame, applyAction, waitingFor, legalCards } from '../src/engine/game.js';
import { chooseAction } from '../src/ai/index.js';
import { aiParams, LEVELS, AGGRESSION } from '../src/ai/config.js';

const seats = ai => [0, 1, 2, 3].map(i => ({ name: 'P' + i, kind: 'ai', ai }));

describe('ai settings', () => {
  it('resolves unknown settings to the defaults', () => {
    expect(aiParams({ level: 'nope', aggression: 'nope' })).toMatchObject({ level: 'club', aggr: 0 });
    expect(aiParams({ level: 'master', aggression: 'reckless' })).toMatchObject({ level: 'master', aggr: 2, endgame: true });
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
