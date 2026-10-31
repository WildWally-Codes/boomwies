// Messages between host and guests (all plain JSON):
//   guest → host  {t:'hello', name, token}   {t:'sit', seat}   {t:'action', action}   {t:'bye'}
//   host → guest  {t:'lobby', lobby, you}   {t:'state', G, seat}   {t:'reject', reason}   {t:'end'}
// The host is the authority: it validates every guest message and sends each guest only its own hand.

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeCode(len = 5) {
  let s = '';
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  for (const n of buf) s += CODE_CHARS[n % CODE_CHARS.length];
  return s;
}

export const normalizeCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

export function makeToken() {
  const buf = new Uint32Array(4);
  crypto.getRandomValues(buf);
  return [...buf].map(n => n.toString(36)).join('');
}

export const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);

/** A copy of the game as seat sees it: other players' cards are hidden unless shown on the table. */
export function viewFor(G, seat) {
  const V = structuredClone(G);
  const H = V.hand;
  if (H) {
    H.hands = H.hands.map((h, q) => (q === seat || q === H.revealed ? h : h.map(() => -1)));
  }
  return V;
}

/** The lobby as guests see it (no reconnect tokens). */
export function publicLobby(lobby) {
  return {
    code: lobby.code, mode: lobby.mode, maxDeals: lobby.maxDeals, started: lobby.started,
    seats: lobby.seats.map(s => ({ kind: s.kind, name: s.name, ai: s.ai, connected: s.connected !== false }))
  };
}
