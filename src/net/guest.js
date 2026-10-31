// A guest's side of a table: connects to the host, shows what the host sends, sends moves back,
// and keeps trying to reconnect (with the same seat token) if the connection drops.
import Peer from 'peerjs';
import { PEER_OPTIONS, PEER_PREFIX } from './config.js';
import { makeToken, cleanName, normalizeCode } from './protocol.js';
import { loadJSON, saveJSON } from '../prefs.js';

const TOKENS_KEY = 'boomwies-tokens';
export const LAST_TABLE_KEY = 'boomwies-last-table';

export class GuestSession {
  constructor({ code, name, onUpdate }) {
    this.code = normalizeCode(code);
    this.name = cleanName(name) || 'Guest';
    this.onUpdate = onUpdate;
    // status: connecting | lobby | game | lost | rejected | notfound | ended
    this.status = 'connecting';
    this.reason = null;
    this.lobby = null;
    this.G = null;
    this.seat = null;
    this.everConnected = false;
    const tokens = loadJSON(TOKENS_KEY) || {};
    this.token = tokens[this.code] || makeToken();
    tokens[this.code] = this.token;
    saveJSON(TOKENS_KEY, tokens);
    saveJSON(LAST_TABLE_KEY, { code: this.code, name: this.name });
  }

  connect() {
    if (this.closed) return;
    if (!this.peer || this.peer.destroyed) {
      this.peer = new Peer(PEER_OPTIONS);
      this.peer.on('open', () => this.dial());
      this.peer.on('disconnected', () => { if (!this.closed) setTimeout(() => this.peer && !this.peer.destroyed && this.peer.reconnect(), 2000); });
      this.peer.on('error', err => {
        if (err.type === 'peer-unavailable') {
          if (!this.everConnected) { this.status = 'notfound'; saveJSON(LAST_TABLE_KEY, null); this.closed = true; this.update(); this.teardown(); }
          else this.lost();
        } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) this.lost();
      });
    } else if (this.peer.open) this.dial();
  }

  dial() {
    if (this.closed) return;
    const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true });
    this.conn = conn;
    conn.on('open', () => {
      this.everConnected = true;
      conn.send({ t: 'hello', name: this.name, token: this.token });
    });
    conn.on('data', msg => this.receive(msg));
    conn.on('close', () => { if (this.conn === conn) this.lost(); });
    conn.on('error', () => { if (this.conn === conn) this.lost(); });
  }

  receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'lobby') {
      this.lobby = msg.lobby;
      this.seat = msg.you;
      if (!msg.lobby.started) { this.status = 'lobby'; this.G = null; }
    } else if (msg.t === 'state') {
      this.G = msg.G;
      this.seat = msg.seat;
      this.status = 'game';
    } else if (msg.t === 'reject') {
      this.status = 'rejected'; this.reason = msg.reason; this.closed = true;
      saveJSON(LAST_TABLE_KEY, null);
    } else if (msg.t === 'end') {
      this.status = 'ended'; this.closed = true;
      saveJSON(LAST_TABLE_KEY, null);
    } else return;
    this.update();
    if (this.closed) this.teardown();
  }

  lost() {
    if (this.closed) return;
    if (this.status !== 'lost') { this.prevStatus = this.status; this.status = 'lost'; this.update(); }
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.connect(), 3000);
  }

  send(action) {
    if (this.conn && this.conn.open) this.conn.send({ t: 'action', action });
  }

  sit(seat) {
    if (this.conn && this.conn.open) this.conn.send({ t: 'sit', seat });
  }

  leave() {
    this.closed = true;
    clearTimeout(this.retry);
    if (this.conn && this.conn.open) this.conn.send({ t: 'bye' });
    // Keep the last table so the player can rejoin from the menu while the game lasts.
    if (this.status === 'lobby' || this.status === 'connecting') saveJSON(LAST_TABLE_KEY, null);
    setTimeout(() => this.teardown(), 300);
  }

  teardown() { clearTimeout(this.retry); if (this.peer) this.peer.destroy(); }

  update() { this.onUpdate && this.onUpdate(this); }
}
