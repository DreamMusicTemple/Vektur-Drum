// Vektur Drum — the web side of the native parity check. Renders web/dist/index.html with WebKit (on macOS: Avenir Next
// and SF Mono, the fonts an iPad shows) at the reference sizes, in the same state the native app starts in (a new set),
// touch emulated and the panel scale fixed as host.js fitScale sets it on a touch screen. Writes <out>/<size>.png
// (2× pixels, full height) and <out>/<size>.json (every visible element's box and style, as tools/ui_reference.mjs).
//   node tools/ui_parity_web.mjs <outDir>          (needs `npm i playwright` + `npx playwright install webkit`;
//   WEB_INDEX=/path/to/index.html when run from another folder)
import { webkit } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + (process.env.WEB_INDEX || path.join(here, '../web/dist/index.html'));
const out = process.argv[2] || 'ui-web'; fs.mkdirSync(out, { recursive: true });
export const SIZES = [['ipad13-landscape', 1366, 1024], ['ipad11-landscape', 1194, 834], ['ipad11-portrait', 834, 1194],
  ['iphone-landscape', 852, 393], ['iphone-portrait', 393, 852]];

const dump = () => {
  const rows = [];
  for (const e of document.querySelectorAll('.dm *')) {
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue;
    const txt = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').slice(0, 40);
    rows.push({ tag: e.tagName.toLowerCase(), cls: typeof e.className === 'string' ? e.className : undefined, text: txt || undefined,
      x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), font: `${s.fontWeight} ${s.fontSize} ${s.fontFamily.split(',')[0]}` });
  }
  return rows;
};

const b = await webkit.launch();
for (const [name, w, h] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(url); await p.waitForSelector('.dm'); await p.waitForTimeout(400);
  const scale = w >= 700 ? Math.min(1.35, Math.max(1, w / 1060)) : 1;   // host.js fitScale on a touch screen
  await p.addStyleTag({ content: `:root{--scale:${scale} !important} #toast{display:none !important}` });
  await p.waitForTimeout(250);
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(await p.evaluate(dump)));
  await p.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  console.log(name, 'scale', scale);
  await ctx.close();
}
await b.close();
