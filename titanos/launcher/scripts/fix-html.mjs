/* dist/index.html ships the bundle as <script type="module"> — browsers
   without module support (the TV's Vewd/Whale Blink, docs/09) ignore the
   tag entirely and render a blank page. The bundle contains no top-level
   import/export, so it runs as a classic script: rewrite the tag, drop
   the crossorigin attribute and any modulepreload hints. */

import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../dist/index.html', import.meta.url);
let html = readFileSync(file, 'utf8');
const before = html;
html = html
  .replace(/<script type="module"([^>]*)>/g, '<script defer$1>')
  .replace(/ crossorigin/g, '')
  .replace(/<link rel="modulepreload"[^>]*>\s*/g, '');
if (html !== before) {
  writeFileSync(file, html);
  console.log('index.html: module script rewritten to classic defer');
} else {
  console.log('index.html: no module script found (already fixed?)');
}
