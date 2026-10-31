// Runs a local game: applies actions, schedules computer moves and automatic steps, and saves progress.
import { createGame, applyAction, waitingFor } from './engine/game.js';
import { requestAiAction } from './ai/client.js';
import { loadJSON, saveJSON } from './prefs.js';

export const SOLO_SAVE = 'boomwies-game';
export const HOST_SAVE = 'boomwies-host';
export const SPEED = { slow: [1000, 1700], normal: [600, 1100], fast: [250, 600] };

export class Controller {
  /** extra(): additional data stored with the save (e.g. the hosted table's lobby). */
  constructor(onChange, { saveKey = SOLO_SAVE, extra = null } = {}) {
    this.onChange = onChange;
    this.saveKey = saveKey;
    this.extra = extra;
    this.G = null;
    this.speed = 'normal';
    this.timer = null;
    this.version = 0;
  }

  static savedGame(key = SOLO_SAVE) {
    const s = loadJSON(key);
    return s && s.G && s.G.phase !== 'over' ? s : null;
  }

  start({ mode, maxDeals, speed, players }) {
    this.speed = speed;
    this.G = createGame({ mode, maxDeals, players });
    this.afterChange();
  }

  resume() {
    const s = Controller.savedGame(this.saveKey);
    if (!s) return false;
    this.G = s.G;
    this.speed = s.speed || 'normal';
    this.afterChange();
    return true;
  }

  stop() { clearTimeout(this.timer); this.timer = null; this.version++; }

  dispatch(action) {
    try { applyAction(this.G, action); }
    catch (err) { console.warn('Rejected action', action, err.message); return false; }
    this.afterChange();
    return true;
  }

  afterChange() {
    this.version++;
    saveJSON(this.saveKey, this.G.phase === 'over' ? null : { G: this.G, speed: this.speed, ...(this.extra ? this.extra() : {}) });
    this.schedule();
    this.onChange(this.G);
  }

  schedule() {
    clearTimeout(this.timer);
    const G = this.G;
    if (G.phase === 'over') return;
    const H = G.hand, [aiDelay, trickDelay] = SPEED[this.speed] || SPEED.normal;
    if (H.phase === 'trickDone') { this.timer = setTimeout(() => this.dispatch({ type: 'collect' }), trickDelay); return; }
    if (H.phase === 'redeal') { this.timer = setTimeout(() => this.dispatch({ type: 'redeal' }), 1900); return; }
    const w = waitingFor(G);
    if (w != null && G.players[w].kind === 'ai') {
      // Think in the background; act after at least the speed delay, and only if nothing changed meanwhile.
      const version = this.version;
      const delay = new Promise(r => { this.timer = setTimeout(r, aiDelay); });
      Promise.all([requestAiAction(G, w), delay]).then(([action]) => {
        if (this.version === version && this.G === G && action) this.dispatch(action);
      }).catch(err => console.error('Computer player failed', err));
    }
  }
}
