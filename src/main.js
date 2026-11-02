import { t, setLang, getLang, onLangChange, LANGS } from './i18n/index.js';
import { prefs, savePrefs, loadJSON } from './prefs.js';
import { Controller } from './controller.js';
import { HandOrder, attachDrag } from './ui/hand.js';
import { renderTable, cardHTML } from './ui/table.js';
import { makeFmt, esc } from './ui/format.js';
import { lobbyHTML } from './ui/lobby.js';
import { applyAction } from './engine/game.js';
import { LEVELS, AGGRESSION } from './ai/config.js';
import { HostSession } from './net/host.js';
import { GuestSession, LAST_TABLE_KEY } from './net/guest.js';
import { normalizeCode, cleanName } from './net/protocol.js';

const $ = id => document.getElementById(id);
const AI_NAMES = ['Jef', 'Mieke', 'Rik'];

let screen = 'menu';      // 'menu' | 'game'
let menuView = 'home';    // 'home' | 'solo' | 'host' | 'join' | 'lobby'
let modal = null;         // { kind, render }
let summaryShownFor = null, summaryTimer = null;
let joinCode = '';

// The active table: solo (local controller), host (hosting friends) or guest (joined someone's table).
let session = null;
const soloCtrl = new Controller(() => { if (screen === 'game' && session?.kind === 'solo') render(); });
const curG = () => (!session ? null : session.kind === 'solo' ? soloCtrl.G : session.kind === 'host' ? session.host.G : session.guest.G);
const viewer = () => (session?.kind === 'guest' ? session.guest.seat : 0);
function act(a) {
  if (!session) return;
  if (session.kind === 'solo') soloCtrl.dispatch(a);
  else if (session.kind === 'host') session.host.ctrl.dispatch(a);
  else session.guest.send(a);
}

const handOrder = new HandOrder();
const ui = {
  handOrder,
  sortOpts: () => ({ sortDir: prefs.sortDir, trumpFirst: prefs.trumpFirst }),
  attachHand(el) {
    attachDrag(el, {
      onTap: card => curG() && act({ type: 'play', seat: viewer(), card }),
      onMove: (card, idx) => { handOrder.move(card, idx); render(); }
    });
  }
};

// ---------------- static text ----------------
function applyStaticText() {
  document.title = t('app.title');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
}

function langToggle() {
  return LANGS.map(([code, label]) => `<button type="button" data-lang="${code}" aria-pressed="${code === getLang()}">${label}</button>`).join('');
}

// ---------------- menu ----------------
function setupForm(kind) {
  const ch = m => `<button type="button" class="choice" data-act="pick" data-mode="${m}" aria-pressed="${m === prefs.mode}"><b>${t('mode.' + m)}</b><span>${t('modeDesc.' + m)}</span></button>`;
  const host = kind === 'host';
  return `
    <h2 class="sheet-h">${t(host ? 'host.title' : 'setup.title')}</h2>
    <p class="hint">${t(host ? 'host.intro' : 'setup.intro')}</p>
    ${host ? `<label class="field" for="nick">${t('host.nickname')}<input id="nick" type="text" maxlength="16" value="${esc(prefs.nickname || '')}" autocomplete="nickname"></label>` : ''}
    <div class="choices">${ch('wiezen')}${ch('boomke')}${ch('klassiek')}</div>
    <h3 class="menu-h3">${t(host ? 'host.empty' : 'setup.opponents')}</h3>
    ${seatTable()}
    <p class="hint">${t('aggrDesc')}</p>
    <div class="row">
      <label for="selDeals">${t('setup.deals')}<select id="selDeals">${[4, 8, 12, 16, 0].map(v => `<option value="${v}"${v === prefs.maxDeals ? ' selected' : ''}>${v || t('setup.endless')}</option>`).join('')}</select></label>
      <label for="selSpeed">${t('setup.speed')}<select id="selSpeed">${['slow', 'normal', 'fast'].map(v => `<option value="${v}"${v === prefs.speed ? ' selected' : ''}>${t('speed.' + v)}</option>`).join('')}</select></label>
      <span class="spacer"></span>
      <button type="button" class="btn" data-act="home">${t('btn.back')}</button>
      <button type="button" class="btn primary" data-act="${host ? 'openTable' : 'start'}">${t(host ? 'host.open' : 'btn.start')}</button>
    </div>`;
}

function guestStatusHTML(g) {
  const back = `<div class="row"><span class="spacer"></span><button type="button" class="btn primary" data-act="leaveTable">${t('btn.back')}</button></div>`;
  if (g.status === 'connecting') return `<h2 class="sheet-h">${t('join.title')}</h2><p class="hint">${t('join.connecting', { code: esc(g.code) })}</p>
    <div class="row"><span class="spacer"></span><button type="button" class="btn" data-act="leaveTable">${t('btn.back')}</button></div>`;
  if (g.status === 'notfound') return `<h2 class="sheet-h">${t('join.title')}</h2><p class="hint">${t('join.notfound', { code: esc(g.code) })}</p>${back}`;
  if (g.status === 'rejected') return `<h2 class="sheet-h">${t('join.title')}</h2><p class="hint">${t('join.rejected.' + (g.reason === 'full' ? 'full' : 'started'))}</p>${back}`;
  if (g.status === 'ended') return `<h2 class="sheet-h">${t('join.title')}</h2><p class="hint">${t('join.ended')}</p>${back}`;
  if (g.status === 'lost' && !g.lobby) return `<h2 class="sheet-h">${t('join.title')}</h2><p class="hint">${t('net.lost')}</p>${back}`;
  return null;
}

function renderMenu() {
  $('langMenu').innerHTML = langToggle();
  const body = $('menuBody');
  if (menuView === 'solo' || menuView === 'host') { body.innerHTML = setupForm(menuView); return; }
  if (menuView === 'join') {
    body.innerHTML = `<h2 class="sheet-h">${t('join.title')}</h2><p class="hint">${t('join.intro')}</p>
      <form id="joinForm" class="row" autocomplete="off">
        <label for="joinCode">${t('join.code')}<input id="joinCode" type="text" maxlength="8" value="${esc(joinCode)}" required autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.15em"></label>
        <label for="joinNick">${t('host.nickname')}<input id="joinNick" type="text" maxlength="16" value="${esc(prefs.nickname || '')}" required autocomplete="nickname"></label>
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="home">${t('btn.back')}</button>
        <button type="submit" class="btn primary">${t('join.go')}</button>
      </form>`;
    return;
  }
  if (menuView === 'lobby' && session?.kind === 'host') {
    const h = session.host;
    body.innerHTML = lobbyHTML(h.lobby, { isHost: true, mySeat: 0, status: h.status, error: h.error });
    return;
  }
  if (menuView === 'lobby' && session?.kind === 'guest') {
    const g = session.guest;
    body.innerHTML = guestStatusHTML(g) || lobbyHTML(g.lobby, { isHost: false, mySeat: g.seat, status: g.status }) +
      (g.status === 'lost' ? `<p class="hint warn">${t('net.lost')}</p>` : '');
    return;
  }
  // home
  // The Claude artifact build is single-player only: it cannot open outside network connections.
  const solo = Controller.savedGame(), hosted = __ARTIFACT__ ? null : HostSession.saved(), last = __ARTIFACT__ ? null : loadJSON(LAST_TABLE_KEY);
  const big = (actName, title, desc, primary) => `<button type="button" class="menu-btn${primary ? ' primary' : ''}" data-act="${actName}"><div><b>${title}</b><span>${desc}</span></div></button>`;
  const dealTxt = G => `${t('mode.' + G.mode)} · ${t('status.dealOf', { n: G.dealNo, m: G.maxDeals || '∞' })}`;
  body.innerHTML = `
    ${solo ? big('resume', t('menu.resume'), dealTxt(solo.G), true) : ''}
    ${hosted ? big('resumeHost', t('menu.resumeHost', { code: esc(hosted.lobby.code) }), dealTxt(hosted.G), !solo) : ''}
    ${last ? big('rejoin', t('menu.rejoin', { code: esc(last.code) }), t('menu.rejoinDesc'), !solo && !hosted) : ''}
    ${big('solo', t('menu.solo'), t('menu.soloDesc'), !solo && !hosted && !last)}
    ${__ARTIFACT__ ? `<p class="hint">${t('menu.artifactNote')}</p>` : big('host', t('menu.host'), t('menu.hostDesc')) + big('join', t('menu.join'), t('menu.joinDesc'))}
    <div class="menu-row">
      <button type="button" class="btn" data-act="rules">${t('menu.rules')}</button>
      <button type="button" class="btn" data-act="settings">${t('menu.settings')}</button>
    </div>`;
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
    <p class="hint">${AI_NAMES.map((n, i) => `${n}: ${t('levelDesc.' + prefs.aiSeats[i].level)}`).join(' · ')}</p>
  </div>`;
}

function saveFormPrefs() {
  const patch = {};
  if ($('selDeals')) patch.maxDeals = +$('selDeals').value;
  if ($('selSpeed')) patch.speed = $('selSpeed').value;
  if ($('nick')) patch.nickname = cleanName($('nick').value);
  savePrefs(patch);
}

$('menu').addEventListener('change', e => {
  const lobbySel = e.target.closest('select[data-lobby-seat]');
  if (lobbySel && session?.kind === 'host') return session.host.setAi(+lobbySel.dataset.lobbySeat, { [lobbySel.dataset.k]: lobbySel.value });
  const sel = e.target.closest('select[data-seat]');
  if (!sel || !sel.value) return;
  const seats = prefs.aiSeats.map(s => ({ ...s })), k = sel.dataset.k;
  if (sel.dataset.seat === 'all') seats.forEach(s => (s[k] = sel.value));
  else seats[+sel.dataset.seat][k] = sel.value;
  saveFormPrefs();
  savePrefs({ aiSeats: seats });
  renderMenu();
  $(sel.id)?.focus();
});

$('menu').addEventListener('submit', e => {
  if (e.target.id !== 'joinForm') return;
  e.preventDefault();
  const code = normalizeCode($('joinCode').value), name = cleanName($('joinNick').value);
  if (!code || !name) return;
  savePrefs({ nickname: name });
  startGuest(code, name);
});

$('menu').addEventListener('click', e => {
  const langBtn = e.target.closest('[data-lang]');
  if (langBtn) return changeLang(langBtn.dataset.lang);
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const name = a.dataset.act;
  if (name === 'solo' || name === 'host' || name === 'join') { menuView = name; renderMenu(); }
  else if (name === 'home') { menuView = 'home'; renderMenu(); }
  else if (name === 'pick') { saveFormPrefs(); savePrefs({ mode: a.dataset.mode }); renderMenu(); }
  else if (name === 'rules') showRules();
  else if (name === 'settings') showSettings();
  else if (name === 'resume') { session = { kind: 'solo' }; if (soloCtrl.resume()) showGame(); }
  else if (name === 'start') {
    saveFormPrefs();
    session = { kind: 'solo' };
    soloCtrl.start({
      mode: prefs.mode, maxDeals: prefs.maxDeals, speed: prefs.speed,
      players: [{ name: null, kind: 'human' }, ...AI_NAMES.map((n, i) => ({ name: n, kind: 'ai', ai: { ...prefs.aiSeats[i] } }))]
    });
    showGame();
  }
  else if (name === 'openTable') {
    saveFormPrefs();
    const host = new HostSession({
      name: prefs.nickname || 'Host', mode: prefs.mode, maxDeals: prefs.maxDeals, speed: prefs.speed,
      aiSeats: AI_NAMES.map((n, i) => ({ name: n, ai: { ...prefs.aiSeats[i] } })), onUpdate: onNet
    });
    session = { kind: 'host', host };
    menuView = 'lobby';
    host.open();
    renderMenu();
  }
  else if (name === 'resumeHost') {
    const host = HostSession.resume(onNet);
    if (!host) return renderMenu();
    session = { kind: 'host', host };
    host.open();
    showGame();
  }
  else if (name === 'rejoin') {
    const last = loadJSON(LAST_TABLE_KEY);
    if (last) startGuest(last.code, last.name);
  }
  else if (name === 'startTable' && session?.kind === 'host') { session.host.start(); showGame(); }
  else if (name === 'closeTable' && session?.kind === 'host') { session.host.close(true); session = null; showMenu(); }
  else if (name === 'leaveTable' && session?.kind === 'guest') { session.guest.leave(); session = null; showMenu(); }
  else if (name === 'sit' && session?.kind === 'guest') session.guest.sit(+a.dataset.seat);
  else if (name === 'copy') copyInvite(a);
});

function copyInvite(btn) {
  const input = $('inviteLink');
  const done = () => { btn.textContent = t('lobby.copied'); setTimeout(() => (btn.textContent = t('lobby.copy')), 1500); };
  if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(done, () => { input.select(); });
  else input.select();
}

function startGuest(code, name) {
  const guest = new GuestSession({ code, name, onUpdate: onNet });
  session = { kind: 'guest', guest };
  menuView = 'lobby';
  guest.connect();
  renderMenu();
}

// Network updates from a host or guest session.
function onNet() {
  if (!session || session.kind === 'solo') return;
  const g = session.kind === 'guest' ? session.guest : null;
  const started = session.kind === 'host' ? session.host.lobby.started : g.status === 'game' || (g.status === 'lost' && g.G);
  if (started && screen !== 'game') return showGame();
  if (!started && g && screen === 'game' && ['ended', 'rejected'].includes(g.status)) { screen = 'menu'; closeModal(); $('game').hidden = true; $('menu').hidden = false; menuView = 'lobby'; }
  if (screen === 'game') render(); else renderMenu();
}

function showMenu() {
  soloCtrl.stop();
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
function renderNetBanner() {
  let msg = '';
  if (session?.kind === 'guest' && session.guest.status === 'lost') msg = t('net.lost');
  else if (session?.kind === 'host' && session.host.status === 'error') msg = t('net.brokerError');
  else if (session?.kind === 'host' && session.host.status === 'opening') msg = t('lobby.opening');
  else if (session?.kind === 'host') msg = t('net.hosting', { code: esc(session.host.lobby.code) });
  else if (session?.kind === 'guest') msg = t('net.guest', { code: esc(session.guest.code) });
  $('netbanner').innerHTML = msg;
  $('netbanner').hidden = !msg;
  $('netbanner').className = 'netbanner' + ((session?.kind === 'guest' && session.guest.status === 'lost') || (session?.kind === 'host' && session.host.status === 'error') ? ' warn' : '');
}

function render() {
  const G = curG();
  renderNetBanner();
  if (!G) return;
  const v = viewer();
  renderTable(G, v, ui);
  if (G.phase === 'over') { if (!modal || modal.kind !== 'over') showGameOver(); return; }
  const H = G.hand;
  if (modal?.kind === 'summary' && H.phase !== 'handOver') closeModal();
  clearTimeout(summaryTimer);
  if (H.phase === 'handOver' && summaryShownFor !== H.id) {
    summaryTimer = setTimeout(() => { summaryShownFor = H.id; showSummary(); }, 700);
  }
}

$('bar').addEventListener('click', e => {
  const btn = e.target.closest('[data-v]');
  const G = curG(), me = viewer();
  if (!btn || !G) return;
  const v = btn.dataset.v, H = G.hand;
  if (v === 'summary') return showSummary();
  if (H.turn !== me) return;
  if (H.phase === 'bid') {
    const bid = G.mode === 'wiezen' || v === 'pass' || v === 'meetje' ? v : +v;
    act({ type: 'bid', seat: me, bid });
  } else if (H.phase === 'alone') act({ type: 'alone', seat: me, yes: v === 'yes' });
  else if (H.phase === 'trump') act({ type: 'trump', seat: me, suit: +v });
});

$('pos0').addEventListener('click', e => {
  if (e.target.closest('[data-sort]')) { handOrder.reset(); render(); }
});

$('bLast').addEventListener('click', showLast);
$('bRules').addEventListener('click', showRules);
$('bSettings').addEventListener('click', showSettings);
$('bMenu').addEventListener('click', () => {
  if (!session || session.kind === 'solo') return showMenu();
  showLeave();
});

// ---------------- modals ----------------
function openModal(kind, renderFn) {
  modal = { kind, render: renderFn };
  $('sheet').innerHTML = renderFn();
  $('veil').hidden = false;
  const f = $('sheet').querySelector('.primary, button');
  if (f) f.focus({ preventScroll: true });
}
function closeModal() { modal = null; $('veil').hidden = true; }
const dismissable = () => modal && ['rules', 'settings', 'last', 'leave'].includes(modal.kind);

$('veil').addEventListener('click', e => {
  if (e.target === $('veil') && dismissable()) return closeModal();
  const langBtn = e.target.closest('[data-lang]');
  if (langBtn) return changeLang(langBtn.dataset.lang);
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const name = a.dataset.act;
  if (name === 'close') closeModal();
  else if (name === 'next') { closeModal(); act({ type: 'next' }); }
  else if (name === 'menu') { endSession(false); showMenu(); }
  else if (name === 'pauseTable') { endSession(false); showMenu(); }
  else if (name === 'endTable') { endSession(true); showMenu(); }
});
$('veil').addEventListener('change', e => {
  if (e.target.name === 'sortDir') { savePrefs({ sortDir: e.target.value }); handOrder.reset(); render(); }
  if (e.target.id === 'chkTrumpFirst') { savePrefs({ trumpFirst: e.target.checked }); handOrder.reset(); render(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && dismissable()) closeModal(); });

/** Leaves the current table. Hosts pause (end=false) or close it for everyone (end=true). */
function endSession(end) {
  if (session?.kind === 'host') session.host.close(end || session.host.G?.phase === 'over');
  if (session?.kind === 'guest') session.guest.leave();
  session = null;
}

const closeRow = (label = t('btn.close')) =>
  `<div class="row"><span class="spacer"></span><button type="button" class="btn primary" data-act="close">${label}</button></div>`;

function showLeave() {
  openModal('leave', () => session?.kind === 'host'
    ? `<h2>${t('leave.title')}</h2><p>${t('leave.pauseDesc')}</p><p>${t('leave.endDesc')}</p>
       <div class="row"><span class="spacer"></span><button type="button" class="btn" data-act="close">${t('leave.cancel')}</button>
       <button type="button" class="btn" data-act="endTable">${t('leave.end')}</button>
       <button type="button" class="btn primary" data-act="pauseTable">${t('leave.pause')}</button></div>`
    : `<h2>${t('leave.title')}</h2><p>${t('leave.guestDesc')}</p>
       <div class="row"><span class="spacer"></span><button type="button" class="btn" data-act="close">${t('leave.cancel')}</button>
       <button type="button" class="btn primary" data-act="menu">${t('lobby.leave')}</button></div>`);
}

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
  const G = curG();
  if (!G || !G.hand.lastTrick) return;
  openModal('last', () => {
    const fmt = makeFmt(G, viewer()), lt = G.hand.lastTrick;
    return `<h2>${t('last.title')}</h2><div class="lasttrick">${lt.cards.map(x => `<figure>${cardHTML(fmt, x.c, { trump: G.hand.trump, cls: x.p === lt.winner ? 'win' : '' })}<figcaption>${fmt.name(x.p)}</figcaption></figure>`).join('')}</div>
      <p>${t('last.took', { who: fmt.name(lt.winner), you: fmt.you(lt.winner) })}</p>${closeRow()}`;
  });
}

function showSummary() {
  if (!curG() || curG().phase === 'over' || curG().hand.phase !== 'handOver') return;
  openModal('summary', () => {
    const G = curG(), me = viewer();
    const fmt = makeFmt(G, me), H = G.hand, C = H.contract, d = H.result.d;
    const team = G.mode !== 'wiezen';
    const cols = team ? [0, 1].map(fmt.teamName) : [0, 1, 2, 3].map(fmt.name);
    let verdict;
    if (G.mode === 'klassiek') {
      const us = me % 2;
      verdict = d[us] > d[1 - us] ? t('sum.klassiekUs') : d[us] < d[1 - us] ? t('sum.klassiekThem', { team: fmt.teamName(1 - us) }) : t('sum.klassiekTie');
    } else if (G.mode === 'boomke' && C.k === 'meetje') verdict = fmt.resultLine().replace(/<\/?b>/g, '');
    else verdict = t(H.result.made ? 'sum.verdictMade' : 'sum.verdictFailed', { who: fmt.playersOf(C), contract: fmt.contractName(C) });
    const tricks = team ? [0, 1].map(i => H.tricks[i] + H.tricks[i + 2]) : H.tricks;
    const box = (k, v, cls = '') => `<div><div class="k">${k}</div><div class="v ${cls}">${v}</div></div>`;
    const last = G.maxDeals && G.dealNo >= G.maxDeals;
    const guest = session?.kind === 'guest';
    return `<h2>${t('sum.title', { n: G.dealNo })}</h2><p class="verdict">${verdict}</p>
      <h3>${t('sum.tricks')}</h3><div class="res">${cols.map((n, i) => box(n, tricks[i])).join('')}</div>
      <h3>${t('sum.points')}</h3><div class="res">${cols.map((n, i) => box(n, (d[i] > 0 ? '+' : '') + d[i], d[i] > 0 ? 'pos' : d[i] < 0 ? 'neg' : '')).join('')}</div>
      <h3>${t('sum.total')}</h3><div class="res">${cols.map((n, i) => box(n, G.scores[i])).join('')}</div>
      ${guest ? `<p class="hint">${t('sum.waitHost', { who: fmt.name(0) })}</p>` : ''}
      <div class="row"><span class="spacer"></span><button type="button" class="btn${guest ? ' primary' : ''}" data-act="close">${t('btn.lookTable')}</button>
      ${guest ? '' : `<button type="button" class="btn primary" data-act="next">${t(last ? 'btn.final' : 'btn.next')}</button>`}</div>`;
  });
}

function showGameOver() {
  openModal('over', () => {
    const G = curG(), me = viewer();
    const fmt = makeFmt(G, me), team = G.mode !== 'wiezen';
    const ids = team ? [0, 1] : [0, 1, 2, 3];
    const order = ids.map(i => ({ i, n: team ? fmt.teamName(i) : fmt.name(i), s: G.scores[i] })).sort((a, b) => b.s - a.s);
    const top = order.filter(o => o.s === order[0].s);
    let msg;
    if (top.length > 1) msg = t('over.tie', { names: top.map(o => o.n).join(', ') });
    else if (team) msg = top[0].i === me % 2 ? t('over.teamWin') : t('over.otherTeamWins', { who: top[0].n });
    else msg = top[0].i === me ? t('over.youWin') : t('over.otherWins', { who: top[0].n });
    return `<h1>${t('over.title')}</h1><p class="verdict">${msg}</p>
      <div class="res">${order.map(o => `<div><div class="k">${o.n}</div><div class="v">${o.s}</div></div>`).join('')}</div>
      <div class="row"><span class="spacer"></span><button type="button" class="btn primary" data-act="menu">${t(session?.kind === 'solo' ? 'btn.playAgain' : 'over.back')}</button></div>`;
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
const params = new URLSearchParams(location.search);
if (!__ARTIFACT__ && params.get('join')) {
  joinCode = normalizeCode(params.get('join'));
  history.replaceState(null, '', location.pathname);
  menuView = 'join';
  renderMenu();
}

// Exposed for debugging and automated checks.
window.__boomwies = { soloCtrl, applyAction, get session() { return session; } };
