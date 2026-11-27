// Vektur Drum — 0.9.1 interface checks in a real browser: logo + HYBRID title, undo / redo, pad name abbreviations,
// touch-and-hold modulation (dials and the Metalise switch), the Slicer's pattern row, step designs, the track EQ above
// TAPE, Interstellar dials by default, the About logo, and the LFO DRAW editor.
//   node tests/ui091.test.mjs        (needs Playwright + Chrome; CHROME=/path/to/chrome to override)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'url';
import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, '../web/dist/index.html');
const shots = process.env.SHOTS;   // a folder: also saves screenshots
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } }); const p = await ctx.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(url); await p.waitForSelector('.dm');
const hold = async (sel, ms = 700) => { const r = await p.locator(sel).first().boundingBox(); await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await p.mouse.down(); await p.waitForTimeout(ms); await p.mouse.up(); };

// 1 · top row: logo before the name, HYBRID DRUM MACHINE, undo / redo before ON
const top = await p.evaluate(() => { const lg = document.querySelector('.dmlogo'), br = document.querySelector('.dmbrand');
  const u = document.querySelectorAll('.dmundo'); const kids = [...lg.parentElement.children];
  return { logo: !!lg && lg.naturalWidth > 0, before: kids.indexOf(lg) < kids.indexOf(br), h: lg.getBoundingClientRect().height, brandH: br.getBoundingClientRect().height,
    sub: br.querySelector('small').textContent, undo: u.length, undoBeforeOn: u.length === 2 && (() => { const on = [...lg.parentElement.querySelectorAll('button')].find(x => /^(ON|OFF)$/.test(x.textContent.trim())); return !!on && kids.indexOf(u[1]) < kids.indexOf(on); })() }; });
ok(top.logo, 'the logo shows at the top'); ok(top.before, 'the logo comes before VEKTUR DRUM');
ok(top.h > 10 && top.h <= Math.max(36, top.brandH * 1.6), `the logo is scaled to the row (${top.h.toFixed(0)} px)`);
ok(top.sub === 'HYBRID DRUM MACHINE', 'subtitle reads HYBRID DRUM MACHINE (' + top.sub + ')');
ok(top.undo === 2 && top.undoBeforeOn, 'undo and redo sit left of the ON button');
if (shots) await p.screenshot({ path: shots + '/1-main.png' });

// 2 · Interstellar dials by default
ok(await p.evaluate(() => DIAL.style === 'interstellar'), 'Interstellar is the default dial style');

// 3 · undo / redo
const ur = await p.evaluate(async () => { const was = drumVal('t1.decay'); const dis0 = DRM.els.undo.disabled;
  drumSet('t1.decay', 1.7); dirty(); await new Promise(r => setTimeout(r, 650));
  document.querySelector('.dmundo').click(); await new Promise(r => setTimeout(r, 80)); const back = drumVal('t1.decay');
  DRM.els.redo.click(); await new Promise(r => setTimeout(r, 80)); return { was, dis0, back, fwd: drumVal('t1.decay'), playing: !!drumState().on }; });
ok(ur.dis0, 'undo starts disabled'); ok(Math.abs(ur.back - ur.was) < 1e-9, `undo restores Decay (${ur.back} vs ${ur.was})`); ok(Math.abs(ur.fwd - 1.7) < 1e-9, 'redo brings it back');

// 4 · pad names of imported samples are abbreviated, with room either side
const pads = await p.evaluate(async () => {
  const names = ['Amen Brother Break 136bpm.wav', 'Funky_Drummer_Snare_Hit_02.flac', 'kick.wav', 'SuperLongDistortedReeseBassStab.wav'];
  names.forEach((n, i) => { const key = 'sTEST' + i; drumLib().push({ key, name: n, fmt: 'wav' }); drumSmp()[i] = key; drumSet(`t${i + 1}.engine`, 1); });
  renderDrums(); await new Promise(r => setTimeout(r, 50));
  return [...document.querySelectorAll('.pad span.smp')].slice(0, 4).map(s => { const pad = s.closest('.pad'), a = s.getBoundingClientRect(), q = pad.getBoundingClientRect();
    return { txt: s.textContent, title: pad.title || s.title, l: a.left - q.left, r: q.right - a.right, ov: s.scrollWidth > s.clientWidth + 1 }; }); });
ok(pads.length === 4, '4 sample pads carry an abbreviated name');
pads.forEach((x, i) => { ok(x.txt.length > 0 && x.txt.length <= 8, `pad ${i + 1}: “${x.txt}” fits 8 characters`); ok(!x.ov && x.l >= 3 && x.r >= 3, `pad ${i + 1}: space either side (${x.l.toFixed(0)} / ${x.r.toFixed(0)} px)`); ok(/\./.test(x.title), `pad ${i + 1}: full name in its tooltip`); });
ok(pads[2] && pads[2].txt === 'KICK', 'a short name stays as it is');
if (shots) await p.screenshot({ path: shots + '/2-pads.png' });

// 5 · touch and hold a dial → modulation popup → adding a source updates the MOD list
await hold('.kcell[data-mod-key="t1.tune"], .kcell[data-mod-key]');
const popKey = await p.evaluate(() => { const q = document.querySelector('#modPop'); return q ? q.getAttribute('aria-label') : null; });
ok(!!popKey, 'holding a dial opens its modulation popup');
const nW0 = await p.evaluate(() => drumWires().length);
await p.locator('#modPop .modchip').first().click();
const pw = await p.evaluate(() => ({ n: drumWires().length, rows: document.querySelectorAll('#modPop .modpopw').length }));
ok(pw.n === nW0 + 1 && pw.rows === 1, 'tapping LFO 1 adds a wire (and a depth row)');
if (shots) await p.screenshot({ path: shots + '/3-modpop.png' });
await p.locator('#modPop button', { hasText: 'OPEN MOD LIST' }).click(); await p.waitForTimeout(100);
ok(await p.evaluate(() => typeof modOpen === 'function' && modOpen() && document.querySelectorAll('#modModal .modrow, #modModal [data-wire]').length >= 0), 'OPEN MOD LIST opens the MOD window');
ok(await p.evaluate(() => { const k = drumWires()[drumWires().length - 1].k; return document.querySelector(`#modModal`).textContent.length > 0 && !!k; }), 'the new wire is in the MOD list');
await p.evaluate(() => { document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')); });

// 6 · Slicer: patterns 1–8, and the Metalise switch's hold → LFO / CHANCE
await p.evaluate(() => openSlicer()); await p.waitForTimeout(80);
const sp = await p.evaluate(() => ({ n: document.querySelectorAll('.slpat').length, lbl: document.querySelector('.slpat small').textContent }));
ok(sp.n === 8, '8 pattern buttons in the Slicer'); ok(sp.lbl === 'SONG', 'a pattern starts by following the switch');
await p.locator('.slpat').nth(2).click(); await p.waitForTimeout(40);
ok(await p.evaluate(() => drumState().pats[2].sl === 1 && document.querySelectorAll('.slpat')[2].classList.contains('on')), 'tap: pattern 3 is always sliced (lit)');
await p.locator('.slpat').nth(2).click(); await p.waitForTimeout(40);
ok(await p.evaluate(() => drumState().pats[2].sl === 0), 'tap again: pattern 3 is never sliced');
await p.locator('.slpat').nth(2).click(); await p.waitForTimeout(40);
ok(await p.evaluate(() => drumState().pats[2].sl === -1 || drumState().pats[2].sl == null), 'tap again: follows the switch');
if (shots) await p.screenshot({ path: shots + '/4-slicer.png' });
const metalOn0 = await p.evaluate(() => drumVal('gl.on'));
await hold('[data-mod-key="gl.on"]');
const mp = await p.evaluate(() => ({ pop: !!document.querySelector('#modPop'), ch: !!document.querySelector('#modPop .modpopch'), sel: document.querySelectorAll('#modPop select option').length, on: drumVal('gl.on') }));
ok(mp.pop && mp.ch && mp.sel === 4, 'holding Metalise ON offers sources and CHANCE (every 1/16 … 1 bar)');
ok(mp.on === metalOn0, 'the hold does not also flip the switch');
await p.locator('#modPop .modchip').nth(1).click();
ok(await p.evaluate(() => drumWires().some(w => w.k === 'gl.on' && w.s === 1)), 'LFO 2 now automates Metalise');
if (shots) await p.screenshot({ path: shots + '/5-metal-hold.png' });
await p.mouse.click(5, 5); await p.waitForTimeout(40);
ok(await p.evaluate(() => !document.querySelector('#modPop') && document.querySelector('[data-mod-key="gl.on"]').classList.contains('wired')), 'outside tap closes it; the switch shows it is wired');
await p.evaluate(() => { document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')); });

// 7 · LFO DRAW: the editor appears and drawing sends points
await p.evaluate(() => { drumSet('lfo1.shape', 5); openMod(); }); await p.waitForTimeout(80);
const cv = p.locator('#modModal canvas.lfodraw, #modModal .lfodraw canvas').first();
ok(await cv.count() > 0, 'Draw shape shows a drawing canvas');
if (await cv.count()) { const r = await cv.boundingBox(); await p.mouse.move(r.x + 4, r.y + r.height - 4); await p.mouse.down(); await p.mouse.move(r.x + r.width - 4, r.y + 4, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(120);
  const pts = await p.evaluate(() => drumLfoPts()[0]); ok(pts[0] < -0.5 && pts[15] > 0.5, `drawing a rising line rewrites LFO 1 (${pts[0]} … ${pts[15]})`); }
if (shots) await p.screenshot({ path: shots + '/6-lfo-draw.png' });
await p.evaluate(() => { document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')); openDrums(); });

// 8 · EQ above TAPE in the effects column; LONG button
const lay = await p.evaluate(() => { const eq = document.querySelector('.dmeqsec'), tp = document.querySelector('.dmtape');
  return { same: eq && tp && eq.parentElement === tp.parentElement, above: eq && tp && eq.getBoundingClientRect().bottom <= tp.getBoundingClientRect().top + 1, long: !!document.querySelector('.dmlong') }; });
ok(lay.same && lay.above, 'the track EQ sits directly above TAPE (WHOLE MIX)'); ok(lay.long, 'a LONG button sits by Decay');
await p.locator('.dmlong').first().click(); await p.waitForTimeout(40);
ok(await p.evaluate(() => [...Array(12).keys()].some(t => drumVal(`t${t + 1}.long`) === 1)), 'LONG switches on');
if (shots) await p.screenshot({ path: shots + '/7-eq-long.png' });

// 9 · step designs and the About logo
await p.evaluate(() => openSettings('appearance')); await p.waitForTimeout(60);
ok(await p.evaluate(() => document.querySelectorAll('.stepprev').length === 3), 'Appearance offers 3 step designs');
for (const s of ['glass', 'neon']) { await p.evaluate(s => { PREFS.steps = s; stepStyleApply(); }, s);
  ok(await p.evaluate(s => document.body.classList.contains('steps-' + s), s), `step design ${s} applies`);
  if (shots) { await p.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'))); await p.screenshot({ path: shots + `/8-steps-${s}.png` }); await p.evaluate(() => openSettings('appearance')); } }
await p.evaluate(() => { PREFS.steps = 'classic'; stepStyleApply(); openSettings('about'); }); await p.waitForTimeout(60);
ok(await p.evaluate(() => { const i = document.querySelector('.setlogo'); return !!i && i.naturalWidth > 0 && /Hybrid drum machine/i.test(document.querySelector('#setModal').textContent); }), 'About shows the logo and “Hybrid drum machine”');
if (shots) await p.screenshot({ path: shots + '/9-about.png' });

ok(!errs.length, 'no page errors: ' + errs.join(' | '));
console.log(`${checks} checks, ${fails} failed`);
await b.close(); process.exit(fails ? 1 : 0);
