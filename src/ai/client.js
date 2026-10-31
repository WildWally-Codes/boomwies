// Asks the background worker for a computer move; falls back to the main thread if workers are unavailable.
import { chooseAction } from './index.js';

let worker = null, seq = 0;
const pending = new Map();

function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      data.error ? p.reject(new Error(data.error)) : p.resolve(data.action);
    };
    worker.onerror = () => { worker = false; for (const p of pending.values()) p.fallback(); pending.clear(); };
  } catch { worker = false; }
  return worker;
}

/** Resolves to the action seat should take in state G. */
export function requestAiAction(G, seat) {
  const w = getWorker();
  if (!w) return Promise.resolve(chooseAction(G, seat));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, fallback: () => resolve(chooseAction(G, seat)) });
    w.postMessage({ id, G, seat });
  });
}
