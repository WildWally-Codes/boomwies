import { describe, it, expect, vi } from 'vitest';
import { HostSession } from '../src/net/host.js';
import { viewFor } from '../src/net/protocol.js';
import { legalCards } from '../src/engine/game.js';

vi.useFakeTimers();

function fakeConn(id) {
  const c = { peer: id, open: true, sent: [], handlers: {}, closed: false };
  c.send = m => c.sent.push(JSON.parse(JSON.stringify(m)));
  c.close = () => { c.closed = true; };
  c.on = (ev, fn) => { c.handlers[ev] = fn; };
  c.last = t => [...c.sent].reverse().find(m => m.t === t);
  return c;
}

function makeHost(mode = 'boomke') {
  const ai = { level: 'beginner', aggression: 'balanced' };
  const h = new HostSession({ name: 'Wout', mode, maxDeals: 2, speed: 'fast', aiSeats: ['Jef', 'Mieke', 'Rik'].map(name => ({ name, ai })) });
  h.status = 'open';
  return h;
}

describe('host session', () => {
  it('seats guests, hides other hands and rejects foreign moves', () => {
    const h = makeHost();
    const a = fakeConn('a'), b = fakeConn('b');
    h.accept(a); h.accept(b);
    h.receive(a, { t: 'hello', name: '<Anna>', token: 'tok-a' });
    h.receive(b, { t: 'hello', name: 'Bert', token: 'tok-b' });
    expect(a.last('lobby').you).toBe(1);
    expect(b.last('lobby').you).toBe(2);
    expect(h.lobby.seats[1].name).toBe('Anna');           // markup stripped
    h.receive(a, { t: 'sit', seat: 3 });
    expect(a.last('lobby').you).toBe(3);
    expect(h.lobby.seats[1].kind).toBe('ai');

    h.start();
    const s = a.last('state');
    expect(s.seat).toBe(3);
    expect(s.G.hand.hands[3].every(c => c >= 0)).toBe(true);
    expect(s.G.hand.hands[0].every(c => c === -1)).toBe(true);
    expect(JSON.stringify(a.sent)).not.toContain('tok-b');  // tokens never leave the host

    // Bert cannot act for Anna's seat, even by naming it.
    const before = JSON.stringify(h.G.hand), bertsTurn = h.G.hand.turn === 2;
    h.receive(b, { t: 'action', action: { type: 'bid', seat: 3, bid: 'pass' } });
    if (bertsTurn) expect(h.G.hand.bids[2]).toBe('pass');   // treated as Bert's own move
    else expect(JSON.stringify(h.G.hand)).toBe(before);
  });

  it('a late stranger is refused, a returning token gets its seat back', () => {
    const h = makeHost();
    const a = fakeConn('a');
    h.accept(a);
    h.receive(a, { t: 'hello', name: 'Anna', token: 'tok-a' });
    h.start();
    const x = fakeConn('x');
    h.accept(x);
    h.receive(x, { t: 'hello', name: 'Xavier', token: 'nope' });
    expect(x.last('reject').reason).toBe('started');

    a.handlers.close();
    expect(h.G.players[1].offline).toBe(true);
    vi.advanceTimersByTime(31000);
    expect(h.G.players[1].kind).toBe('ai');

    const a2 = fakeConn('a2');
    h.accept(a2);
    h.receive(a2, { t: 'hello', name: 'Anna', token: 'tok-a' });
    expect(h.G.players[1].kind).toBe('remote');
    expect(h.G.players[1].offline).toBe(false);
    expect(a2.last('state').seat).toBe(1);
  });

  it('a guest can play a legal card on their turn', () => {
    const h = makeHost('klassiek');
    const a = fakeConn('a');
    h.accept(a);
    h.receive(a, { t: 'hello', name: 'Anna', token: 'tok-a' });
    h.start();
    // Let the computer players move until it is Anna's turn.
    for (let i = 0; i < 20 && h.G.hand.turn !== 1; i++) vi.advanceTimersByTime(1000);
    if (h.G.hand.turn === 1) {
      const card = legalCards(h.G, 1)[0];
      h.receive(a, { t: 'action', action: { type: 'play', card } });
      expect(h.G.hand.played).toContain(card);
    }
  });
});

describe('viewFor', () => {
  it('shows an open miserie hand to everyone', () => {
    const G = { hand: { hands: [[1], [2], [3], [4]], revealed: 2 } };
    expect(viewFor(G, 0).hand.hands).toEqual([[1], [-1], [3], [-1]]);
  });
});
