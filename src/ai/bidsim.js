// Simulation-based bidding for the stronger levels: deal the unseen cards at random many times,
// play each deal out with the fast playout policy, and look at the expected score of each contract.
import { suitOf, rankOf, shuffle, maxBy } from '../engine/cards.js';
import { scoreB, scoreW } from '../engine/scoring.js';
import { playout } from './index.js';

function randomDeal(hand, p, known) {
  // known: [{seat, card}] cards publicly held by other seats (e.g. the turned trump card)
  const used = new Set(hand), hands = [[], [], [], []];
  hands[p] = hand.slice();
  for (const k of known) if (k.seat !== p) { hands[k.seat].push(k.card); used.add(k.card); }
  const pool = shuffle([...Array(52).keys()].filter(c => !used.has(c)));
  let i = 0;
  for (let q = 0; q < 4; q++) while (hands[q].length < 13) hands[q].push(pool[i++]);
  return hands;
}

/** Boomke: distribution of the team's tricks if p bids and leads with suit s as trump. */
function boomkeTricks(hand, p, s, n) {
  const C = { k: 'bid', level: 7, bidder: p, team: p % 2, trump: s };
  const out = [];
  for (let i = 0; i < n; i++) {
    const deal = randomDeal(hand, p, []);
    const first = maxBy(deal[p].filter(c => suitOf(c) === s), rankOf);
    const tr = playout({ mode: 'boomke', C, smart: true }, deal, p, s, first);
    out.push(tr[p % 2] + tr[p % 2 + 2]);
  }
  return out;
}

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

/**
 * Boomke bid for seat p. Returns a legal option or null to fall back to the hand-estimate bidder.
 * opts: legal bids; P: ai params; partnerBid: partner's last bid or null.
 */
export function simBidBoomke(hand, p, opts, P, curLevel, partnerHolds) {
  const n = P.bidSamples;
  const suits = [0, 1, 2, 3].filter(s => hand.some(c => suitOf(c) === s));
  let best = null;
  for (const s of suits) {
    const T = boomkeTricks(hand, p, s, n);
    if (!best || mean(T) > mean(best.T)) best = { s, T };
  }
  // A random partner is average; the partner's own bidding nudges the estimate.
  const shift = (partnerHolds ? 0.8 : 0) + 0.4 * P.aggr;
  const ev = L => mean(best.T.map(t => {
    const T = Math.max(0, Math.min(13, Math.round(t + shift)));
    const d = scoreB({ k: L === 'meetje' ? 'meetje' : 'bid', level: L === 'meetje' ? 7 : L, team: 0 }, [T, 13 - T, 0, 0]);
    return d[0] - d[1];
  }));
  if (opts.includes('meetje')) {
    return ev(13) > Math.max(ev('meetje'), 0.5) ? 13 : 'meetje';
  }
  if (partnerHolds && P.aggr < 2) return 'pass';
  if (opts.includes(13) && ev(13) > 0.6 - 0.3 * P.aggr) return 13;
  const min = curLevel ? curLevel + 1 : 7;
  if (min <= 12 && opts.includes(min) && ev(min) > 0.15 - 0.15 * P.aggr) return min;
  return 'pass';
}

/**
 * Wiezen: simulated expected value (points for p) of each solo contract in keys.
 */
export function simEvWiezen(G, p, keys, P) {
  const H = G.hand, hand = H.hands[p], dealer = G.dealer;
  const known = [{ seat: dealer, card: H.turnCard }];
  const n = P.bidSamples;
  const leader = (dealer + 1) % 4;
  const evs = [];
  const turned = suitOf(H.turnCard);

  // Abondance / solo: best trump by simulated tricks.
  const want = keys.filter(k => k.startsWith('abon') || k === 'solo' || k === 'soloslim');
  if (want.length) {
    let best = null;
    for (const s of [0, 1, 2, 3]) {
      const C = { k: 'abon9', need: 9, bidder: p, partner: null, trump: s };
      const T = [];
      for (let i = 0; i < n; i++) {
        const deal = randomDeal(hand, p, known);
        T.push(playout({ mode: 'wiezen', C, smart: true }, deal, leader, s)[p]);
      }
      if (!best || mean(T) > mean(best.T)) best = { s, T };
      if (s === turned) best.turnedT = T;
    }
    for (const k of want) {
      const need = k.startsWith('abon') ? +k.slice(4) : 13;
      const T = k === 'soloslim' ? (best.turnedT || best.T) : best.T;
      const C = { k: k === 'soloslim' ? 'soloslim' : k, need, bidder: p, partner: null };
      evs.push({ k, ev: mean(T.map(t => scoreW(C, fill(p, Math.min(13, Math.round(t + 0.3 * P.aggr))))[p])) });
    }
  }
  // Miserie: chance of taking no tricks.
  for (const k of ['miserie', 'openmis']) {
    if (!keys.includes(k)) continue;
    const C = { k, need: 0, bidder: p, partner: null };
    let clean = 0;
    for (let i = 0; i < n; i++) {
      const deal = randomDeal(hand, p, known);
      if (playout({ mode: 'wiezen', C, smart: true }, deal, leader, null)[p] === 0) clean++;
    }
    let pr = clean / n;
    if (k === 'openmis') pr *= 0.8; // opponents see the hand
    const v = k === 'miserie' ? 7 : 14;
    evs.push({ k, ev: 3 * v * (2 * pr - 1) });
  }
  return Object.fromEntries(evs.map(e => [e.k, e.ev]));
}

// Tricks array where seat p took t and the rest are spread over the others (only p's count matters for solo scoring).
function fill(p, t) {
  const tr = [0, 0, 0, 0];
  tr[p] = t;
  tr[(p + 1) % 4] = 13 - t;
  return tr;
}
