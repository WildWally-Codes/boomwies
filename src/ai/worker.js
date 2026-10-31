// Background thread for computer players, so deep searches never freeze the table.
import { chooseAction } from './index.js';

self.onmessage = ({ data: { id, G, seat } }) => {
  let action = null, error = null;
  try { action = chooseAction(G, seat); } catch (e) { error = String(e && e.message || e); }
  self.postMessage({ id, action, error });
};
