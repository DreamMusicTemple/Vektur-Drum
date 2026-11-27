// Vektur Drum — UI reference capture for the native (SwiftUI) build: every screen of the web app at iPad and iPhone
// sizes, plus a style dump (position, size, font, colours, radius, border, padding of every visible element) per screen.
// The native app copies these exactly. Read-only: it changes nothing in the project.
//   node tools/ui_reference.mjs [outDir]      (needs Playwright + Chrome; CHROME=/path/to/chrome to override)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, '../web/dist/index.html');
const out = process.argv[2] || path.join(here, '../ui-reference');
fs.mkdirSync(out, { recursive: true });

const SIZES = [
  ['ipad13-landscape', 1366, 1024], ['ipad11-landscape', 1194, 834], ['ipad11-portrait', 834, 1194],
  ['iphone-landscape', 852, 393], ['iphone-portrait', 393, 852],
];
const DUMP_SIZE = 'ipad11-landscape';

// a kit with music in it, a selected step, a sample track with slices (shared setup)
const SETUP = {
  kit: async () => { openPresets('drums'); await new Promise(r => setTimeout(r, 60));
    const t = [...document.querySelectorAll('.pretile')].find(b => /Breakbeat Halo/.test(b.textContent)); if (t) t.click();
    await new Promise(r => setTimeout(r, 80)); closePresets(); },
  break: async () => {
    const sr = 48000, bpm = 170, beat = 60 / bpm * sr, n = Math.round(8 * beat), d = new Float32Array(n); let q = 7;
    const rnd = () => { q = (q * 1103515245 + 12345) >>> 0; return q / 4294967296 * 2 - 1; };
    const put = (pos, c) => { for (let i = 0; i < 9000 && pos + i < n; i++) { const t = i / sr;
      d[Math.round(pos) + i] += c === 0 ? Math.sin(2 * Math.PI * (55 + 120 * Math.exp(-t * 40)) * t) * Math.exp(-t * 18) * .9
        : c === 1 ? (rnd() * .6 + Math.sin(2 * Math.PI * 190 * t) * .4) * Math.exp(-t * 22) * .8 : c === 2 ? rnd() * Math.exp(-t * 90) * .35 : rnd() * Math.exp(-t * 30) * .25; } };
    [0, 2.5, 4, 6.5].forEach(x => put(x * beat, 0)); [1, 3, 5, 7].forEach(x => put(x * beat, 1)); [.5, 1.5, 3.5, 4.5, 5.5, 6, 7.5].forEach(x => put(x * beat, 2)); [2.25, 3.75, 7.25].forEach(x => put(x * beat, 3));
    await drumAddSampleBytes(3, VDENC.wav([d], sr, 16), 'Amen Brother Break 170bpm');
    await openBreakLab(3); const sx = drumSx()[3]; sxRedetect(sx, BL.m); sxMakeSlices(sx, BL.m); blCommit(); closeBreakLab(); },
};
const pause = ms => `await new Promise(r => setTimeout(r, ${ms}));`;
// [name, setup steps, js that opens the screen]
const SCREENS = [
  ['01-main', [], ''],
  ['02-main-kit-step-selected', ['kit'], `selectStep(1, 4);`],
  ['03-main-sample-track', ['kit', 'break'], `DRM.trk = 3; DRM.step = -1; renderDrums();`],
  ['04-presets', [], `openPresets('drums');`],
  ['05-slicer-metalise', ['kit'], `openSlicer();`],
  ['06-mod-window', ['kit'], `drumSet('lfo1.shape', 5); openMod();`],
  ['07-mod-hold-popup', ['kit'], `HOLD`],
  ['08-breaklab', ['kit', 'break'], `await openBreakLab(3);`],
  ['09-generate', [], `openSongGen();`],
  ['10-export', ['kit'], `openExport();`],
  ['11-pads-window', ['kit'], `openPadWin();`],
  ['12-ring-step', ['kit'], `selectStep(1, 4); openRing(1, 4);`],
  ...['audio', 'appearance', 'project', 'midi', 'cc', 'manual', 'about'].map((t, i) => [`${13 + i}-settings-${t}`, [], `openSettings('${t}');`]),
];

const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const index = [];
const scales = {};
const dump = () => {   // every visible element: what a native view must reproduce
  const rows = [], seen = new Set();
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue;
    if (!(e.className || e.id || /^(BUTTON|INPUT|SELECT|CANVAS|IMG|SVG|LABEL)$/i.test(e.tagName))) continue;
    const key = `${e.tagName}|${e.className}|${Math.round(r.x)}|${Math.round(r.y)}`; if (seen.has(key)) continue; seen.add(key);
    const txt = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').slice(0, 40);
    rows.push({ tag: e.tagName.toLowerCase(), id: e.id || undefined, cls: typeof e.className === 'string' ? e.className : undefined, text: txt || undefined,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      font: `${s.fontWeight} ${s.fontSize} ${s.fontFamily.split(',')[0]}`, ls: s.letterSpacing !== 'normal' ? s.letterSpacing : undefined,
      color: s.color, bg: s.backgroundColor !== 'rgba(0, 0, 0, 0)' ? s.backgroundColor : undefined, bgimg: s.backgroundImage !== 'none' ? s.backgroundImage.slice(0, 200) : undefined,
      radius: s.borderRadius !== '0px' ? s.borderRadius : undefined, border: s.borderTopWidth !== '0px' ? `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}` : undefined,
      shadow: s.boxShadow !== 'none' ? s.boxShadow.slice(0, 160) : undefined, pad: s.padding !== '0px' ? s.padding : undefined });
  }
  return rows;
};
for (const [sz, w, h] of SIZES) {
  for (const [name, setups, open] of SCREENS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: /iphone|ipad/.test(sz) });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(url); await p.waitForSelector('.dm'); await p.waitForTimeout(250);
    await p.evaluate(() => { const v = document.documentElement.style.getPropertyValue('--scale') || '1'; const st = document.createElement('style'); st.textContent = `:root{--scale:${v} !important}`; document.head.appendChild(st); });   // full-page captures resize the page, which would re-run fitScale without touch: keep the device's scale
    for (const s of setups) await p.evaluate(`(${SETUP[s].toString()})()`);
    if (open === 'HOLD') {
      const r = await p.locator('.kcell[data-mod-key]').first().boundingBox();
      await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
    } else if (open) await p.evaluate(`(async () => { ${open} ${pause(120)} })()`);
    await p.waitForTimeout(250); await p.evaluate(() => { const t = document.getElementById('toast'); if (t) t.classList.remove('on'); }); await p.waitForTimeout(300);   // no transient messages
    const file = `${sz}/${name}.png`; fs.mkdirSync(path.join(out, sz), { recursive: true });
    if (sz === DUMP_SIZE) { fs.mkdirSync(path.join(out, 'styles'), { recursive: true }); fs.writeFileSync(path.join(out, `styles/${name}.json`), JSON.stringify(await p.evaluate(dump), null, 0).replace(/\},\{/g, '},\n{')); }
    await p.screenshot({ path: path.join(out, file), fullPage: true });
    scales[sz] = await p.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    index.push({ size: sz, screen: name, file, errors: errs });
    if (errs.length) console.log('page error', sz, name, errs);
    await ctx.close();
  }
}
// every dial design, step design and theme on the main screen (iPad 11" landscape)
const extra = async (name, js) => {
  const ctx = await b.newContext({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 2, hasTouch: true }); const p = await ctx.newPage();
  await p.goto(url); await p.waitForSelector('.dm'); await p.evaluate(() => { const v = document.documentElement.style.getPropertyValue('--scale') || '1'; const st = document.createElement('style'); st.textContent = `:root{--scale:${v} !important}`; document.head.appendChild(st); });   // full-page captures resize the page, which would re-run fitScale without touch: keep the device's scale
  await p.evaluate(`(${SETUP.kit.toString()})()`); await p.evaluate(js); await p.waitForTimeout(250); await p.evaluate(() => { const t = document.getElementById('toast'); if (t) t.classList.remove('on'); }); await p.waitForTimeout(300);
  fs.mkdirSync(path.join(out, 'variants'), { recursive: true }); await p.screenshot({ path: path.join(out, `variants/${name}.png`) });
  index.push({ size: 'ipad11-landscape', screen: name, file: `variants/${name}.png` }); await ctx.close();
};
const lists = await (async () => { const ctx = await b.newContext(); const p = await ctx.newPage(); await p.goto(url); await p.waitForSelector('.dm');
  const l = await p.evaluate(() => ({ dials: DIAL_STYLES.map(d => d[0]), steps: STEP_STYLES.map(s => s[0]), themes: THEMES.map(t => t[0]) })); await ctx.close(); return l; })();
for (const d of lists.dials) await extra(`dial-${d}`, `dialSet('${d}');`);
for (const s of lists.steps) await extra(`steps-${s}`, `PREFS.steps = '${s}'; stepStyleApply(); renderDrums();`);
for (const t of lists.themes) await extra(`theme-${t}`, `PREFS.theme = { id: '${t}' }; applyTheme(); renderDrums();`);
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ app: 'Vektur Drum 0.9.1 web', sizes: SIZES, rootFontSize: scales, ...lists, shots: index }, null, 1));
console.log(`${index.length} screenshots → ${out}`);
await b.close();
