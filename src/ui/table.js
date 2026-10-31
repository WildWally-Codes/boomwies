// Draws the table from the viewer's seat: the viewer is always at the bottom,
// the next player clockwise on the left, the one opposite at the top.
import { t } from '../i18n/index.js';
import { SYM, suitOf, rankOf, isRed } from '../engine/cards.js';
import { winnerOf } from '../engine/rules.js';
import { bidOptions, legalCards } from '../engine/game.js';
import { isMis, sideTricks } from '../engine/scoring.js';
import { makeFmt, esc } from './format.js';

const $ = id => document.getElementById(id);
const posOf = (seat, viewer) => (seat - viewer + 4) % 4;
const BIDDING = ['bid', 'alone', 'trump', 'redeal'];

export function cardHTML(fmt, c, { trump = null, cls = '', attrs = '' } = {}) {
  const s = suitOf(c), r = rankOf(c);
  const aria = t('cardAria', { rank: r <= 10 ? r : t('rankName.' + r), suit: fmt.suitName(s) });
  return `<div class="card${isRed(s) ? ' r' : ''}${trump === s ? ' trump' : ''} ${cls}" data-card="${c}" ${attrs} aria-label="${esc(aria)}">` +
    `<span class="ix">${fmt.rank(r)}<i>${SYM[s]}</i></span><span class="pip">${SYM[s]}</span></div>`;
}

function roleChip(G, fmt, p) {
  const H = G.hand, C = H.contract;
  if (G.mode === 'wiezen') {
    if (C) {
      if (p === C.bidder) return `<span class="chip role">${fmt.contractName(C)}</span>`;
      if (p === C.partner) return `<span class="chip role">${t('chip.partner')}</span>`;
    } else if (H.A.cur && H.A.cur.k === 'troel' && H.A.cur.partner === p) return `<span class="chip role">${t('chip.troelPartner')}</span>`;
    return '';
  }
  if (G.mode === 'boomke' && C && p === C.bidder) return `<span class="chip role">${fmt.contractName(C)}</span>`;
  return '';
}

function nameplate(G, fmt, p) {
  const H = G.hand;
  const turn = H.turn === p && ['play', 'bid', 'alone', 'trump'].includes(H.phase);
  const team = G.mode !== 'wiezen' ? `<span class="chip team">${t('chip.team', { x: p % 2 === 0 ? 'A' : 'B' })}</span>` : '';
  const showTricks = !BIDDING.includes(H.phase);
  const tr = H.tricks[p];
  const pl = G.players[p];
  const ai = pl.kind === 'ai' && pl.ai
    ? `<span class="chip ai" title="${esc(t('setup.level') + ': ' + t('level.' + pl.ai.level) + ' · ' + t('setup.aggression') + ': ' + t('aggr.' + pl.ai.aggression))}">${t('level.' + pl.ai.level)} · ${t('aggr.' + pl.ai.aggression)}</span>`
    : '';
  return `<div class="nameplate${turn ? ' turn' : ''}"><span class="nm">${fmt.name(p)}</span>` +
    (p === G.dealer ? `<span class="chip dealer">${t('chip.dealer')}</span>` : '') + team + roleChip(G, fmt, p) +
    (showTricks ? `<span class="tricks">${tr === 1 ? t('tricks.1') : t('tricks.n', { n: tr })}</span>` : '') + ai + '</div>';
}

const bubble = (G, fmt, p) => (BIDDING.includes(G.hand.phase) ? fmt.bidLabel(G.hand.bids[p]) : '');

function renderOpponent(G, fmt, p, viewer) {
  const H = G.hand;
  const el = $('pos' + posOf(p, viewer));
  const cards = H.revealed === p
    ? `<div class="mini">${H.hands[p].map(c => cardHTML(fmt, c, { trump: H.trump })).join('')}</div>`
    : `<div class="backs">${H.hands[p].map(() => '<div class="back"></div>').join('')}</div>`;
  el.innerHTML = `${nameplate(G, fmt, p)}<div class="bubble">${bubble(G, fmt, p)}</div>${cards}`;
}

function renderMe(G, fmt, viewer, ui) {
  const H = G.hand, el = $('pos0');
  const order = ui.handOrder.arrange(H.id, H.hands[viewer], { ...ui.sortOpts(), trump: H.trump });
  const active = H.phase === 'play' && H.turn === viewer;
  const leg = active ? legalCards(G, viewer) : [];
  let html = '', prev = null;
  for (const c of order) {
    if (prev != null && suitOf(prev) !== suitOf(c)) html += '<span class="gap"></span>';
    const ok = leg.includes(c);
    html += cardHTML(fmt, c, { trump: H.trump, cls: active ? (ok ? 'ok' : 'no') : '', attrs: `tabindex="0" role="button"` });
    prev = c;
  }
  // Keep the hand container (and its drag listeners) alive between renders.
  if (!el.querySelector('.hand')) {
    el.innerHTML = `<div class="mehead"></div><div class="bubble"></div><div class="hand"></div>`;
    ui.attachHand(el.querySelector('.hand'));
  }
  el.querySelector('.mehead').innerHTML = nameplate(G, fmt, viewer) +
    `<button type="button" class="btn sortbtn" data-sort title="${esc(t('settings.dragHint'))}">${t('btn.sort')}</button>`;
  el.querySelector('.bubble').innerHTML = bubble(G, fmt, viewer);
  const hand = el.querySelector('.hand');
  hand.className = 'hand' + (active ? ' active' : '');
  hand.innerHTML = html;
}

function renderCenter(G, fmt, viewer) {
  const H = G.hand;
  const w = H.phase === 'trickDone' ? winnerOf(H.trick, H.trump) : -1;
  let html = '';
  for (let pos = 0; pos < 4; pos++) {
    const seat = (viewer + pos) % 4, tc = H.trick.find(x => x.p === seat);
    html += `<div class="slot p${pos}">${tc ? cardHTML(fmt, tc.c, { trump: H.trump, cls: seat === w ? 'win' : '' }) : ''}</div>`;
  }
  let mid = '';
  if (G.mode === 'wiezen' && !H.contract) mid = `<span class="lbl">${t('mid.turned')}</span>${cardHTML(fmt, H.turnCard)}`;
  else if (H.trump != null) mid = `<span class="lbl">${t('mid.trump')}</span><span class="bigsuit${isRed(H.trump) ? ' red' : ''}">${SYM[H.trump]}</span>`;
  else if (H.contract && G.mode === 'boomke') mid = `<span class="lbl">${t('mid.trump')}</span><span class="lbl">${t('mid.byLead')}</span>`;
  else if (H.contract && isMis(H.contract.k)) mid = `<span class="lbl">${t('mid.noTrump')}</span>`;
  $('center').innerHTML = html + `<div class="mid">${mid}</div>`;
}

function renderStatus(G, fmt) {
  const H = G.hand, C = H.contract;
  let s = `<span>${G.maxDeals ? t('status.dealOf', { n: `<b>${G.dealNo}</b>`, m: G.maxDeals }) : t('status.deal', { n: `<b>${G.dealNo}</b>` })}</span>`;
  s += `<span>${t('mode.' + G.mode)}</span>`;
  if (C && G.mode !== 'klassiek') {
    s += `<span>${t('status.progress', { who: `<b>${fmt.playersOf(C)}</b>`, contract: fmt.contractName(C), t: sideTricks(G.mode, C, H.tricks), goal: fmt.goalText(C) })}</span>`;
  } else if (C) {
    s += `<span>${fmt.teamName(0)} <b>${H.tricks[0] + H.tricks[2]}</b> · ${fmt.teamName(1)} <b>${H.tricks[1] + H.tricks[3]}</b></span>`;
  }
  if (H.trump != null) s += `<span class="trumpchip">${fmt.suitSpan(H.trump)} ${t('status.trump', { suit: fmt.suitName(H.trump) })}</span>`;
  $('status').innerHTML = s;
}

const optBtn = (val, label, hint, cls = '') =>
  `<button type="button" class="opt ${cls}" data-v="${val}">${label}${hint ? `<small>${hint}</small>` : ''}</button>`;

function renderBar(G, fmt, viewer) {
  const H = G.hand, C = H.contract;
  let say = '', opts = '';
  const mine = H.turn === viewer;
  if (H.phase === 'bid' && mine) {
    if (G.mode === 'wiezen') {
      const cur = H.A.cur;
      let curTxt = t('bar.noBidYet');
      if (cur) {
        if (cur.k === 'vraag' && cur.partner != null) curTxt = t('bar.currentPair', { who: fmt.name(cur.bidder), partner: fmt.name(cur.partner) });
        else curTxt = t('bar.current', { bid: cur.k === 'troel' ? t('contract.' + cur.name) : fmt.bidLabel(cur.k), who: fmt.name(cur.bidder) });
      }
      say = `<b>${t('bar.yourBid')}</b> ${curTxt}`;
      opts = bidOptions(G, viewer).map(k => (k === 'pass' ? optBtn('pass', t('bid.pass'), '', 'pass') : optBtn(k, t('bid.' + k), t('hint.' + k)))).join('');
    } else {
      const o = bidOptions(G, viewer), cur = H.A.cur;
      if (o.includes('meetje')) say = `<b>${t('bar.dealerForced')}</b>`;
      else if (cur) say = `<b>${t('bar.yourBid')}</b> ` + t(cur.bidder === (viewer + 2) % 4 ? 'bar.highestPartner' : 'bar.highest', { n: cur.level, who: fmt.name(cur.bidder) });
      else say = `<b>${t('bar.yourBid')}</b> ${t('bar.boomkeIntro')}`;
      opts = o.map(v => v === 'pass' ? optBtn('pass', t('bid.pass'), '', 'pass')
        : v === 'meetje' ? optBtn('meetje', t('bid.meetje'), t('hint.meetje'))
        : optBtn(v, v === 13 ? t('bid.boom') : String(v), v === 13 ? t('hint.boom') : '', 'big')).join('');
    }
  } else if (H.phase === 'alone' && mine) {
    say = `<b>${t('bar.noJoin')}</b>`;
    opts = optBtn('yes', t('bid.alleen'), t('hint.alleen')) + optBtn('no', t('bid.pass'), '', 'pass');
  } else if (H.phase === 'trump' && mine) {
    say = `<b>${t('bar.chooseTrump', { contract: fmt.contractName(C) })}</b>`;
    opts = [0, 1, 2, 3].map(s => `<button type="button" class="opt suit" data-v="${s}" aria-label="${fmt.suitName(s)}">${fmt.suitSpan(s)}</button>`).join('');
  } else if (H.phase === 'play' && mine) {
    if (H.trump == null && G.mode === 'boomke') say = `<b>${t('bar.leadSetsTrump')}</b>`;
    else if (!H.trick.length) say = `<b>${t('bar.yourLead')}</b>`;
    else {
      const ls = suitOf(H.trick[0].c);
      say = `<b>${t(H.hands[viewer].some(c => suitOf(c) === ls) ? 'bar.follow' : 'bar.noSuit', { suit: fmt.suitName(ls) })}</b>`;
    }
  } else if (H.phase === 'redeal') say = t('bar.redeal');
  else if (H.phase === 'trickDone') { const w = winnerOf(H.trick, H.trump); say = t('bar.takes', { who: `<b>${fmt.name(w)}</b>`, you: fmt.you(w) }); }
  else if (H.phase === 'handOver') { say = fmt.resultLine(); opts = optBtn('summary', t('btn.seeScore')); }
  else if (H.turn >= 0) {
    const key = H.phase === 'bid' ? 'bar.bidding' : H.phase === 'trump' ? 'bar.choosing' : H.phase === 'alone' ? 'bar.deciding' : 'bar.thinking';
    say = t(key, { who: fmt.name(H.turn) });
  }
  $('bar').innerHTML = `<div class="say">${say}</div><div class="opts">${opts}</div>`;
}

function renderScore(G, fmt) {
  const cols = G.mode === 'wiezen' ? [0, 1, 2, 3].map(fmt.name) : [0, 1].map(fmt.teamName);
  let h = `<table class="score"><thead><tr><th>${t('score.deal')}</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>`;
  for (const r of G.history) {
    const C = r.contract;
    let label = fmt.contractName(C);
    if (G.mode !== 'klassiek') label += ' · ' + fmt.name(C.bidder);
    h += `<tr><td title="${esc(label.replace(/<[^>]+>/g, ''))}">${r.n}. ${label}</td>${r.d.map(x => `<td class="${x > 0 ? 'pos' : x < 0 ? 'neg' : ''}">${x > 0 ? '+' : ''}${x}</td>`).join('')}</tr>`;
  }
  if (!G.history.length) h += `<tr><td class="empty" colspan="${cols.length + 1}">${t('score.empty')}</td></tr>`;
  h += `</tbody><tfoot><tr><td>${t('score.total')}</td>${G.scores.map(x => `<td>${x}</td>`).join('')}</tr></tfoot></table>`;
  $('score').innerHTML = h;
}

function renderLog(G, fmt) {
  const el = $('log');
  el.innerHTML = G.hand.events.map(e => `<li>${fmt.event(e)}</li>`).join('');
  el.scrollTop = el.scrollHeight;
}

export function renderTable(G, viewer, ui) {
  const fmt = makeFmt(G, viewer);
  const sub = G.mode === 'boomke'
    ? t('modeSub.boomke', { a: fmt.teamName(viewer % 2), b: fmt.teamName(1 - (viewer % 2)) })
    : t('modeSub.' + G.mode);
  $('sub').innerHTML = sub;
  for (let p = 0; p < 4; p++) if (p !== viewer) renderOpponent(G, fmt, p, viewer);
  renderMe(G, fmt, viewer, ui);
  renderCenter(G, fmt, viewer);
  renderStatus(G, fmt);
  renderBar(G, fmt, viewer);
  renderScore(G, fmt);
  renderLog(G, fmt);
  $('bLast').disabled = !G.hand.lastTrick;
  return fmt;
}
