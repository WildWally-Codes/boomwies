// Turns the single-file build into a Claude artifact page: the artifact host adds its own
// <!doctype>/<html>/<head>/<body> skeleton, so only the page's contents are kept.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('dist-artifact/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/i)[1]
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1];
const title = head.match(/<title>[\s\S]*?<\/title>/i)[0];
const rest = head.replace(title, '');

const page = `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${rest.trim()}\n${body.trim()}\n`;
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/boomwies.html', page);
console.log(`artifact/boomwies.html written (${(page.length / 1024).toFixed(0)} KB)`);
