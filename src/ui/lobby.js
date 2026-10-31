// Lobby screens for hosted tables: seats, invite link, and the host's controls.
import { t } from '../i18n/index.js';
import { LEVELS, AGGRESSION } from '../ai/config.js';
import { esc } from './format.js';

export const inviteLink = code => `${location.origin}${location.pathname}?join=${encodeURIComponent(code)}`;

const opt = (list, prefix, sel) => list.map(v => `<option value="${v}"${v === sel ? ' selected' : ''}>${t(prefix + v)}</option>`).join('');

/**
 * @param {object} lobby public lobby
 * @param {{isHost:boolean, mySeat:number|null, status:string, error?:string}} me
 */
export function lobbyHTML(lobby, me) {
  const team = lobby.mode !== 'wiezen';
  const rows = lobby.seats.map((s, i) => {
    const mine = i === me.mySeat;
    let who, ctl = '';
    if (s.kind === 'ai') {
      who = `${esc(s.name)} <small>· ${t('lobby.computer')}</small>`;
      if (me.isHost) {
        ctl = `<select data-lobby-seat="${i}" data-k="level" aria-label="${t('setup.level')}">${opt(LEVELS, 'level.', s.ai.level)}</select>
               <select data-lobby-seat="${i}" data-k="aggression" aria-label="${t('setup.aggression')}">${opt(AGGRESSION, 'aggr.', s.ai.aggression)}</select>`;
      } else {
        ctl = `<span class="lobby-ai">${t('level.' + s.ai.level)} · ${t('aggr.' + s.ai.aggression)}</span>
               <button type="button" class="btn" data-act="sit" data-seat="${i}">${t('lobby.sit')}</button>`;
      }
    } else {
      who = `${esc(s.name)}${s.kind === 'host' ? ` <small>· ${t('lobby.hostTag')}</small>` : ''}${mine ? ` <span class="chip role">${t('lobby.youTag')}</span>` : ''}`;
      ctl = s.kind === 'remote' ? `<span class="${s.connected ? 'online' : 'offline'}">${t(s.connected ? 'lobby.online' : 'lobby.offline')}</span>` : '';
    }
    return `<div class="lobbyrow${mine ? ' mine' : ''}">
      <span class="compass">${t('seat.' + i)}${team ? ` <small>${t('chip.team', { x: i % 2 === 0 ? 'A' : 'B' })}</small>` : ''}</span>
      <span class="who">${who}</span><span class="ctl">${ctl}</span></div>`;
  }).join('');

  const status = me.isHost
    ? (me.status === 'open' ? t('lobby.open') : me.status === 'error' ? t('lobby.error', { err: esc(me.error || '') }) : t('lobby.opening'))
    : t('lobby.waiting');
  const link = inviteLink(lobby.code);
  return `
    <h2 class="sheet-h">${t('lobby.title')}</h2>
    <div class="codebox">
      <div><div class="field">${t('lobby.code')}</div><div class="code">${esc(lobby.code)}</div></div>
      <div class="invite"><div class="field">${t('lobby.invite')}</div>
        <div class="linkrow"><input id="inviteLink" type="text" readonly value="${esc(link)}" aria-label="${t('lobby.invite')}"><button type="button" class="btn" data-act="copy">${t('lobby.copy')}</button></div>
      </div>
    </div>
    <p class="hint">${t('mode.' + lobby.mode)} · ${lobby.maxDeals ? t('lobby.deals', { n: lobby.maxDeals }) : t('setup.endless')} · <span id="lobbyStatus">${status}</span></p>
    <div class="lobby">${rows}</div>
    <div class="row"><span class="spacer"></span>
      ${me.isHost
        ? `<button type="button" class="btn" data-act="closeTable">${t('lobby.close')}</button>
           <button type="button" class="btn primary" data-act="startTable"${me.status === 'open' ? '' : ' disabled'}>${t('btn.start')}</button>`
        : `<button type="button" class="btn" data-act="leaveTable">${t('lobby.leave')}</button>`}
    </div>`;
}
