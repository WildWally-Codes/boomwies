// The local player's hand: default sorting, a remembered custom order, and drag-to-reorder.
import { suitOf, rankOf } from '../engine/cards.js';

// Suits alternate black/red so neighbouring groups are easy to tell apart.
const SUIT_ORDER = [0, 1, 3, 2];

export function sortCards(cards, { sortDir = 'asc', trumpFirst = false, trump = null } = {}) {
  const order = trumpFirst && trump != null ? [trump, ...SUIT_ORDER.filter(s => s !== trump)] : SUIT_ORDER;
  const dir = sortDir === 'desc' ? -1 : 1;
  return cards.slice().sort((a, b) => order.indexOf(suitOf(a)) - order.indexOf(suitOf(b)) || dir * (rankOf(a) - rankOf(b)));
}

/** Keeps the on-screen order of the hand for one deal. */
export class HandOrder {
  constructor() { this.handId = null; this.order = []; this.custom = false; }

  /** Returns the cards in display order for the current hand. */
  arrange(handId, cards, sortOpts) {
    if (handId !== this.handId) { this.handId = handId; this.custom = false; }
    if (!this.custom) this.order = sortCards(cards, sortOpts);
    else {
      const set = new Set(cards);
      this.order = this.order.filter(c => set.has(c));
      for (const c of cards) if (!this.order.includes(c)) this.order.push(c);
    }
    return this.order.slice();
  }

  move(card, toIndex) {
    const from = this.order.indexOf(card);
    if (from < 0) return;
    this.order.splice(from, 1);
    this.order.splice(toIndex > from ? toIndex - 1 : toIndex, 0, card);
    this.custom = true;
  }

  reset() { this.custom = false; }
}

/**
 * Wires pointer dragging on a hand container. A press without movement counts as a tap
 * (onTap), a horizontal drag reorders (onMove(card, insertIndex)).
 */
export function attachDrag(container, { onTap, onMove }) {
  let st = null;
  const cardsEls = () => [...container.querySelectorAll('.card')];
  const clearMarks = () => cardsEls().forEach(el => el.classList.remove('drop-before', 'drop-after'));

  function insertIndex(x, dragged) {
    const els = cardsEls();
    let idx = els.length;
    for (let i = 0; i < els.length; i++) {
      if (els[i] === dragged) continue;
      const r = els[i].getBoundingClientRect();
      if (x < r.left + r.width / 2) { idx = i; break; }
    }
    return idx;
  }

  container.addEventListener('pointerdown', e => {
    const el = e.target.closest('.card');
    if (!el || e.button > 0) return;
    st = { el, x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false };
  });
  container.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.dragging) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      st.dragging = true;
      st.el.classList.add('dragging');
      try { st.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    st.el.style.transform = `translate(${dx}px, ${Math.min(0, dy) - 14}px)`;
    clearMarks();
    const els = cardsEls(), idx = insertIndex(e.clientX, st.el);
    const target = els[idx];
    if (target && target !== st.el) target.classList.add('drop-before');
    else if (!target && els.length) els[els.length - 1].classList.add('drop-after');
  });
  const end = e => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    clearMarks();
    if (s.dragging) {
      s.el.classList.remove('dragging');
      s.el.style.transform = '';
      if (e.type === 'pointerup') onMove(+s.el.dataset.card, insertIndex(e.clientX, s.el));
    } else if (e.type === 'pointerup') onTap(+s.el.dataset.card);
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);
  container.addEventListener('keydown', e => {
    const el = e.target.closest('.card');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onTap(+el.dataset.card); }
  });
}
