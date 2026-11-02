// Compares computer levels with duplicate deals: every deal is played twice with the same
// cards and the players swapped, so card luck cancels out.
//   node scripts/tournament.js boomke <levelA> <levelB> [deals] [aggrA] [aggrB]
//   node scripts/tournament.js wiezen <level> [deals] [aggr]     (one player vs three club players)
import { createGame, applyAction, waitingFor } from '../src/engine/game.js';
import { chooseAction } from '../src/ai/index.js';

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function playDeal(mode, seed, seatAi, dealer) {
  const rng = mulberry32(seed);
  const players = seatAi.map((ai, i) => ({ name: 'P' + i, kind: 'ai', ai }));
  const G = createGame({ mode, maxDeals: 1, players, dealer }, rng);
  let guard = 0;
  while (G.phase !== 'over' && guard++ < 5000) {
    const w = waitingFor(G), H = G.hand;
    if (w == null) applyAction(G, { type: H.phase === 'trickDone' ? 'collect' : H.phase === 'redeal' ? 'redeal' : 'next' }, rng);
    else applyAction(G, chooseAction(G, w), rng);
  }
  return G;
}

// A level argument may also be JSON, e.g. '{"level":"club","tune":{"samples":140}}'.
// Named variants for experiments (level + tune overrides).
const PRESETS = {
  'club+samples': { level: 'club', tune: { samples: 140, maxMs: 700 } },
  'expert-smart': { level: 'expert', tune: { smart: false } },
  'expert-infer': { level: 'expert', tune: { infer: false } },
  'expert-both': { level: 'expert', tune: { smart: false, infer: false } },
  'expert-bs48': { level: 'expert', tune: { bidSamples: 48 } },
  'master-noinfer': { level: 'master', tune: { infer: false } },
  'club-nosig': { level: 'club', tune: { signals: false } },
  'expert-nosig': { level: 'expert', tune: { signals: false } }
};
const ai = (lv, aggression) => (lv.startsWith('{') ? { aggression, ...JSON.parse(lv) } : { aggression, ...(PRESETS[lv] || { level: lv }) });
const [mode, ...rest] = process.argv.slice(2);
const t0 = Date.now();
if (mode === 'boomke') {
  const [la, lb, n = '20', aa = 'balanced', ab = 'balanced'] = rest;
  const A = ai(la, aa), B = ai(lb, ab);
  let diff = 0, bids = [0, 0], made = [0, 0];
  for (let i = 0; i < +n; i++) {
    const seed = 1000 + i, dealer = i % 4;
    for (const flip of [0, 1]) {
      const seats = flip ? [B, A, B, A] : [A, B, A, B];
      const G = playDeal('boomke', seed, seats, dealer);
      const aTeam = flip ? 1 : 0;
      diff += G.scores[aTeam] - G.scores[1 - aTeam];
      const C = G.history[0].contract;
      if (C.k === 'bid') { const who = C.team === aTeam ? 0 : 1; bids[who]++; if (G.history[0].d[C.team] > 0) made[who]++; }
    }
  }
  console.log(`boomke ${la}/${aa} vs ${lb}/${ab}: ${n} duplicate deals, A minus B = ${diff > 0 ? '+' : ''}${diff} ` +
    `(${(diff / n).toFixed(2)} per deal pair) · bids A ${bids[0]} (made ${made[0]}), B ${bids[1]} (made ${made[1]}) · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} else if (mode === 'wiezen') {
  const [lv, n = '12', ag = 'balanced'] = rest;
  const X = ai(lv, ag), club = { level: 'club', aggression: 'balanced' };
  let total = 0;
  for (let i = 0; i < +n; i++) {
    for (let seat = 0; seat < 4; seat++) {
      const seats = [club, club, club, club];
      seats[seat] = X;
      const G = playDeal('wiezen', 5000 + i, seats, i % 4);
      total += G.scores[seat];
    }
  }
  console.log(`wiezen ${lv}/${ag} vs 3 club: ${n} deals × 4 seats, points = ${total > 0 ? '+' : ''}${total} (${(total / (4 * n)).toFixed(2)} per deal) · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} else {
  console.log('usage: node scripts/tournament.js boomke <levelA> <levelB> [deals] | wiezen <level> [deals]');
}
