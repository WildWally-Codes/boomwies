// Turns engine state into localized text, from the point of view of one seat (the viewer).
import { t } from '../i18n/index.js';
import { SYM, suitOf, rankOf, isRed } from '../engine/cards.js';
import { isMis, sideTricks } from '../engine/scoring.js';

export const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function makeFmt(G, viewer) {
  const name = p => (p === viewer ? t('you') : esc(G.players[p].name || '?'));
  const you = p => p === viewer;
  const teamMembers = tm => (viewer % 2 === tm ? [viewer, (viewer + 2) % 4] : [tm, tm + 2]);
  const teamName = tm => teamMembers(tm).map(name).join(` ${t('and')} `);
  const rank = r => (r <= 10 ? String(r) : t('rank.' + r));
  const suitName = s => t('suit.' + s);
  const card = c => `${rank(rankOf(c))}${SYM[suitOf(c)]}`;
  const suitSpan = s => `<span class="s${isRed(s) ? ' red' : ''}">${SYM[s]}</span>`;

  function bidLabel(b) {
    if (b == null) return '';
    if (typeof b === 'number') return b === 13 ? t('bid.boom') : String(b);
    return t('bid.' + b);
  }

  function contractName(C) {
    if (!C) return '';
    if (G.mode === 'klassiek') return t('contract.klassiek');
    if (G.mode === 'boomke') return C.k === 'meetje' ? t('contract.meetje') : C.level === 13 ? t('contract.boom') : t('contract.bid', { n: C.level });
    if (C.k === 'vraag' || C.k === 'alleen') return t('contract.' + C.k);
    if (C.k === 'troel') return t('contract.' + C.name);
    return t('bid.' + C.k);
  }

  function playersOf(C) {
    if (G.mode !== 'wiezen') return teamName(C.team);
    return name(C.bidder) + (C.partner != null ? ` ${t('and')} ` + name(C.partner) : '');
  }

  function goalText(C) {
    return isMis(C.k) ? t('status.goalNone') : t('status.goalTricks', { n: C.need ?? C.level });
  }

  function resultLine() {
    const H = G.hand, C = H.contract, d = H.result.d;
    if (G.mode === 'klassiek') return t('res.klassiek', { a: teamName(0), b: teamName(1), x: d[0], y: d[1] });
    const T = sideTricks(G.mode, C, H.tricks);
    if (G.mode === 'boomke' && C.k === 'meetje') return t('res.meetje', { team: `<b>${teamName(T >= 7 ? C.team : 1 - C.team)}</b>` });
    const plural = G.mode !== 'wiezen' || C.partner != null;
    return t((H.result.made ? 'res.made' : 'res.failed') + (plural ? '.pl' : ''), { who: `<b>${playersOf(C)}</b>`, contract: contractName(C), t: T, goal: goalText(C) });
  }

  function event(e) {
    const H = G.hand, b = s => `<b>${s}</b>`;
    switch (e.e) {
      case 'deal': return t('ev.deal', { n: e.n, who: b(name(e.p)), you: you(e.p) });
      case 'turned': return t('ev.turned', { card: card(e.c), suit: suitName(suitOf(e.c)) });
      case 'turnedTrump': return t('ev.turnedTrump', { card: card(e.c), suit: suitName(suitOf(e.c)) });
      case 'troel': return t('ev.troel', { who: b(name(e.p)), you: you(e.p), n: e.aces, name: t('contract.' + e.name), partner: b(name(e.partner)), card: card(e.card), suit: suitName(e.trump) });
      case 'bid': {
        const p = { who: b(name(e.p)), you: you(e.p) };
        if (e.b === 'pass') return t('ev.pass', p);
        if (e.b === 'vraag') return t('ev.vraag', p);
        if (e.b === 'mee') return t('ev.mee', { ...p, other: name(e.to) });
        if (e.b === 'meetje') return t('ev.meetje', p);
        return t('ev.bid', { ...p, bid: e.b === 13 ? `${t('bid.boom')} (13)` : bidLabel(e.b) });
      }
      case 'allPass': return t('ev.allPass');
      case 'noJoin': return t('ev.noJoin', { who: name(e.p), you: you(e.p) });
      case 'alone': return t('ev.alone', { who: b(name(e.p)), you: you(e.p) });
      case 'aloneNo': return t('ev.aloneNo', { who: name(e.p), you: you(e.p) });
      case 'trump': return t('ev.trump', { who: b(name(e.p)), you: you(e.p), suit: suitName(e.s) });
      case 'leadTrump': return t('ev.leadTrump', { who: b(name(e.p)), you: you(e.p), card: card(e.c), suit: suitName(suitOf(e.c)) });
      case 'contract': {
        const C = H.contract;
        if (C.k === 'meetje') return t('ev.contractMeetje', { who: name(e.p) });
        return t('ev.contractB', { team: teamName(C.team), n: C.level, who: name(e.p) });
      }
      case 'reveal': return t('ev.reveal', { who: name(e.p), you: you(e.p) });
      case 'result': return resultLine();
      default: return '';
    }
  }

  return { name, you, teamName, teamMembers, rank, suitName, card, suitSpan, bidLabel, contractName, playersOf, goalText, resultLine, event };
}
