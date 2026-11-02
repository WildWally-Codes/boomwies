// Pure game engine: a plain, serialisable state object changed only through applyAction().
// Seats 0..3 clockwise; play passes to (seat + 1) % 4. Team 0 = seats 0 & 2, team 1 = seats 1 & 3.
import { suitOf, rankOf, mk, shuffle, sum } from './cards.js';
import { legal, winnerOf } from './rules.js';
import { WDEF, SPECIALS, isMis, sideTricks, scoreHand } from './scoring.js';

export const MODES = ['wiezen', 'boomke', 'klassiek'];

/**
 * @param {{mode:string, maxDeals:number, players:{name:string|null, kind:'human'|'ai'}[], dealer?:number}} opts
 */
export function createGame({ mode, maxDeals = 12, players, dealer }, rng = Math.random) {
  const G = {
    mode, maxDeals,
    players: players.map(p => ({ ...p })),
    dealer: dealer ?? ((rng() * 4) | 0),
    dealNo: 0,
    scores: mode === 'wiezen' ? [0, 0, 0, 0] : [0, 0],
    history: [],
    phase: 'deal',
    hand: null
  };
  startDeal(G, rng);
  return G;
}

const ev = (H, e) => { H.events.push(e); if (H.events.length > 80) H.events.shift(); };

export function startDeal(G, rng = Math.random) {
  G.dealNo++;
  const deck = shuffle([...Array(52).keys()], rng);
  const hands = [[], [], [], []];
  let i = 0;
  for (const n of [4, 4, 5]) for (let k = 1; k <= 4; k++) {
    const p = (G.dealer + k) % 4;
    for (let j = 0; j < n; j++) hands[p].push(deck[i++]);
  }
  const turnCard = deck[51]; // last card dealt, always the dealer's
  const H = {
    id: `${G.dealNo}-${Math.floor(rng() * 1e9)}`,
    hands, turnCard, trump: null, contract: null, phase: 'bid', turn: (G.dealer + 1) % 4,
    trick: [], leader: null, tricks: [0, 0, 0, 0], played: [],
    voids: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    known: [[], [], [], []], lastTrick: null, revealed: null, discards: [],
    bids: [null, null, null, null],
    A: { cur: null, passed: [false, false, false, false] },
    events: [], result: null, pendingLeader: null
  };
  G.hand = H;
  G.phase = 'play';
  ev(H, { e: 'deal', p: G.dealer, n: G.dealNo });
  if (G.mode === 'klassiek') {
    H.trump = suitOf(turnCard);
    H.known[G.dealer] = [turnCard];
    H.contract = { k: 'klassiek' };
    ev(H, { e: 'turnedTrump', c: turnCard });
    startPlay(H, (G.dealer + 1) % 4);
  } else if (G.mode === 'wiezen') {
    H.known[G.dealer] = [turnCard];
    ev(H, { e: 'turned', c: turnCard });
    checkTroel(H);
    H.turn = nextBidderW(H, G.dealer);
  }
  return G;
}

// ---------------- Wiezen auction ----------------
function checkTroel(H) {
  for (let p = 0; p < 4; p++) {
    const aces = H.hands[p].filter(c => rankOf(c) === 14);
    if (aces.length < 3) continue;
    let card, trump, need, name;
    if (aces.length === 3) {
      const s = [0, 1, 2, 3].find(s => !aces.some(c => suitOf(c) === s));
      card = mk(s, 14); trump = s; need = 8; name = 'troel';
    } else {
      let r = 13;
      while (H.hands[p].includes(mk(1, r))) r--;
      card = mk(1, r); trump = 1; need = 9; name = 'troela';
    }
    const partner = [0, 1, 2, 3].find(q => H.hands[q].includes(card));
    H.A.cur = { k: 'troel', rank: 15, bidder: p, partner, trump, need, name, card };
    if (!H.known[partner].includes(card)) H.known[partner].push(card); // may already be the turned card
    H.bids[p] = name; H.bids[partner] = 'partner';
    ev(H, { e: 'troel', p, partner, name, card, trump, aces: aces.length });
    return;
  }
}

const isHolder = (H, p) => { const c = H.A.cur; return !!c && (c.bidder === p || c.partner === p); };

function nextBidderW(H, from) {
  for (let k = 1; k <= 4; k++) {
    const p = (from + k) % 4;
    if (!H.A.passed[p] && !isHolder(H, p)) return p;
  }
  return -1;
}

export function bidOptions(G, p) {
  const H = G.hand;
  if (G.mode === 'wiezen') {
    const cur = H.A.cur, o = ['pass'];
    if (!cur) o.push('vraag');
    if (cur && cur.k === 'vraag' && cur.partner == null && cur.bidder !== p) o.push('mee');
    const r = cur ? cur.rank : 0;
    for (const k of SPECIALS) if (WDEF[k].rank > r) o.push(k);
    return o;
  }
  const A = H.A, passedN = A.passed.filter(Boolean).length;
  if (!A.cur && passedN === 3) return [7, 13, 'meetje'];
  const o = ['pass'];
  for (let l = A.cur ? A.cur.level + 1 : 7; l <= 13; l++) o.push(l);
  return o;
}

function applyBidW(G, p, k) {
  const H = G.hand, A = H.A;
  if (k === 'pass') A.passed[p] = true;
  else if (k === 'vraag') A.cur = { k, rank: 10, bidder: p, partner: null };
  else if (k === 'mee') A.cur.partner = p;
  else A.cur = { k, rank: WDEF[k].rank, bidder: p, partner: null };
  H.bids[p] = k;
  ev(H, { e: 'bid', p, b: k, to: k === 'mee' ? A.cur.bidder : undefined });
  const n = nextBidderW(H, p);
  if (n < 0) endAuctionW(G); else H.turn = n;
}

function endAuctionW(G) {
  const H = G.hand, cur = H.A.cur;
  if (!cur) { H.phase = 'redeal'; H.turn = -1; ev(H, { e: 'allPass' }); return; }
  if (cur.k === 'vraag' && cur.partner == null) {
    H.phase = 'alone'; H.turn = cur.bidder; ev(H, { e: 'noJoin', p: cur.bidder }); return;
  }
  setupContractW(G, cur.k);
}

function setupContractW(G, k) {
  const H = G.hand, cur = H.A.cur, turned = suitOf(H.turnCard);
  const C = { k, bidder: cur.bidder, partner: cur.partner ?? null, need: 0, trump: null };
  if (k === 'vraag') { C.need = 8; C.trump = turned; }
  else if (k === 'alleen') { C.need = 5; C.trump = turned; C.partner = null; }
  else if (k === 'troel') { C.need = cur.need; C.trump = cur.trump; C.name = cur.name; }
  else if (k.startsWith('abon')) C.need = WDEF[k].need;
  else if (isMis(k)) C.need = 0;
  else if (k === 'solo') C.need = 13;
  else if (k === 'soloslim') { C.need = 13; C.trump = turned; }
  H.contract = C;
  const leader = k === 'solo' || k === 'soloslim' ? C.bidder : (G.dealer + 1) % 4;
  if (k.startsWith('abon') || k === 'solo') { H.phase = 'trump'; H.turn = C.bidder; H.pendingLeader = leader; }
  else { H.trump = C.trump; startPlay(H, leader); }
}

// ---------------- Boomke auction ----------------
function applyBidB(G, p, b) {
  const H = G.hand, A = H.A;
  let done = false;
  if (b === 'pass') A.passed[p] = true;
  else if (b === 'meetje') { A.cur = { meetje: true, level: 7, bidder: p }; done = true; }
  else { A.cur = { level: b, bidder: p }; if (b === 13) done = true; }
  H.bids[p] = b;
  ev(H, { e: 'bid', p, b });
  const passedN = A.passed.filter(Boolean).length;
  if (!done && A.cur && passedN === 3) done = true;
  if (!done) {
    let n = -1;
    for (let k = 1; k <= 4; k++) {
      const q = (p + k) % 4;
      if (!A.passed[q] && !(A.cur && A.cur.bidder === q)) { n = q; break; }
    }
    if (n < 0) done = true; else H.turn = n;
  }
  if (done) {
    const cur = A.cur;
    H.contract = { k: cur.meetje ? 'meetje' : 'bid', level: cur.level, bidder: cur.bidder, team: cur.bidder % 2, trump: null };
    ev(H, { e: 'contract', p: cur.bidder });
    startPlay(H, cur.bidder);
  }
}

// ---------------- play ----------------
function startPlay(H, leader) { H.phase = 'play'; H.leader = leader; H.turn = leader; }

export function legalCards(G, p) {
  const H = G.hand;
  if (H.phase !== 'play' || H.turn !== p) return [];
  return legal(H.hands[p], H.trick);
}

function playCard(G, p, c) {
  const H = G.hand, hand = H.hands[p];
  if (H.trick.length) {
    const ls = suitOf(H.trick[0].c);
    if (suitOf(c) !== ls) {
      H.voids[p][ls] = 1;
      // Discards are public; partners read the first one as a signal for the suit to lead.
      (H.discards || (H.discards = [])).push({ p, c, trump: H.trump });
    }
  }
  if (!H.trick.length && H.trump == null && G.mode === 'boomke') {
    H.trump = suitOf(c); H.contract.trump = H.trump;
    ev(H, { e: 'leadTrump', p, c });
  }
  hand.splice(hand.indexOf(c), 1);
  H.known[p] = H.known[p].filter(x => x !== c);
  H.trick.push({ p, c });
  H.played.push(c);
  if (H.trick.length === 4) { H.phase = 'trickDone'; H.turn = -1; }
  else H.turn = (p + 1) % 4;
}

function collectTrick(G) {
  const H = G.hand, C = H.contract;
  const w = winnerOf(H.trick, H.trump);
  H.tricks[w]++;
  H.lastTrick = { cards: H.trick, winner: w };
  H.trick = [];
  H.leader = w;
  if (G.mode === 'wiezen' && C.k === 'openmis' && H.revealed == null) {
    H.revealed = C.bidder;
    H.known[C.bidder] = H.hands[C.bidder].slice();
    ev(H, { e: 'reveal', p: C.bidder });
  }
  if (handDecided(G)) endHand(G);
  else { H.phase = 'play'; H.turn = w; }
}

export function handDecided(G) {
  const H = G.hand, C = H.contract, tot = sum(H.tricks);
  if (tot === 13) return true;
  if (G.mode === 'wiezen') {
    if (isMis(C.k)) return H.tricks[C.bidder] > 0;
    if (C.need === 13) return tot - sideTricks(G.mode, C, H.tricks) > 0;
  }
  if (G.mode === 'boomke' && C.k === 'bid' && C.level === 13) return tot - sideTricks(G.mode, C, H.tricks) > 0;
  return false;
}

function endHand(G) {
  const H = G.hand, C = H.contract, d = scoreHand(G.mode, C, H.tricks);
  d.forEach((x, i) => (G.scores[i] += x));
  let made = null;
  if (G.mode === 'wiezen') made = d[C.bidder] > 0;
  else if (G.mode === 'boomke' && C.k !== 'meetje') made = d[C.team] > 0;
  H.result = { d, made };
  G.history.push({ n: G.dealNo, contract: { ...C }, d });
  H.phase = 'handOver';
  H.turn = -1;
  ev(H, { e: 'result' });
}

// ---------------- actions ----------------
function fail(msg) { throw new Error(msg); }

/**
 * Applies one action to the game state (mutates G). Throws on an illegal action.
 * Actions: {type:'bid',seat,bid} {type:'alone',seat,yes} {type:'trump',seat,suit}
 *          {type:'play',seat,card} {type:'collect'} {type:'redeal'} {type:'next'}
 */
export function applyAction(G, a, rng = Math.random) {
  const H = G.hand;
  if (G.phase === 'over') fail('game over');
  switch (a.type) {
    case 'bid': {
      if (H.phase !== 'bid' || H.turn !== a.seat) fail('not your bid');
      if (!bidOptions(G, a.seat).includes(a.bid)) fail('illegal bid');
      if (G.mode === 'wiezen') applyBidW(G, a.seat, a.bid); else applyBidB(G, a.seat, a.bid);
      break;
    }
    case 'alone': {
      if (H.phase !== 'alone' || H.turn !== a.seat) fail('not your decision');
      if (a.yes) { H.bids[a.seat] = 'alleen'; ev(H, { e: 'alone', p: a.seat }); setupContractW(G, 'alleen'); }
      else { H.bids[a.seat] = 'pass'; H.phase = 'redeal'; H.turn = -1; ev(H, { e: 'aloneNo', p: a.seat }); }
      break;
    }
    case 'trump': {
      if (H.phase !== 'trump' || H.turn !== a.seat) fail('not your trump choice');
      if (![0, 1, 2, 3].includes(a.suit)) fail('bad suit');
      H.trump = a.suit; H.contract.trump = a.suit;
      ev(H, { e: 'trump', p: a.seat, s: a.suit });
      startPlay(H, H.pendingLeader);
      break;
    }
    case 'play': {
      if (!legalCards(G, a.seat).includes(a.card)) fail('illegal card');
      playCard(G, a.seat, a.card);
      break;
    }
    case 'collect': {
      if (H.phase !== 'trickDone') fail('no trick to collect');
      collectTrick(G);
      break;
    }
    case 'redeal': {
      if (H.phase !== 'redeal') fail('no redeal pending');
      G.dealNo--; // same dealer, same deal number
      startDeal(G, rng);
      break;
    }
    case 'next': {
      if (H.phase !== 'handOver') fail('hand not over');
      G.dealer = (G.dealer + 1) % 4;
      if (G.maxDeals && G.dealNo >= G.maxDeals) G.phase = 'over';
      else startDeal(G, rng);
      break;
    }
    default: fail('unknown action ' + a.type);
  }
  return G;
}

// Whose input the game is waiting for, or null when an automatic step (collect/redeal) is due.
export function waitingFor(G) {
  if (G.phase === 'over') return null;
  const H = G.hand;
  if (['bid', 'alone', 'trump', 'play'].includes(H.phase)) return H.turn;
  return null;
}
