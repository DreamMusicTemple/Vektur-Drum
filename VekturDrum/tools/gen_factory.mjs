#!/usr/bin/env node
// Vektur Drum — one set of factory kits for every app.
//   node tools/gen_factory.mjs          (after python3 -I tools/build_web.py; needs Playwright + Chrome)
// The factory kits are defined in the web app (web/src/factory*.js — the genre kits are grown from a seed, so this is the
// only place they exist as data). This writes them, each as a vektur-drum-state document, to
//   native/Sources/VekturDrumCore/Resources/FactoryKits.json      read by FactoryKits.load() → [Kit] (StateCodec)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const p = await (await b.newContext()).newPage();
await p.goto('file://' + path.join(ROOT, 'web/dist/index.html')); await p.waitForSelector('.dm');
const kits = await p.evaluate(() => DRUM_FACTORY.map(k0 => {
  const k = presetClean('drums', k0), P = drumMigrateParams(Object.assign({}, k.p), k.smp), params = {};
  for (const q of DRUM_PARAMS) if (q[0] !== 'dr.ch' && P[q[0]] != null && P[q[0]] !== q[6]) params[q[0]] = P[q[0]];   // only what differs: the reader fills in defaults
  const pats = k.pats.slice(0, 8); while (pats.length < 8) pats.push(drumEmptyPattern());
  return { name: k.name, category: k.cat || '', bpm: k.bpm || null, init: !!k.init, state: { format: STATE_FORMAT, version: STATE_VERSION, writer: 'Vektur Drum factory',
    project: { tempo: k.bpm || 120, trackCount: k.ntr || 9, selected: 0, chain: k.chain, chainOn: !!k.chainOn, kit: k.name, params,
      patterns: pats.map(pt => ({ bars: pt.bars, tracks: pt.tr.map(tr => ({ len: tr.len, div: tr.div, steps: tr.s.map(s => s ? s.slice() : null) })) })),
      samples: [], slicer: drumSliceClean(k.slice), wires: drumWiresClean(k.wires).map(w => ({ source: MOD_SRC_IDS[w.s], param: w.k, amount: w.a })) } } };
}));
await b.close();
const out = path.join(ROOT, 'native/Sources/VekturDrumCore/Resources/FactoryKits.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ format: 'vektur-drum-factory', version: 1, kits }));
console.log(`factory: ${kits.length} kits → ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
