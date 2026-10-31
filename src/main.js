import { t, setLang, getLang, onLangChange, LANGS } from './i18n/index.js';
import { prefs, savePrefs } from './prefs.js';
import { Controller } from './controller.js';
import { HandOrder, attachDrag } from './ui/hand.js';
import { renderTable, cardHTML } from './ui/table.js';
import { makeFmt } from './ui/format.js';
import { applyAction } from './engine/game.js';
import { LEVELS, AGGRESSION } from './ai/config.js';

const $ = id => document.getElementById(id);
const AI_NAMES = ['Jef', 'Mieke', 'Rik'];

let screen = 'menu';      // 'menu' | 'game'
let menuView = 'home';    // 'home' | 'solo'
let modal = null;         // { kind, render }
let summaryShownFor = null, summaryTimer = null;
const viewer = 0;         // the local player's seat

const handOrder = new HandOrder();
const ui = {
  handOrder,
  sortOpts: () => ({ sortDir: prefs.sortDir, trumpFirst: prefs.trumpFirst }),
  attachHand(el) {
    attachDrag(el, {
      onTap: card => ctrl.G && ctrl.dispatch({ type: 'play', seat: viewer, card }),
      onMove: (card, idx) => { handOrder.move(card, idx); render(); }
    });
  }
};

const ctrl = new Controller(() => { if (screen === 'game') render(); });

// ---------------- static text ----------------
function applyStaticText() {
  document.title = t('app.title');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
}

function langToggle() {
  return LANGS.map(([code, label]) => `<button type="button" data-lang="${code}" aria-pressed="${code === getLang()}">${label}</button>`).join('');
}

// ---------------- menu ----------------
function renderMenu() {
  $('langMenu').innerHTML = langToggle();
  const body = $('menuBody');
  if (menuView === 'home') {
    const saved = Controller.savedGame();
    body.innerHTML = `
      ${saved ? `<button type="button" class="menu-btn primary" data-act="resume"><div><b>${t('menu.resume')}</b><span>${t('mode.' + saved.G.mode)} · ${t('status.dealOf', { n: saved.G.dealNo, m: saved.G.maxDeals || '∞' })}</span></div></button>` : ''}
      <button type="button" class="menu-btn${saved ? '' : ' primary'}" data-act="solo"><div><b>${t('menu.solo')}</b><span>${t('menu.soloDesc')}</span></div></button>
      <button type="button" class="menu-btn" disabled><div><b>${t('menu.host')}</b></div><span class="soon">${t('menu.soon')}</span></button>
      <button type="button" class="menu-btn" disabled><div><b>${t('menu.join')}</b></div><span class="soon">${t('menu.soon')}</span></button>
      <div class="menu-row">
        <button type="button" class="btn" data-act="rules">${t('menu.rules')}</button>
        <button type="button" class="btn" data-act="settings">${t('menu.settings')}</button>
      </div>`;
  } else {
    const ch = (m) => `<button type="button" class="choice" data-act="pick" data-mode="${m}" aria-pressed="${m === prefs.mode}"><b>${t('mode.' + m)}</b><span>${t('modeDesc.' + m)}</span></button>`;
    body.innerHTML = `
      <h2 class="sheet-h">${t('setup.title')}</h2>
      <p class="menu-tag" style="text-transform:none;letter-spacing:0;font-size:.9rem">${t('setup.intro')}</p>
      <div class="choices">${ch('wiezen')}${ch('boomke')}${ch('klassiek')}</div>
      <h3 class="menu-h3">${t('setup.opponents')}</h3>
      ${seatTable()}
      <p class="hint">${t('aggrDesc')}</p>
      <div class="row">
        <label for="selDeals">${t('setup.deals')}<select id="selDeals">${[4, 8, 12, 16, 0].map(v => `<option value="${v}"${v === prefs.maxDeals ? ' selected' : ''}>${v || t('setup.endless')}</option>`).join('')}</select></label>
        <label for="selSpeed">${t('setup.speed')}<select id="selSpeed">${['slow', 'normal', 'fast'].map(v => `<option value="${v}"${v === prefs.speed ? ' selected' : ''}>${t('speed.' + v)}</option>`).join('')}</select></label>
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="home">${t('btn.back')}</button>
        <button type="button" class="btn primary" data-act="start">${t('btn.start')}</button>
      </div>`;
  }
}

function seatTable() {
  const opt = (list, prefix, sel) => list.map(v => `<option value="${v}"${v === sel ? ' selected' : ''}>${t(prefix + v)}</option>`).join('');
  const same = k => prefs.aiSeats.every(s => s[k] === prefs.aiSeats[0][k]) ? prefs.aiSeats[0][k] : '';
  const row = (label, i, lvl, agg, extra = '') => `<div class="seatrow">
      <span class="seatname">${label}${extra}</span>
      <select id="lvl${i}" data-seat="${i}" data-k="level" aria-label="${t('setup.level')}">${i === 'all' && !lvl ? '<option value="" selected>—</option>' : ''}${opt(LEVELS, 'level.', lvl)}</select>
      <select id="agg${i}" data-seat="${i}" data-k="aggression" aria-label="${t('setup.aggression')}">${i === 'all' && !agg ? '<option value="" selected>—</option>' : ''}${opt(AGGRESSION, 'aggr.', agg)}</select>
    </div>`;
  return `<div class="seats">
    <div class="seatrow head"><span></span><span>${t('setup.level')}</span><span>${t('setup.aggression')}</span></div>
    ${AI_NAMES.map((n, i) => row(n, i, prefs.aiSeats[i].level, prefs.aiSeats[i].aggression,
      prefs.mode !== 'wiezen' && i === 1 ? ` <small>(${t('setup.partner')})</small>` : '')).join('')}
    ${row(`<i>${t('setup.allSeats')}</i>`, 'all', same('level'), same('aggression'))}
    <p class="hint" id="lvlDesc">${AI_NAMES.map((n, i) => `${n}: ${t('levelDesc.' + prefs.aiSeats[i].level)}`).join(' · ')}</p>
  </div>`;
}

$('menu').addEventListener('change', e => {
  const sel = e.target.closest('select[data-seat]');
  if (!sel || !sel.value) return;
  const seats = prefs.aiSeats.map(s => ({ ...s })), k = sel.dataset.k;
  if (sel.dataset.seat === 'all') seats.forEach(s => (s[k] = sel.value));
  else seats[+sel.dataset.seat][k] = sel.value;
  const deals = $('selDeals').value, speed = $('selSpeed').value;
  savePrefs({ aiSeats: seats, maxDeals: +deals, speed });
  renderMenu();
  $(sel.id)?.focus();
});

$('menu').addEventListener('click', e => {
  const langBtn = e.target.closest('[data-lang]');
  if (langBtn) return changeLang(langBtn.dataset.lang);
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const act = a.dataset.act;
  if (act === 'solo') { menuView = 'solo'; renderMenu(); }
  else if (act === 'home') { menuView = 'home'; renderMenu(); }
  else if (act === 'pick') { savePrefs({ mode: a.dataset.mode, maxDeals: +$('selDeals').value, speed: $('selSpeed').value }); renderMenu(); }
  else if (act === 'rules') showRules();
  else if (act === 'settings') showSettings();
  else if (act === 'resume') { if (ctrl.resume()) showGame(); }
  else if (act === 'start') {
    savePrefs({ maxDeals: +$('selDeals').value, speed: $('selSpeed').value });
    ctrl.start({
      mode: prefs.mode, maxDeals: prefs.maxDeals, speed: prefs.speed,
      players: [{ name: null, kind: 'human' }, ...AI_NAMES.map((name, i) => ({ name, kind: 'ai', ai: { ...prefs.aiSeats[i] } }))]
    });
    showGame();
  }
});

function showMenu() {
  ctrl.stop();
  closeModal();
  screen = 'menu';
  menuView = 'home';
  $('game').hidden = true;
  $('menu').hidden = false;
  renderMenu();
}

function showGame() {
  screen = 'game';
  summaryShownFor = null;
  $('menu').hidden = true;
  $('game').hidden = false;
  render();
}

// ---------------- game ----------------
function render() {
  const G = ctrl.G;
  if (!G) return;
  if (G.phase === 'over') { renderTable(G, viewer, ui); if (!modal || modal.kind !== 'over') showGameOver(); return; }
  renderTable(G, viewer, ui);
  const H = G.hand;
  clearTimeout(summaryTimer);
  if (H.phase === 'handOver' && summaryShownFor !== H.id) {
    summaryTimer = setTimeout(() => { summaryShownFor = H.id; showSummary(); }, 700);
  }
}

$('bar').addEventListener('click', e => {
  const btn = e.target.closest('[data-v]');
  const G = ctrl.G;
  if (!btn || !G) return;
  const v = btn.dataset.v, H = G.hand;
  if (v === 'summary') return showSummary();
  if (H.turn !== viewer) return;
  if (H.phase === 'bid') {
    const bid = G.mode === 'wiezen' || v === 'pass' || v === 'meetje' ? v : +v;
    ctrl.dispatch({ type: 'bid', seat: viewer, bid });
  } else if (H.phase === 'alone') ctrl.dispatch({ type: 'alone', seat: viewer, yes: v === 'yes' });
  else if (H.phase === 'trump') ctrl.dispatch({ type: 'trump', seat: viewer, suit: +v });
});

$('pos0').addEventListener('click', e => {
  if (e.target.closest('[data-sort]')) { handOrder.reset(); render(); }
});

$('bLast').addEventListener('click', showLast);
$('bRules').addEventListener('click', showRules);
$('bSettings').addEventListener('click', showSettings);
$('bMenu').addEventListener('click', showMenu);

// ---------------- modals ----------------
function openModal(kind, renderFn) {
  modal = { kind, render: renderFn };
  $('sheet').innerHTML = renderFn();
  $('veil').hidden = false;
  const f = $('sheet').querySelector('.primary, button');
  if (f) f.focus({ preventScroll: true });
}
function closeModal() { modal = null; $('veil').hidden = true; }
const dismissable = () => modal && ['rules', 'settings', 'last'].includes(modal.kind);

$('veil').addEventListener('click', e => {
  if (e.target === $('veil') && dismissable()) return closeModal();
  const langBtn = e.target.closest('[data-lang]');
  if (langBtn) return changeLang(langBtn.dataset.lang);
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const act = a.dataset.act;
  if (act === 'close') closeModal();
  else if (act === 'next') { closeModal(); ctrl.dispatch({ type: 'next' }); }
  else if (act === 'menu') showMenu();
});
$('veil').addEventListener('change', e => {
  if (e.target.name === 'sortDir') { savePrefs({ sortDir: e.target.value }); handOrder.reset(); render(); }
  if (e.target.id === 'chkTrumpFirst') { savePrefs({ trumpFirst: e.target.checked }); handOrder.reset(); render(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && dismissable()) closeModal(); });

const closeRow = (label = t('btn.close')) =>
  `<div class="row"><span class="spacer"></span><button type="button" class="btn primary" data-act="close">${label}</button></div>`;

function showRules() {
  openModal('rules', () => `<h1>${t('menu.rules')}</h1>${t('rules.html')}${closeRow()}`);
}

function showSettings() {
  openModal('settings', () => `<h1>${t('settings.title')}</h1>
    <div class="field">${t('menu.language')}</div>
    <div class="langtoggle" role="group" aria-label="${t('menu.language')}">${langToggle()}</div>
    <h3>${t('settings.sortDir')}</h3>
    <label class="radio"><input type="radio" name="sortDir" value="asc"${prefs.sortDir === 'asc' ? ' checked' : ''}> ${t('settings.asc')}</label>
    <label class="radio"><input type="radio" name="sortDir" value="desc"${prefs.sortDir === 'desc' ? ' checked' : ''}> ${t('settings.desc')}</label>
    <label class="check"><input type="checkbox" id="chkTrumpFirst"${prefs.trumpFirst ? ' checked' : ''}> ${t('settings.trumpFirst')}</label>
    <p>${t('settings.dragHint')}</p>
    ${closeRow()}`);
}

function showLast() {
  const G = ctrl.G;
  if (!G || !G.hand.lastTrick) return;
  openModal('last', () => {
    const fmt = makeFmt(G, viewer), lt = G.hand.lastTrick;
    return `<h2>${t('last.title')}</h2><div class="lasttrick">${lt.cards.map(x => `<figure>${cardHTML(fmt, x.c, { trump: G.hand.trump, cls: x.p === lt.winner ? 'win' : '' })}<figcaption>${fmt.name(x.p)}</figcaption></figure>`).join('')}</div>
      <p>${t('last.took', { who: fmt.name(lt.winner), you: fmt.you(lt.winner) })}</p>${closeRow()}`;
  });
}

function showSummary() {
  const G = ctrl.G;
  if (!G || G.phase === 'over' || G.hand.phase !== 'handOver') return;
  openModal('summary', () => {
    const fmt = makeFmt(G, viewer), H = G.hand, C = H.contract, d = H.result.d;
    const team = G.mode !== 'wiezen';
    const cols = team ? [0, 1].map(fmt.teamName) : [0, 1, 2, 3].map(fmt.name);
    let verdict;
    if (G.mode === 'klassiek') {
      const us = viewer % 2;
      verdict = d[us] > d[1 - us] ? t('sum.klassiekUs') : d[us] < d[1 - us] ? t('sum.klassiekThem', { team: fmt.teamName(1 - us) }) : t('sum.klassiekTie');
    } else if (G.mode === 'boomke' && C.k === 'meetje') verdict = fmt.resultLine().replace(/<\/?b>/g, '');
    else verdict = t(H.result.made ? 'sum.verdictMade' : 'sum.verdictFailed', { who: fmt.playersOf(C), contract: fmt.contractName(C) });
    const tricks = team ? [0, 1].map(i => H.tricks[i] + H.tricks[i + 2]) : H.tricks;
    const box = (k, v, cls = '') => `<div><div class="k">${k}</div><div class="v ${cls}">${v}</div></div>`;
    const last = G.maxDeals && G.dealNo >= G.maxDeals;
    return `<h2>${t('sum.title', { n: G.dealNo })}</h2><p class="verdict">${verdict}</p>
      <h3>${t('sum.tricks')}</h3><div class="res">${cols.map((n, i) => box(n, tricks[i])).join('')}</div>
      <h3>${t('sum.points')}</h3><div class="res">${cols.map((n, i) => box(n, (d[i] > 0 ? '+' : '') + d[i], d[i] > 0 ? 'pos' : d[i] < 0 ? 'neg' : '')).join('')}</div>
      <h3>${t('sum.total')}</h3><div class="res">${cols.map((n, i) => box(n, G.scores[i])).join('')}</div>
      <div class="row"><span class="spacer"></span><button type="button" class="btn" data-act="close">${t('btn.lookTable')}</button><button type="button" class="btn primary" data-act="next">${t(last ? 'btn.final' : 'btn.next')}</button></div>`;
  });
}

function showGameOver() {
  const G = ctrl.G;
  openModal('over', () => {
    const fmt = makeFmt(G, viewer), team = G.mode !== 'wiezen';
    const ids = team ? [0, 1] : [0, 1, 2, 3];
    const order = ids.map(i => ({ i, n: team ? fmt.teamName(i) : fmt.name(i), s: G.scores[i] })).sort((a, b) => b.s - a.s);
    const top = order.filter(o => o.s === order[0].s);
    let msg;
    if (top.length > 1) msg = t('over.tie', { names: top.map(o => o.n).join(', ') });
    else if (team) msg = top[0].i === viewer % 2 ? t('over.teamWin') : t('over.otherTeamWins', { who: top[0].n });
    else msg = top[0].i === viewer ? t('over.youWin') : t('over.otherWins', { who: top[0].n });
    return `<h1>${t('over.title')}</h1><p class="verdict">${msg}</p>
      <div class="res">${order.map(o => `<div><div class="k">${o.n}</div><div class="v">${o.s}</div></div>`).join('')}</div>
      <div class="row"><span class="spacer"></span><button type="button" class="btn primary" data-act="menu">${t('btn.playAgain')}</button></div>`;
  });
}

// ---------------- language ----------------
function changeLang(l) {
  savePrefs({ lang: l });
  setLang(l);
}
onLangChange(() => {
  applyStaticText();
  if (screen === 'menu') renderMenu(); else render();
  if (modal) $('sheet').innerHTML = modal.render();
});

// ---------------- boot ----------------
setLang(prefs.lang);
applyStaticText();
showMenu();

// Exposed for debugging and automated checks.
window.__boomwies = { ctrl, applyAction };
