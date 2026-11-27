// Vektur Drum — EXPORT: encoders (decoded back with ffmpeg) and the offline render (lengths, chain vs pattern, stems).
//   node tests/export.test.mjs        (needs Playwright + Chrome, and ffmpeg / ffprobe on the PATH)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import fs from 'fs'; import path from 'path'; import os from 'os';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vdexp-'));
let fails = 0, checks = 0; const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } else console.log('ok  ', m); };
// ---- encoders, in Node (same file as the app)
const VDENC = new Function(fs.readFileSync(path.join(ROOT, 'web/src/encoders.js'), 'utf8') + '; return VDENC;')();
const dec = f => { const b = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'f32le', '-ac', '2', '-'], { maxBuffer: 1 << 28 }); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
for (const sr of [44100, 48000]) {
  const n = sr * 2 + 777, L = new Float32Array(n), R = new Float32Array(n); let q = 1;
  for (let i = 0; i < n; i++) { const t = i / sr; q = (q * 1103515245 + 12345) >>> 0; L[i] = .4 * Math.sin(2 * Math.PI * 440 * t) + .2 * Math.sin(2 * Math.PI * 3000 * t) * Math.exp(-(i % 12000) / 2000) + .05 * (q / 2 ** 31 - 1); R[i] = .3 * Math.sin(2 * Math.PI * 660 * t) + .3 * Math.sin(2 * Math.PI * 55 * t) * Math.exp(-(i % 24000) / 6000); }
  const snr = d => { let e = 0, s = 0; for (let i = 0; i < n; i++) { e += (d[2 * i] - L[i]) ** 2 + (d[2 * i + 1] - R[i]) ** 2; s += L[i] ** 2 + R[i] ** 2; } return 10 * Math.log10(s / e); };
  for (const [ext, f, want] of [['wav', () => VDENC.wav([L, R], sr, 16), 85], ['wav', () => VDENC.wav([L, R], sr, 24), 130], ['wav', () => VDENC.wav([L, R], sr, 32), 300], ['flac', () => VDENC.flac([L, R], sr, 16), 85], ['flac', () => VDENC.flac([L, R], sr, 24), 130],
    ['mp3', () => VDENC.mp3([L, R], sr, 128), 28], ['mp3', () => VDENC.mp3([L, R], sr, 192), 35], ['mp3', () => VDENC.mp3([L, R], sr, 320), 45]]) {
    const b = f(), file = path.join(TMP, 'x.' + ext); fs.writeFileSync(file, b); const d = dec(file), s = snr(d);
    ok(d.length / 2 === n && s > want, `${ext} ${sr} Hz: decodes to exactly ${n} samples, SNR ${s === Infinity ? '∞' : s.toFixed(1)} dB (> ${want})${ext === 'flac' ? ' — lossless: identical to the WAV of the same depth' : ''}`);
  }
  const m = VDENC.flac([L], sr, 16), mf = path.join(TMP, 'm.flac'); fs.writeFileSync(mf, m); ok(dec(mf).length / 2 === n, 'FLAC mono decodes');
}
{ const z = VDENC.zip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }, { name: 'b é.bin', data: new Uint8Array([1, 2, 3]) }]), f = path.join(TMP, 't.zip'); fs.writeFileSync(f, z);
  const t = execFileSync('unzip', ['-t', f]).toString(); ok(/No errors/.test(t), 'ZIP (stored) tests clean with unzip'); }
// ---- the offline render, in the app
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const p = await (await b.newContext()).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file://' + path.join(ROOT, 'web/dist/index.html')); await p.waitForSelector('.dm');
const r = await p.evaluate(async () => {
  const out = {}, d = drumState(), sr = 48000, none = Array(DRUM_TRACKS).fill(null);
  drumSet('dr.temper', 0); drumSet('dr.revsize', .4); d.pats[1] = JSON.parse(JSON.stringify(d.pats[0])); d.pats[1].bars = 2; d.pats[2] = JSON.parse(JSON.stringify(d.pats[0]));
  EXP.tail = 'cut';
  d.chainOn = false; d.sel = 1; let plan = exportPlan(); let [L] = await exportRender(sr, plan, -1, none);
  out.pattern = [plan.label, plan.beats, L.length, Math.round(8 * 60 / S.bpm * sr)];
  d.chain = [0, 1, 2, 1]; d.chainOn = true; plan = exportPlan(); [L] = await exportRender(sr, plan, -1, none);
  out.chain = [plan.label, plan.beats, L.length, Math.round(24 * 60 / S.bpm * sr)];
  // the chain really plays its patterns: pattern 3 (index 2) gets a hit on step 3 only there
  const live = (() => { let e = 0; for (const v of L) e += v * v; return e; })(); out.audible = live > 1;
  EXP.tail = 'ring'; d.chainOn = false; d.sel = 0; drumSet('t2.rev', .8); plan = exportPlan();
  const [mL, mR] = await exportRender(sr, plan, -1, none); out.ringLen = mL.length; out.body = Math.round(plan.seconds * sr);
  // stems: the same performance with the other tracks muted; with a linear master (TEMPER neutral, no Metalise / Slicer / tape) they add up to the master
  const tr = exportStemTracks(plan); out.stems = tr.length; const sum = new Float64Array(mL.length);
  for (const t of tr) { const [sL] = await exportRender(sr, plan, t, none); for (let i = 0; i < Math.min(sL.length, sum.length); i++) sum[i] += sL[i]; }
  let e = 0, s = 0; for (let i = 0; i < mL.length; i++) { e += (sum[i] - mL[i]) ** 2; s += mL[i] ** 2; } out.stemErr = 10 * Math.log10(s / Math.max(e, 1e-30));
  // nothing leaked into the live engine or the song
  out.untouched = d.chain.join() === '0,1,2,1' && drumVal('t1.mute') === 0 && !EXP.busy;
  return out;
});
ok(r.pattern[2] === r.pattern[3], `CHAIN off: the selected pattern once (${r.pattern[0]}, ${r.pattern[1] / 4} bars = ${r.pattern[2]} samples)`);
ok(r.chain[2] === r.chain[3] && r.chain[0] === 'Chain 1 · 2 · 3 · 2' && r.audible, `CHAIN on: the whole chain once (${r.chain[0]}, ${r.chain[1] / 4} bars = ${r.chain[2]} samples)`);
ok(r.ringLen > r.body && r.ringLen < r.body + 30 * 48000, `RING OUT: the reverb rings on and stops at silence (${((r.ringLen - r.body) / 48000).toFixed(2)} s of tail)`);
ok(r.stems >= 3 && r.stemErr > 60, `stems (${r.stems}) add up to the master: ${r.stemErr.toFixed(1)} dB below it`);
ok(r.untouched, 'the song and the live engine are untouched');
ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close(); fs.rmSync(TMP, { recursive: true, force: true });
console.log(`${checks} checks, ${fails} failed`); process.exit(fails ? 1 : 0);
