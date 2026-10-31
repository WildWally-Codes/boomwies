// Runs a local game: applies actions, schedules computer moves and automatic steps, and saves progress.
import { createGame, applyAction, waitingFor } from './engine/game.js';
import { chooseAction } from './ai/index.js';
import { loadJSON, saveJSON } from './prefs.js';

const SAVE_KEY = 'boomwies-game';
export const SPEED = { slow: [1000, 1700], normal: [600, 1100], fast: [250, 600] };

export class Controller {
  constructor(onChange) {
    this.onChange = onChange;
    this.G = null;
    this.speed = 'normal';
    this.timer = null;
  }

  static savedGame() {
    const s = loadJSON(SAVE_KEY);
    return s && s.G && s.G.phase !== 'over' ? s : null;
  }

  start({ mode, maxDeals, speed, players }) {
    this.speed = speed;
    this.G = createGame({ mode, maxDeals, players });
    this.afterChange();
  }

  resume() {
    const s = Controller.savedGame();
    if (!s) return false;
    this.G = s.G;
    this.speed = s.speed || 'normal';
    this.afterChange();
    return true;
  }

  stop() { clearTimeout(this.timer); this.timer = null; }

  dispatch(action) {
    try { applyAction(this.G, action); }
    catch (err) { console.warn('Rejected action', action, err.message); return false; }
    this.afterChange();
    return true;
  }

  afterChange() {
    saveJSON(SAVE_KEY, this.G.phase === 'over' ? null : { G: this.G, speed: this.speed });
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
      this.timer = setTimeout(() => this.dispatch(chooseAction(G, w)), aiDelay);
    }
  }
}
