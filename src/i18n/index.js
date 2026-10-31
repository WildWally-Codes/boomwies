import en from './en.js';
import nl from './nl.js';

const DICTS = { en, nl };
export const LANGS = [['en', 'EN'], ['nl', 'NL']];
let lang = 'en';
const listeners = new Set();

export function setLang(l) {
  if (!DICTS[l] || l === lang) return;
  lang = l;
  document.documentElement.lang = l;
  listeners.forEach(f => f(l));
}
export const getLang = () => lang;
export const onLangChange = f => listeners.add(f);

/**
 * Looks up a string and fills {placeholders}. When params.you is true and a
 * "<key>.you" variant exists, that variant is used (verb agreement for "You").
 */
export function t(key, params = {}) {
  const d = DICTS[lang];
  const s = (params.you ? d[key + '.you'] ?? en[key + '.you'] : undefined) ?? d[key] ?? en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}
