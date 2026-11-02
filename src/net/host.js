// The hosting player's side of a table: owns the game, runs the computer players,
// validates guest moves and sends every guest its own view of the game.
import Peer from 'peerjs';
import { Controller, HOST_SAVE } from '../controller.js';
import { PEER_OPTIONS, PEER_PREFIX, RECONNECT_GRACE_MS } from './config.js';
import { makeCode, cleanName, viewFor, publicLobby } from './protocol.js';
import { saveJSON } from '../prefs.js';

const GUEST_ACTIONS = ['bid', 'alone', 'trump', 'play'];

export class HostSession {
  /**
   * @param {object} o
   * @param {string} o.name host's nickname
   * @param {string} o.mode @param {number} o.maxDeals @param {string} o.speed
   * @param {{name:string, ai:object}[]} o.aiSeats computer players for seats 1..3
   * @param {(host:HostSession)=>void} o.onUpdate called on every lobby/game/connection change
   */
  constructor({ name, mode, maxDeals, speed, aiSeats, onUpdate }) {
    this.onUpdate = onUpdate;
    this.status = 'opening'; // opening | open | error
    this.error = null;
    this.conns = new Map(); // peer id -> { conn, seat, token }
    this.graceTimers = {};
    this.lobby = {
      code: makeCode(), mode, maxDeals, speed, started: false,
      seats: [{ kind: 'host', name: cleanName(name) || 'Host' }, ...aiSeats.map(s => ({ kind: 'ai', name: s.name, ai: { ...s.ai } }))]
    };
    this.ctrl = new Controller(() => this.changed(), { saveKey: HOST_SAVE, extra: () => ({ lobby: this.lobby }) });
  }

  static saved() {
    const s = Controller.savedGame(HOST_SAVE);
    return s && s.lobby ? s : null;
  }

  /** Re-opens a saved table under the same code; guests reconnect with their tokens. */
  static resume(onUpdate) {
    const s = HostSession.saved();
    if (!s) return null;
    const h = Object.create(HostSession.prototype);
    Object.assign(h, { onUpdate, status: 'opening', error: null, conns: new Map(), graceTimers: {}, lobby: s.lobby });
    h.ctrl = new Controller(() => h.changed(), { saveKey: HOST_SAVE, extra: () => ({ lobby: h.lobby }) });
    h.ctrl.G = s.G;
    h.ctrl.speed = s.speed || 'normal';
    // Everyone starts offline until they reconnect; computer players stand in after the grace period.
    h.lobby.seats.forEach((seat, i) => { if (seat.kind === 'remote') h.markOffline(i); });
    h.ctrl.afterChange();
    return h;
  }

  get G() { return this.ctrl.G; }

  open(attempt = 0) {
    this.peer = new Peer(PEER_PREFIX + this.lobby.code, PEER_OPTIONS);
    this.peer.on('open', () => { this.status = 'open'; this.error = null; this.changed(); });
    this.peer.on('connection', conn => this.accept(conn));
    this.peer.on('disconnected', () => { if (!this.closed) setTimeout(() => this.peer && !this.peer.destroyed && this.peer.reconnect(), 2000); });
    this.peer.on('error', err => {
      if (err.type === 'unavailable-id') {
        // A resumed table's code may still be held by the broker for a short while.
        this.peer.destroy();
        if (!this.lobby.started && attempt < 1) this.lobby.code = makeCode();
        setTimeout(() => !this.closed && this.open(attempt + 1), 3000);
        return;
      }
      if (['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(err.type)) {
        this.status = 'error'; this.error = err.type; this.changed();
      }
    });
  }

  accept(conn) {
    conn.on('data', msg => this.receive(conn, msg));
    conn.on('close', () => this.dropped(conn));
    conn.on('error', () => this.dropped(conn));
  }

  receive(conn, msg) {
    if (this.closed || !msg || typeof msg !== 'object') return;
    const info = this.conns.get(conn.peer);
    if (msg.t === 'hello') return this.hello(conn, msg);
    if (!info) return;
    if (msg.t === 'sit') return this.sit(info, msg.seat);
    if (msg.t === 'bye') { this.conns.delete(conn.peer); this.leave(info, true); conn.close(); return; }
    if (msg.t === 'action' && this.lobby.started && info.seat != null) {
      const a = msg.action;
      if (!a || !GUEST_ACTIONS.includes(a.type) || this.G.players[info.seat].kind !== 'remote') return;
      this.ctrl.dispatch({ ...a, seat: info.seat }); // engine rejects anything illegal
    }
  }

  hello(conn, msg) {
    const token = String(msg.token || '').slice(0, 40), name = cleanName(msg.name) || 'Guest';
    const seats = this.lobby.seats;
    let seat = seats.findIndex(s => s.kind === 'remote' && s.token === token);
    if (seat < 0) {
      if (this.lobby.started) return this.reject(conn, 'started');
      seat = seats.findIndex(s => s.kind === 'ai');
      if (seat < 0) return this.reject(conn, 'full');
      seats[seat] = { kind: 'remote', name, token, ai: seats[seat].ai, aiName: seats[seat].name };
    }
    // A newer connection with the same token replaces an old one.
    for (const [id, other] of this.conns) if (other.seat === seat && id !== conn.peer) { this.conns.delete(id); other.conn.close(); }
    this.conns.set(conn.peer, { conn, seat, token });
    this.markOnline(seat);
    this.changed();
  }

  reject(conn, reason) {
    const send = () => { conn.send({ t: 'reject', reason }); setTimeout(() => conn.close(), 500); };
    conn.open ? send() : conn.on('open', send);
  }

  sit(info, seat) {
    const seats = this.lobby.seats;
    if (this.lobby.started || !Number.isInteger(seat) || !seats[seat] || seats[seat].kind !== 'ai') return;
    const mine = seats[info.seat];
    seats[seat] = { ...mine, ai: seats[seat].ai, aiName: seats[seat].name };
    seats[info.seat] = { kind: 'ai', name: mine.aiName, ai: mine.ai };
    info.seat = seat;
    this.changed();
  }

  /** Guest left (bye) or the connection dropped. */
  dropped(conn) {
    if (this.closed) return; // closing the table drops every connection; nothing more to record
    const info = this.conns.get(conn.peer);
    if (!info) return;
    this.conns.delete(conn.peer);
    this.leave(info, false);
  }

  leave(info, deliberate) {
    const seats = this.lobby.seats, s = seats[info.seat];
    if (!s || s.kind !== 'remote' || s.token !== info.token) return;
    if (!this.lobby.started) {
      seats[info.seat] = { kind: 'ai', name: s.aiName, ai: s.ai };
      this.changed();
      return;
    }
    this.markOffline(info.seat, deliberate ? 0 : RECONNECT_GRACE_MS);
  }

  markOffline(seat, grace = RECONNECT_GRACE_MS * 2) {
    const s = this.lobby.seats[seat];
    s.connected = false;
    const G = this.G;
    if (G) { G.players[seat].offline = true; }
    clearTimeout(this.graceTimers[seat]);
    this.graceTimers[seat] = setTimeout(() => {
      if (!this.G || this.lobby.seats[seat].connected) return;
      this.G.players[seat].kind = 'ai'; // the computer plays this seat until the player returns
      this.ctrl.afterChange();
    }, grace);
    if (G) this.ctrl.afterChange(); else this.changed();
  }

  markOnline(seat) {
    const s = this.lobby.seats[seat];
    s.connected = true;
    clearTimeout(this.graceTimers[seat]);
    const G = this.G;
    if (G && this.lobby.started) {
      G.players[seat].kind = 'remote';
      G.players[seat].offline = false;
      this.ctrl.afterChange();
    }
  }

  setAi(seat, patch) {
    const s = this.lobby.seats[seat];
    if (this.lobby.started || !s || s.kind !== 'ai') return;
    s.ai = { ...s.ai, ...patch };
    this.changed();
  }

  start() {
    if (this.lobby.started) return;
    this.lobby.started = true;
    const players = this.lobby.seats.map(s =>
      s.kind === 'host' ? { name: s.name, kind: 'human' }
        : s.kind === 'remote' ? { name: s.name, kind: 'remote', ai: s.ai, offline: s.connected === false }
          : { name: s.name, kind: 'ai', ai: s.ai });
    this.ctrl.start({ mode: this.lobby.mode, maxDeals: this.lobby.maxDeals, speed: this.lobby.speed, players });
  }

  /** Broadcasts the current lobby and game to every guest, then notifies the UI. */
  changed() {
    const lobby = publicLobby(this.lobby);
    for (const { conn, seat } of this.conns.values()) {
      if (!conn.open) continue;
      conn.send({ t: 'lobby', lobby, you: seat });
      if (this.lobby.started && this.G) conn.send({ t: 'state', G: viewFor(this.G, seat), seat });
    }
    this.onUpdate && this.onUpdate(this);
  }

  /** Leaves the table. end=true closes it for everyone and forgets the save; otherwise guests wait for a resume. */
  close(end) {
    this.closed = true;
    this.ctrl.stop();
    Object.values(this.graceTimers).forEach(clearTimeout);
    for (const { conn } of this.conns.values()) { if (end && conn.open) conn.send({ t: 'end' }); }
    this.conns.clear();
    if (end) { this.ctrl.saveKey = null; saveJSON(HOST_SAVE, null); }
    setTimeout(() => this.peer && this.peer.destroy(), end ? 300 : 0);
  }
}
