// Computer player. Bidding uses hand estimates; card play samples possible deals of the
// unseen cards (respecting known voids, publicly known cards and, at higher levels, what
// the bidding revealed) and plays each out, choosing the card with the best risk-adjusted score.
// Only public information plus the AI's own hand is used.
import { suitOf, rankOf, mk, shuffle, minBy, maxBy } from '../engine/cards.js';
import { legal, beats, winnerOf } from '../engine/rules.js';
import { isMis, sideTricks, scoreW, scoreB } from '../engine/scoring.js';
import { bidOptions } from '../engine/game.js';
import { est, bestSuit, misRisk } from './evaluate.js';
import { aiParams } from './config.js';
import { simBidBoomke, simEvWiezen } from './bidsim.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;

/** Picks the next action for seat p. settings = {level, aggression}; defaults to the seat's own. */
export function chooseAction(G, p, settings = G.players[p].ai) {
  const H = G.hand, P = aiParams(settings);
  if (H.phase === 'bid') return { type: 'bid', seat: p, bid: G.mode === 'wiezen' ? bidW(G, p, P) : bidB(G, p, P) };
  if (H.phase === 'alone') {
    const v = est(H.hands[p], suitOf(H.turnCard)) + P.bidShift + gauss() * P.bidNoise;
    return { type: 'alone', seat: p, yes: v >= 5.2 };
  }
  if (H.phase === 'trump') return { type: 'trump', seat: p, suit: bestSuit(H.hands[p]).s };
  if (H.phase === 'play') return { type: 'play', seat: p, card: chooseCard(G, p, P) };
  return null;
}

// ---------------- bidding ----------------
function bidW(G, p, P) {
  const H = G.hand, hand = H.hands[p], opts = bidOptions(G, p);
  const noise = () => gauss() * P.bidNoise;
  const T0 = est(hand, suitOf(H.turnCard)) + P.bidShift + noise();
  const Tb = bestSuit(hand).v + P.bidShift + noise();
  const misAllow = Math.max(0, 1 + 0.6 * P.aggr);
  const want = [];
  if (T0 >= 12.5) want.push('soloslim');
  if (Tb >= 12.3) want.push('solo');
  if (P.miserie && misRisk(hand, true) <= Math.max(0, 0.4 * P.aggr)) want.push('openmis');
  if (Tb >= 11.6) want.push('abon12');
  if (P.miserie && misRisk(hand, false) <= misAllow) want.push('miserie');
  if (Tb >= 10.6) want.push('abon11');
  if (Tb >= 9.6) want.push('abon10');
  if (Tb >= 8.6) want.push('abon9');
  if (T0 >= 3.4) want.push('mee');
  if (T0 >= 3.9) want.push('vraag');
  const offered = want.filter(k => opts.includes(k));
  // Stronger levels play out sample deals and drop solo contracts that lose on average.
  const solos = P.simBid ? offered.filter(k => k !== 'vraag' && k !== 'mee') : [];
  const ev = solos.length ? simEvWiezen(G, p, solos, P) : {};
  for (const k of offered) if (!(k in ev) || ev[k] > -0.5 * P.aggr) return k;
  return 'pass';
}

function bidB(G, p, P) {
  const H = G.hand, A = H.A, opts = bidOptions(G, p), partner = (p + 2) % 4;
  if (P.simBid) return simBidBoomke(H.hands[p], p, opts, P, A.cur ? A.cur.level : 0, !!A.cur && A.cur.bidder === partner);
  const own = bestSuit(H.hands[p]).v;
  const pb = H.bids[partner];
  let bonus = 2.6;
  if (pb != null && pb !== 'pass') bonus += ((A.cur && A.cur.bidder === partner ? A.cur.level : 7) - 6) * (P.infer ? 0.6 : 0.5);
  if (pb === 'pass') bonus -= P.infer ? 0.9 : 0.7;
  const team = own + bonus + P.bidShift + gauss() * P.bidNoise;
  const boomAt = 12.6 - 0.4 * P.aggr;
  if (opts.includes('meetje')) {
    if (team >= boomAt) return 13;
    return P.aggr >= 2 && team >= 8 ? 7 : 'meetje';
  }
  if (A.cur && A.cur.bidder === partner && P.aggr < 2) return 'pass';
  if (team >= boomAt && opts.includes(13)) return 13;
  const min = A.cur ? A.cur.level + 1 : 7;
  if (min <= 12 && Math.floor(team) >= min) return min;
  return 'pass';
}

// ---------------- card play ----------------
function ctxFrom(mode, C, smart) {
  const side = p => (mode !== 'wiezen' ? p % 2 : p === C.bidder || p === C.partner ? 0 : 1);
  const goal = p => (mode === 'wiezen' && isMis(C.k) ? (p === C.bidder ? 'avoid' : 'push') : 'take');
  return { mode, C, side, goal, smart };
}
const makeCtx = (G, P) => ctxFrom(G.mode, G.hand.contract, P.smart);

/** Plays a whole deal from scratch with the playout policy; returns tricks per seat. Used by bidding simulations. */
export function playout({ mode, C, smart }, deal, leader, trump, first) {
  const ctx = ctxFrom(mode, C, smart), hands = deal.map(h => h.slice()), tr = [0, 0, 0, 0], played = new Uint8Array(52);
  let trick = [], cur = leader;
  let card = first ?? policy(ctx, cur, hands[cur], trick, trump, played);
  for (;;) {
    const h = hands[cur];
    h.splice(h.indexOf(card), 1);
    played[card] = 1;
    trick.push({ p: cur, c: card });
    if (trick.length === 4) {
      const w = winnerOf(trick, trump);
      tr[w]++;
      trick = [];
      cur = w;
      if (!hands[w].length) break;
    } else cur = (cur + 1) % 4;
    card = policy(ctx, cur, hands[cur], trick, trump, played);
  }
  return tr;
}

function isTop(c, hand, played) {
  const s = suitOf(c);
  for (let r = rankOf(c) + 1; r <= 14; r++) { const x = mk(s, r); if (!played[x] && !hand.includes(x)) return false; }
  return true;
}
function lowDiscard(leg, trump) { const n = leg.filter(c => suitOf(c) !== trump); return minBy(n.length ? n : leg, rankOf); }

function policy(ctx, p, hand, trick, trump, played) {
  const leg = legal(hand, trick);
  if (leg.length === 1) return leg[0];
  const g = ctx.goal(p);
  if (!trick.length) {
    if (g !== 'take') return minBy(leg, rankOf);
    for (const c of leg) if (suitOf(c) !== trump && rankOf(c) >= 11 && isTop(c, hand, played)) return c;
    const by = [[], [], [], []];
    leg.forEach(c => by[suitOf(c)].push(c));
    let best = null;
    for (let s = 0; s < 4; s++) if (s !== trump && by[s].length && (!best || by[s].length > best.length)) best = by[s];
    return minBy(best || leg, rankOf);
  }
  const wp = winnerOf(trick, trump), wc = trick.find(t => t.p === wp).c;
  const following = suitOf(leg[0]) === suitOf(trick[0].c);
  if (g === 'take') {
    if (ctx.side(wp) === ctx.side(p) && (trick.length === 3 || isTop(wc, hand, played))) return lowDiscard(leg, trump);
    const win = leg.filter(c => beats(c, wc, trump));
    if (win.length) {
      if (trick.length === 3 || !following) return minBy(win, c => (suitOf(c) === trump ? 100 : 0) + rankOf(c));
      if (ctx.smart) {
        // Win cheaply with a sure winner; otherwise second hand plays low, third hand covers.
        const sure = win.filter(c => isTop(c, hand, played));
        if (sure.length) return minBy(sure, rankOf);
        if (trick.length === 1) return lowDiscard(leg, trump);
      }
      return maxBy(win, rankOf);
    }
    return lowDiscard(leg, trump);
  }
  if (g === 'avoid') {
    const lose = leg.filter(c => !beats(c, wc, trump));
    return maxBy(lose.length ? lose : leg, rankOf);
  }
  if (!following) return maxBy(leg, rankOf);
  if (wp === ctx.C.bidder) { const lose = leg.filter(c => !beats(c, wc, trump)); if (lose.length) return maxBy(lose, rankOf); }
  return minBy(leg, rankOf);
}

function utility(ctx, p, tr) {
  const { mode, C } = ctx;
  if (mode === 'wiezen') {
    const d = scoreW(C, tr), T = sideTricks(mode, C, tr);
    const tie = isMis(C.k) ? (p === C.bidder ? -T : T) : ctx.side(p) === 0 ? T : 13 - T;
    return d[p] + tie * 0.03;
  }
  const t = p % 2, mine = tr[t] + tr[t + 2];
  if (mode === 'boomke') { const d = scoreB(C, tr); return d[t] - d[1 - t] + mine * 0.03; }
  return mine * 2 - 13;
}

// How much more (or less) likely card c is in seat q's hand, given the bidding.
function makeBias(G) {
  const H = G.hand, C = H.contract, trump = H.trump;
  return (q, c) => {
    if (!C) return 1;
    const s = suitOf(c), r = rankOf(c);
    if (G.mode === 'wiezen') {
      if (q === C.bidder && isMis(C.k)) return r >= 11 ? 0.6 : r <= 6 ? 1.3 : 1;
      if (q === C.bidder && (C.k.startsWith('abon') || C.k === 'solo' || C.k === 'soloslim')) return s === trump ? 1.6 : r >= 12 ? 1.2 : 1;
      if ((q === C.bidder || q === C.partner) && C.k === 'vraag') return r >= 12 ? 1.15 : 1;
      return 1;
    }
    if (G.mode === 'boomke' && C.k === 'bid' && trump != null) {
      if (q === C.bidder) return s === trump ? (C.level >= 9 ? 1.6 : 1.4) : 1;
    }
    return 1;
  };
}

function sampleHands(H, p, P, bias) {
  const mine = H.hands[p], used = new Set([...mine, ...H.played]);
  const base = [[], [], [], []], need = [0, 0, 0, 0];
  base[p] = mine.slice();
  for (let q = 0; q < 4; q++) if (q !== p) {
    base[q] = H.known[q].slice();
    base[q].forEach(c => used.add(c));
    need[q] = H.hands[q].length - base[q].length;
  }
  const pool = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) pool.push(c);
  for (let attempt = 0; attempt < 14; attempt++) {
    const useVoids = P.voids && attempt < 12;
    shuffle(pool);
    const h = base.map(x => x.slice()), left = need.slice();
    let ok = true;
    for (const c of pool) {
      const s = suitOf(c);
      let tot = 0;
      const el = [], w = [];
      for (let q = 0; q < 4; q++) if (q !== p && left[q] > 0 && !(useVoids && H.voids[q][s])) {
        const wq = left[q] * (bias ? bias(q, c) : 1);
        el.push(q); w.push(wq); tot += wq;
      }
      if (!el.length) { ok = false; break; }
      let r = Math.random() * tot, pick = el[el.length - 1];
      for (let i = 0; i < el.length; i++) { r -= w[i]; if (r <= 0) { pick = el[i]; break; } }
      h[pick].push(c);
      left[pick]--;
    }
    // Only accept a deal that gives every seat exactly as many cards as it really holds.
    if (ok && h.every((x, q) => x.length === H.hands[q].length)) return h;
  }
  return null;
}

function simulate(ctx, H, p, m, deal) {
  const hands = deal.map(h => h.slice()), tr = H.tricks.slice(), played = new Uint8Array(52);
  H.played.forEach(c => (played[c] = 1));
  let trick = H.trick.slice(), cur = p, card = m;
  const trump = H.trump;
  for (;;) {
    const h = hands[cur];
    h.splice(h.indexOf(card), 1);
    played[card] = 1;
    trick.push({ p: cur, c: card });
    if (trick.length === 4) {
      const w = winnerOf(trick, trump);
      tr[w]++;
      trick = [];
      cur = w;
      if (!hands[w].length) break;
    } else cur = (cur + 1) % 4;
    if (!hands[cur].length) break; // inconsistent sample: score what was played so far
    card = policy(ctx, cur, hands[cur], trick, trump, played);
  }
  return utility(ctx, p, tr);
}

// Exact play-out of a small endgame with all hands known (one sampled deal).
function exact(ctx, p, hands, trick, tr, trump, cur) {
  if (!hands[cur].length) return utility(ctx, p, tr);
  const leg = legal(hands[cur], trick), maxi = ctx.side(cur) === ctx.side(p);
  let best = maxi ? -Infinity : Infinity;
  for (const c of leg) {
    const h = hands[cur], i = h.indexOf(c);
    h.splice(i, 1);
    trick.push({ p: cur, c });
    let v;
    if (trick.length === 4) {
      const w = winnerOf(trick, trump), saved = trick.splice(0, 4);
      tr[w]++;
      v = exact(ctx, p, hands, trick, tr, trump, w);
      tr[w]--;
      trick.push(...saved);
    } else v = exact(ctx, p, hands, trick, tr, trump, (cur + 1) % 4);
    trick.pop();
    h.splice(i, 0, c);
    if (maxi ? v > best : v < best) best = v;
  }
  return best;
}

function exactFirst(ctx, H, p, m, deal) {
  const hands = deal.map(h => h.slice()), tr = H.tricks.slice(), trick = H.trick.slice();
  const h = hands[p];
  h.splice(h.indexOf(m), 1);
  trick.push({ p, c: m });
  let cur = (p + 1) % 4;
  if (trick.length === 4) { const w = winnerOf(trick, H.trump); tr[w]++; trick.length = 0; cur = w; }
  return exact(ctx, p, hands, trick, tr, H.trump, cur);
}

export function chooseCard(G, p, P = aiParams(G.players[p].ai)) {
  const H = G.hand, hand = H.hands[p], leg = legal(hand, H.trick);
  if (leg.length === 1) return leg[0];
  if (P.noise && Math.random() < P.noise) return leg[(Math.random() * leg.length) | 0];
  // Boomke: the first lead names trump, so lead the top card of the strongest suit.
  if (H.trump == null && G.mode === 'boomke' && !H.trick.length) {
    const s = bestSuit(hand).s;
    return maxBy(hand.filter(c => suitOf(c) === s), rankOf);
  }
  const ctx = makeCtx(G, P);
  if (!P.samples) {
    const played = new Uint8Array(52);
    H.played.forEach(c => (played[c] = 1));
    return policy(ctx, p, hand, H.trick, H.trump, played);
  }
  const bias = P.infer ? makeBias(G) : null;
  const useExact = P.endgame && hand.length <= 3;
  const n = useExact ? Math.min(P.samples, 50) : Math.max(P.samples >> 2, Math.min(P.samples, Math.round(P.samples * 15 / leg.length)));
  const sum = new Array(leg.length).fill(0), sq = new Array(leg.length).fill(0);
  const t0 = now();
  let done = 0;
  for (let i = 0; i < n; i++) {
    const deal = sampleHands(H, p, P, bias);
    if (!deal) continue;
    leg.forEach((m, j) => {
      const v = useExact ? exactFirst(ctx, H, p, m, deal) : simulate(ctx, H, p, m, deal);
      sum[j] += v; sq[j] += v * v;
    });
    done++;
    if (P.maxMs && done >= 8 && now() - t0 > P.maxMs) break;
  }
  if (!done) return leg[0];
  let bj = 0, bv = -Infinity;
  const vals = leg.map((_, j) => {
    const mean = sum[j] / done, sd = Math.sqrt(Math.max(0, sq[j] / done - mean * mean));
    const v = mean + P.riskK * sd;
    if (v > bv + 1e-9) { bv = v; bj = j; }
    return v;
  });
  if (P.signals) {
    const sig = signalChoice(G, ctx, p, leg, vals, bv);
    if (sig != null) return sig;
  }
  return leg[bj];
}

// ---------------- partner signals ----------------
// Convention: when you cannot follow suit, your first discard is a low card of the suit you
// want your partner to lead. Partners read that discard when they next lead.
const SIGNAL_COST = 0.25; // largest expected loss (in points) accepted to send or follow a signal

const partnersOf = (ctx, p) => [0, 1, 2, 3].filter(q => q !== p && ctx.side(q) === ctx.side(p));

/** A suit worth asking for: not trump, held at least twice, headed by a sure winner or K-Q. */
export function wantedSuit(hand, trump, played) {
  let best = null, bestScore = 0;
  for (let s = 0; s < 4; s++) {
    if (s === trump) continue;
    const cards = hand.filter(c => suitOf(c) === s);
    if (cards.length < 2) continue;
    const top = maxBy(cards, rankOf);
    let score = isTop(top, hand, played) ? 3 : rankOf(top) === 13 && cards.some(c => rankOf(c) === 12) ? 2 : 0;
    if (!score) continue;
    score += cards.length * 0.2;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

/** The suit seat p's partner asked for with their first discard this deal, or null. */
export function partnerSignal(H, partners) {
  for (const d of H.discards || []) {
    if (!partners.includes(d.p)) continue;
    if (suitOf(d.c) === H.trump || rankOf(d.c) > 9) return null; // a trump or high card is not a signal
    return suitOf(d.c);
  }
  return null;
}

function signalChoice(G, ctx, p, leg, vals, bv) {
  const H = G.hand;
  if (ctx.goal(p) !== 'take') return null;
  const partners = partnersOf(ctx, p);
  if (!partners.length) return null;
  const pickFrom = cards => {
    let best = null, v = -Infinity;
    for (const c of cards) { const j = leg.indexOf(c); if (vals[j] > v) { v = vals[j]; best = c; } }
    return best != null && v >= bv - SIGNAL_COST ? best : null;
  };
  if (!H.trick.length) {
    // Leading: follow partner's request when it costs (almost) nothing.
    const s = partnerSignal(H, partners);
    return s == null ? null : pickFrom(leg.filter(c => suitOf(c) === s));
  }
  const ledSuit = suitOf(H.trick[0].c);
  const discarding = !leg.some(c => suitOf(c) === ledSuit);
  const alreadyDiscarded = (H.discards || []).some(d => d.p === p);
  if (!discarding || alreadyDiscarded) return null;
  const played = new Uint8Array(52);
  H.played.forEach(c => (played[c] = 1));
  const s = wantedSuit(H.hands[p], H.trump, played);
  if (s == null) return null;
  const low = minBy(leg.filter(c => suitOf(c) === s), rankOf);
  if (rankOf(low) > 9) return null; // too high to read as a signal
  return vals[leg.indexOf(low)] >= bv - SIGNAL_COST ? low : null;
}
