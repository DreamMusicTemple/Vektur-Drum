// Renders events.txt through the web engine (web/dist/index.html) → out_js.f32, then compares with the C++ renders.
'use strict';
const fs = require('fs'), path = require('path');
const { loadEngine } = require('../load-engine');
const E = loadEngine(path.join(__dirname, '../../web/dist/index.html'));
const d = new E.Drums(48000);
const lines = fs.readFileSync(path.join(__dirname, 'events.txt'), 'utf8').trim().split('\n');
// NEW (0.9): the same slice table as run_cpp.cpp (float32 values)
const sliceTable = (n, ns) => { const t = new Float32Array(ns * 11); for (let i = 0; i < ns; i++) { const o = i * 11, L = Math.floor(n / ns);
  t[o] = i * L; t[o + 1] = L; t[o + 2] = (i % 5) - 2; t[o + 3] = 0.6 + 0.1 * (i % 4); t[o + 4] = ((i % 3) - 1) * 0.3; t[o + 5] = (i % 2) * 0.002; t[o + 6] = 1 - 0.15 * (i % 4);
  t[o + 7] = i % 3 === 1 ? 1 : 0; t[o + 8] = i % 4 === 2 ? 2 : 0; t[o + 9] = 0.01; t[o + 10] = i % 5 === 3 ? 0.6 : -1; } return t; };
const out = []; let pos = 0, inOn = 0; const L = new Float32Array(128), R = new Float32Array(128), IL = new Float32Array(128), IR = new Float32Array(128);
const inSig = (n, c) => Math.fround(0.3 * Math.sin(2.0 * 3.141592653589793 * (c ? 330.0 : 220.0) * n / 48000.0) + 0.1 * Math.sin(2.0 * 3.141592653589793 * 3110.0 * n / 48000.0) * ((n >> 11) & 1));   // the insert input (same in run_cpp.cpp)
const renderTo = target => { while (pos < target) { const n = Math.min(128 - pos % 128, target - pos); L.fill(0); R.fill(0);
  if (inOn) { for (let i = 0; i < n; i++) { IL[i] = inSig(pos + i, 0); IR[i] = inSig(pos + i, 1); } d.render(L.subarray(0, n), R.subarray(0, n), n, IL.subarray(0, n), IR.subarray(0, n)); }
  else d.render(L.subarray(0, n), R.subarray(0, n), n);
  for (let i = 0; i < n; i++) out.push(L[i], R[i]); pos += n; } };
for (const ln of lines) {
  const a = ln.split(' '); if (a[0] === 'END') { renderTo(+a[1]); break; }
  renderTo(+a[0]); const op = a[1], n = a.slice(2).map(Number);
  if (op === 'P') d.setParam(E.ID[a[2]], +a[3]);
  else if (op === 'S') { d.setStep(n[0], n[1], n[2], n[3], Math.fround(n[4]), Math.fround(n[5]), Math.fround(n[6]), n[7]); d.setStepFx(n[0], n[1], n[2], Math.fround(n[8]), Math.fround(n[9]), Math.fround(n[10]), Math.fround(n[11])); d.setStepFm(n[0], n[1], n[2], Math.fround(n[12]));
    d.setStepRing(n[0], n[1], n[2], n.length > 13 ? n[13] : 0, n[14] || 0, n[15] || 0, Math.fround(n[16] || 0), Math.fround(n.length > 17 ? n[17] : 220)); d.setStepFold(n[0], n[1], n[2], Math.fround(n.length > 18 ? n[18] : 0));
    d.setStepShift(n[0], n[1], n[2], Math.fround(n.length > 19 ? n[19] : 0), Math.fround(n.length > 20 ? n[20] : 1), Math.fround(n.length > 21 ? n[21] : 0), Math.fround(n.length > 22 ? n[22] : 0), Math.fround(n.length > 23 ? n[23] : 1));
    d.setStepMetal(n[0], n[1], n[2], Math.fround(n.length > 24 ? n[24] : -1), n.length > 25 ? n[25] : 0, Math.fround(n.length > 26 ? n[26] : 0), Math.fround(n.length > 27 ? n[27] : 0)); }
  else if (op === 'G') d.setPatternSlicer(n[0], n[1]);
  else if (op === 'D') d.setLfoPoints(n[0], n.slice(1, 17).map(Math.fround));
  else if (op === 'Q') d.hitSlice(n[0], n[1], Math.fround(n[2]));
  else if (op === 'V') { const [tr, len, hz, dec, rate, ns] = n; if (len <= 0) d.setSample(tr, null, 0); else { const x = new Float32Array(len); for (let i = 0; i < len; i++) x[i] = Math.sin(2.0 * 3.141592653589793 * hz * i / rate * (1 + (i % 9000) / 9000)) * Math.exp(-(i % 7500) / (dec * rate)) * (1.0 - i / len);
      d.setSample(tr, x, rate, sliceTable(len, ns)); } }
  else if (op === 'I') inOn = n[0];
  else if (op === 'X') d.setWire(n[0], n[1], a[4] === '-' ? -1 : E.ID[a[4]], Math.fround(+a[5]));
  else if (op === 'L') d.setSlice(n[0], n[1], n[2]);
  else if (op === 'K') d.setTrack(n[0], n[1], n[2], n[3]); else if (op === 'B') d.setBars(n[0], n[1]);
  else if (op === 'C') d.setChain(n.slice(2, 2 + n[1]), n[1], n[0]); else if (op === 'Y') d.select(n[0]); else if (op === 'Z') d.play(n[0]);
  else if (op === 'R') d.recOn = n[0]; else if (op === 'N') d.setTracks(n[0]); else if (op === 'E') d.enabledFlag = n[0];
  else if (op === 'T') d.tempo = Math.fround(n[0]); else if (op === 'H') { d.hostBeat = n[0]; d.beatSerial++; }
  else if (op === 'M') { if (d.takes(n[0])) d.midi(n[0], n[1], n[2]); }
  else if (op === 'W') { const [tr, len, hz, dec, rate] = n; if (len <= 0) d.setSample(tr, null, 0); else { const x = new Float32Array(len); for (let i = 0; i < len; i++) x[i] = Math.sin(2.0 * 3.141592653589793 * hz * i / rate) * Math.exp(-i / (dec * rate)) * (1.0 - i / len); d.setSample(tr, x, rate); } }
}
const js = Float32Array.from(out); fs.writeFileSync(path.join(__dirname, 'out_js.f32'), Buffer.from(js.buffer));
const rd = f => { const b = fs.readFileSync(path.join(__dirname, f)); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
const cpp = rd('out_cpp.f32'), selfFm = rd('out_cpp_fm.f32'), selfLm = rd('out_cpp_lm.f32'), selfLm2 = rd('out_cpp_lm2.f32');
if (cpp.length !== js.length) { console.log('LENGTH MISMATCH', cpp.length, js.length); process.exit(1); }
// Vektur VJ's tools/spectra_parity rule: 0.1 s windows; a window fails only if JS differs from C++ by more than 4× the
// C++ engine's difference from itself (and more than 1e-4). "Itself" = built with -ffast-math, and built with
// 1-ulp jitter on ~3 % of sin / exp / pow results (VD_ALT_LIBM 1 and 2: two different 3 %), which is how V8's Math functions differ from the platform's.
const W = 4800 * 2; let fails = [], wild = 0, chaotic = 0, maxd = 0, exactWin = 0, nWin = 0, peak = 0;
for (let w0 = 0; w0 < js.length; w0 += W) {
  let dd = 0, s = 0;
  for (let i = w0; i < Math.min(js.length, w0 + W); i++) { dd = Math.max(dd, Math.abs(js[i] - cpp[i])); s = Math.max(s, Math.abs(selfFm[i] - cpp[i]), Math.abs(selfLm[i] - cpp[i]), Math.abs(selfLm2[i] - cpp[i])); peak = Math.max(peak, Math.abs(cpp[i])); }
  nWin++; maxd = Math.max(maxd, dd); if (dd < 1e-5) exactWin++; if (s > 1e-4) chaotic++;
  if (s >= 1e-2) wild++;   // the C++ engine differs from itself by over 1 % of full scale here: chaos (FM feedback, Lorenz) — no comparison carries information; the strict pass covers it without them
  else if (dd > Math.max(1e-4, 4 * s)) fails.push(`${(w0 / 2 / 48000).toFixed(1)} s (${dd.toExponential(1)} vs self ${s.toExponential(1)})`);
}
console.log(`JS vs C++: ${js.length / 2} frames, ${nWin} windows · ${exactWin} within 1e-5 · ${chaotic} chaotic (C++ differs from itself too; ${wild} by over 1e-2) · max |diff| ${maxd.toExponential(2)} · peak ${peak.toFixed(3)}`);
const STRICT = process.argv.includes('--strict');
if (STRICT) { const ok = maxd < 1e-6; console.log(ok ? 'strict parity OK: every sample within 1e-6' : 'STRICT FAIL: max ' + maxd.toExponential(2)); process.exit(ok ? 0 : 1); }
if (fails.length) { console.log('FAIL in ' + fails.length + ' windows: ' + fails.slice(0, 12).join(', ')); process.exit(1); }
console.log('parity OK');
