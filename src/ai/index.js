// Computer player. Bidding uses hand estimates; card play samples possible deals of the
// unseen cards (respecting known voids and publicly known cards) and plays each out with a
// fast heuristic policy, choosing the card with the best average score.
// Only public information plus the AI's own hand is used.
import { suitOf, rankOf, mk, shuffle, minBy, maxBy } from '../engine/cards.js';
import { legal, beats, winnerOf } from '../engine/rules.js';
import { isMis, sideTricks, scoreW, scoreB } from '../engine/scoring.js';
import { bidOptions } from '../engine/game.js';
import { est, bestSuit, misRisk } from './evaluate.js';

export function chooseAction(G, p) {
  const H = G.hand;
  if (H.phase === 'bid') return { type: 'bid', seat: p, bid: G.mode === 'wiezen' ? bidW(G, p) : bidB(G, p) };
  if (H.phase === 'alone') return { type: 'alone', seat: p, yes: est(H.hands[p], suitOf(H.turnCard)) >= 5.2 };
  if (H.phase === 'trump') return { type: 'trump', seat: p, suit: bestSuit(H.hands[p]).s };
  if (H.phase === 'play') return { type: 'play', seat: p, card: chooseCard(G, p) };
  return null;
}

// ---------------- bidding ----------------
function bidW(G, p) {
  const H = G.hand, hand = H.hands[p], opts = bidOptions(G, p);
  const T0 = est(hand, suitOf(H.turnCard)), Tb = bestSuit(hand).v;
  const want = [];
  if (T0 >= 12.5) want.push('soloslim');
  if (Tb >= 12.3) want.push('solo');
  if (misRisk(hand, true) === 0) want.push('openmis');
  if (Tb >= 11.6) want.push('abon12');
  if (misRisk(hand, false) <= 1) want.push('miserie');
  if (Tb >= 10.6) want.push('abon11');
  if (Tb >= 9.6) want.push('abon10');
  if (Tb >= 8.6) want.push('abon9');
  if (T0 >= 3.4) want.push('mee');
  if (T0 >= 3.9) want.push('vraag');
  for (const k of want) if (opts.includes(k)) return k;
  return 'pass';
}

function bidB(G, p) {
  const H = G.hand, A = H.A, opts = bidOptions(G, p), partner = (p + 2) % 4;
  const own = bestSuit(H.hands[p]).v;
  const pb = H.bids[partner];
  let bonus = 2.6;
  if (pb != null && pb !== 'pass') bonus += ((A.cur && A.cur.bidder === partner ? A.cur.level : 7) - 6) * 0.5;
  if (pb === 'pass') bonus -= 0.7;
  const team = own + bonus;
  if (opts.includes('meetje')) return team >= 12.6 ? 13 : 'meetje';
  if (A.cur && A.cur.bidder === partner) return 'pass';
  if (team >= 12.6 && opts.includes(13)) return 13;
  const min = A.cur ? A.cur.level + 1 : 7;
  if (min <= 12 && Math.floor(team) >= min) return min;
  return 'pass';
}

// ---------------- card play ----------------
function makeCtx(G) {
  const H = G.hand, C = H.contract, mode = G.mode;
  const side = p => (mode !== 'wiezen' ? p % 2 : p === C.bidder || p === C.partner ? 0 : 1);
  const goal = p => (mode === 'wiezen' && isMis(C.k) ? (p === C.bidder ? 'avoid' : 'push') : 'take');
  return { mode, C, side, goal };
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

function sampleHands(H, p) {
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
    const useVoids = attempt < 12;
    shuffle(pool);
    const h = base.map(x => x.slice()), left = need.slice();
    let ok = true;
    for (const c of pool) {
      const s = suitOf(c);
      let tot = 0;
      const el = [];
      for (let q = 0; q < 4; q++) if (q !== p && left[q] > 0 && !(useVoids && H.voids[q][s])) { el.push(q); tot += left[q]; }
      if (!el.length) { ok = false; break; }
      let r = Math.random() * tot, pick = el[0];
      for (const q of el) { r -= left[q]; if (r <= 0) { pick = q; break; } }
      h[pick].push(c);
      left[pick]--;
    }
    if (ok) return h;
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
    card = policy(ctx, cur, hands[cur], trick, trump, played);
  }
  return utility(ctx, p, tr);
}

export function chooseCard(G, p) {
  const H = G.hand, hand = H.hands[p], leg = legal(hand, H.trick);
  if (leg.length === 1) return leg[0];
  // Boomke: the first lead names trump, so lead the top card of the strongest suit.
  if (H.trump == null && G.mode === 'boomke' && !H.trick.length) {
    const s = bestSuit(hand).s;
    return maxBy(hand.filter(c => suitOf(c) === s), rankOf);
  }
  const ctx = makeCtx(G);
  const tot = new Array(leg.length).fill(0);
  const N = Math.max(24, Math.min(70, Math.round(900 / leg.length)));
  for (let i = 0; i < N; i++) {
    const deal = sampleHands(H, p);
    if (!deal) continue;
    leg.forEach((m, j) => (tot[j] += simulate(ctx, H, p, m, deal)));
  }
  let bj = 0;
  tot.forEach((v, j) => { if (v > tot[bj] + 1e-9) bj = j; });
  return leg[bj];
}
