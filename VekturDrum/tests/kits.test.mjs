// Vektur Drum — every factory kit plays: loaded exactly as the preset browser does, rendered 12 s through the engine
// (chain, Slicer, wires, ring and fold steps, EQ, tape), checked finite, bounded and audible.
//   node tests/kits.test.mjs        (needs Playwright + Chrome)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'url';
import path from 'path';
const url = 'file://' + path.join(path.dirname(fileURLToPath(import.meta.url)), '../web/dist/index.html');
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const p = await (await b.newContext()).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(url); await p.waitForSelector('.dm');
const res = await p.evaluate(() => {
  const Drums = drumsMakeEngine(DRUM_PARAMS, DRUM_DIV_BEATS, DRUM_NOTES, DRUM_DEF_DIV), out = [];
  const bpm = { 'IDM': 128, 'Techno': 130, 'Lo-Fi & Downtempo': 84, 'Hard Trance': 145, 'Psytrance': 145 };
  for (const k0 of DRUM_FACTORY) {
    const k = presetClean('drums', k0), d = new Drums(48000); d.enabledFlag = 1; d.tempo = k.bpm || bpm[k.cat] || 120;
    const P = drumMigrateParams(Object.assign({}, k.p), k.smp); DRUM_PARAMS.forEach((q, i) => d.setParam(i, P[q[0]] != null ? P[q[0]] : q[6]));
    k.pats.forEach((pt, pi) => d.op(['P', pi, drumPatternArray(pt)]));   // the engine's own pattern op (0.9: 12 tracks, 25 fields a step)
    d.setChain(k.chain, k.chain.length, k.chainOn ? 1 : 0); (k.slice || []).forEach((s, i) => d.setSlice(i, s[0], s[1])); (k.wires || []).forEach((w, i) => d.setWire(i, w.s, DP_ID[w.k], w.a));
    d.play(1); const L = new Float32Array(128), R = new Float32Array(128); let pk = 0, ss = 0, n = 0, bad = 0;
    for (let bl = 0; bl < 48000 * 12 / 128; bl++) { L.fill(0); R.fill(0); d.render(L, R, 128); for (let i = 0; i < 128; i++) { const v = L[i], w = R[i]; if (!isFinite(v) || !isFinite(w)) bad++; pk = Math.max(pk, Math.abs(v), Math.abs(w)); if (bl > 375) { ss += v * v; n++; } } }
    out.push({ name: k.name, cat: k.cat, init: !!k.init, blank: k.init ? Object.keys(k.p).length === 0 && k.pats.every(pt => pt.tr.every(tr => tr.s.every(x => !x))) : true, pk, db: 20 * Math.log10(Math.sqrt(ss / n) + 1e-12), bad, pats: k.pats.length, wires: (k.wires || []).length });
  }
  return out;
});
let fails = 0; const bycat = {};
const catDb = {}; for (const r of res) if (!r.init) { const c = catDb[r.cat] = catDb[r.cat] || [1e9, -1e9]; c[0] = Math.min(c[0], r.db); c[1] = Math.max(c[1], r.db); }
for (const c of ['80s Electro', 'Breakbeat', 'Ambient']) if (catDb[c]) console.log(`  ${c}: ${catDb[c][0].toFixed(1)}…${catDb[c][1].toFixed(1)} dB RMS`);
console.log('  Init: ' + (res.find(r => r.init) && res.find(r => r.init).blank ? 'blank (defaults, empty patterns) and silent' : 'MISSING'));
for (const r of res) { bycat[r.cat] = (bycat[r.cat] || 0) + 1; if (r.init ? (!r.blank || r.pk > 0 || r.bad) : (r.bad || r.pk > 1.0 || r.db < -40)) { fails++; console.log('  FAIL', r.name, JSON.stringify(r)); } }
console.log(`${res.length} kits: ${Object.entries(bycat).filter(([, n]) => n > 1).map(([c, n]) => `${n} ${c}`).join(', ')} (+ ${res.length - Object.values(bycat).filter(n => n > 1).reduce((a, b) => a + b, 0)} more)`);
console.log(`loudness ${Math.min(...res.map(r => r.db)).toFixed(1)}…${Math.max(...res.map(r => r.db)).toFixed(1)} dB RMS, peak ≤ ${Math.max(...res.map(r => r.pk)).toFixed(2)}`);
if (errs.length) { fails++; console.log('page errors', errs); }
console.log(`${res.length} kits checked, ${fails} failed`); await b.close(); process.exit(fails ? 1 : 0);
