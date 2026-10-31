// Per-browser preferences. Storage can be unavailable (private mode), so every access is guarded.
const KEY = 'boomwies-prefs';
const DEFAULTS = { lang: 'en', sortDir: 'asc', trumpFirst: false, mode: 'wiezen', maxDeals: 12, speed: 'normal' };

export const prefs = { ...DEFAULTS };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* defaults */ }

export function savePrefs(patch) {
  Object.assign(prefs, patch);
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export function loadJSON(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
export function saveJSON(key, v) { try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }
