// Vektur Drum — headless engine tests (node tests/engine.test.js <page>: reference/web/index.html or web/dist/index.html)
// Loads DRUM_PARAMS + drumsMakeEngine straight out of the built page, renders offline, and checks the
// sequencer and DSP behaviour that the native port must reproduce. Exit code 1 on any failure.
'use strict';
const fs = require('fs');
const page = fs.readFileSync(process.argv[2] || 'reference/web/index.html', 'utf8');
const code = require('./load-engine').engineCode(page);
const { DRUM_PARAMS, DRUM_DIV_BEATS, DRUM_NOTES, DRUM_DEF_DIV, drumsMakeEngine } =
  new Function(code + '\nreturn { DRUM_PARAMS, DRUM_DIV_BEATS, DRUM_NOTES, DRUM_DEF_DIV, drumsMakeEngine };')();
const Drums = drumsMakeEngine(DRUM_PARAMS, DRUM_DIV_BEATS, DRUM_NOTES, DRUM_DEF_DIV);
const ID = {}; DRUM_PARAMS.forEach((p, i) => { ID[p[0]] = i; });

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('  FAIL', msg); } };
const SR = 48000, BLK = 128;
function make(bpm = 120) { const d = new Drums(SR); d.enabledFlag = 1; d.tempo = Math.fround(bpm); return d; }
function run(d, seconds, onBlock) {
  const n = Math.ceil(seconds * SR / BLK), L = new Float32Array(BLK), R = new Float32Array(BLK), outL = new Float32Array(n * BLK), outR = new Float32Array(n * BLK);
  for (let b = 0; b < n; b++) { L.fill(0); R.fill(0); d.render(L, R, BLK); outL.set(L, b * BLK); outR.set(R, b * BLK); if (onBlock) onBlock(b, d); }
  return { L: outL, R: outR };
}
const onsets = (x, thr = 0.02, gap = 0.03) => { const t = []; let last = -1e9; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > thr && i - last > gap * SR) { t.push(i); last = i; } else if (Math.abs(x[i]) > thr) last = i; return t; };
const finite = x => x.every(Number.isFinite);
const peak = x => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

function test(name, f) { const before = fails; try { f(); } catch (e) { fails++; console.log('  FAIL', name, e.message); } console.log((fails === before ? 'ok   ' : 'FAIL ') + name); }

test('every model renders finite, bounded, non-silent audio', () => {
  for (let m = 0; m < 8; m++) {
    const d = make(); d.setParam(ID['t1.model'], m); d.setParam(ID['t1.decay'], 0.3);
    d.midi(0x99, 36, 110); const o = run(d, 0.5);
    ok(finite(o.L) && finite(o.R), `model ${m} finite`); ok(peak(o.L) > 0.01, `model ${m} audible (peak ${peak(o.L).toFixed(3)})`); ok(peak(o.L) <= 1.0, `model ${m} ≤ 0 dBFS`);
  }
});
test('kick-on-quarters: onsets land on the beat grid (120 BPM → 24000 samples)', () => {
  const d = make(120);
  [0, 4, 8, 12].forEach(k => d.setStep(0, 0, k, 1, 0.9, 0, 0, 1));
  d.play(1); const o = run(d, 4.2); const on = onsets(o.L, 0.05, 0.2);
  ok(on.length >= 7, `≥7 kicks in 4.2 s (got ${on.length})`);
  const iv = on.slice(1).map((v, i) => v - on[i]);
  ok(iv.every(x => Math.abs(x - 24000) <= 2 * BLK), 'intervals within 2 blocks of 24000: ' + iv.join(','));
});
test('no timing drift over 5 minutes (sequencer beat vs sample count)', () => {
  const d = make(133); d.setStep(0, 0, 0, 1, 0.9, 0, 0, 1); d.play(1);
  run(d, 300);
  const expect = 300 * 133 / 60; ok(Math.abs(d.beat - expect) < 1e-3, `beat ${d.beat.toFixed(6)} vs ${expect}`);
});
test('swing delays odd steps by swing × step / 2', () => {
  const d = make(120); for (let k = 0; k < 16; k += 1) d.setStep(0, 2, k, 1, 0.9, 0, 0, 1);
  d.setParam(ID['t3.decay'], 0.02); d.setParam(ID['dr.swing'], 0.5); run(d, 0.1);   // let the smoothed swing settle (it is read when the previous step fires)
  d.play(1);
  const o = run(d, 2.2); const on = onsets(o.L, 0.02, 0.04).slice(0, 8);
  const step = 6000, iv = on.slice(1).map((v, i) => v - on[i]);
  ok(iv.length >= 6 && Math.abs(iv[0] - step * 1.25) < 300 && Math.abs(iv[1] - step * 0.75) < 300, 'long-short pairs: ' + iv.join(','));
});
test('mute and solo', () => {
  const a = make(); a.setStep(0, 0, 0, 1, 1, 0, 0, 1); a.setParam(ID['t1.mute'], 1); a.play(1); ok(peak(run(a, 1).L) < 1e-4, 'muted track is silent');
  const b = make(); b.setStep(0, 0, 0, 1, 1, 0, 0, 1); b.setParam(ID['t2.solo'], 1); b.play(1); ok(peak(run(b, 1).L) < 1e-4, 'solo elsewhere silences track 1');
});
test('probability 0 never plays; ratchet ×4 plays four hits in one step', () => {
  const a = make(); a.setStep(0, 0, 0, 1, 1, 0, 0, 1); a.setStepFx(0, 0, 0, 0, 0, 0, 0); a.play(1); ok(peak(run(a, 2.5).L) < 1e-4, 'chance 0 is silent');
  const b = make(60); b.setStep(0, 2, 0, 1, 1, 0, 0, 4); b.setParam(ID['t3.decay'], 0.02); b.play(1);
  const on = onsets(run(b, 0.3).L, 0.02, 0.02); ok(on.length === 4, `ratchet hits ${on.length}`);
});
test('track length & division: polymeter (3-step track loops every 3 sixteenths)', () => {
  const d = make(120); d.setTrack(0, 2, 3, 5); d.setStep(0, 2, 0, 1, 1, 0, 0, 1); d.setParam(ID['t3.decay'], 0.02); d.play(1);
  const on = onsets(run(d, 2.1).L, 0.02, 0.04); const iv = on.slice(1).map((v, i) => v - on[i]);
  ok(iv.slice(0, 4).every(x => Math.abs(x - 18000) <= 2 * BLK), '3-step loop: ' + iv.slice(0, 5).join(','));
});
test('pattern chain advances at pattern end', () => {
  const d = make(240); d.setStep(1, 0, 0, 1, 1, 0, 0, 1); d.setChain([0, 1], 2, 1); d.play(1);
  const seen = new Set(); run(d, 3, () => seen.add(d.cur)); ok(seen.has(0) && seen.has(1), 'played patterns: ' + [...seen]);
});
test('hat choke: closed hat (track 3) chokes open hat (track 4)', () => {
  const d = make(); d.setParam(ID['t4.decay'], 2.0); d.midi(0x99, 46, 120); run(d, 0.05);
  const before = d.v[3].amp; d.midi(0x99, 42, 120); run(d, 0.05); ok(d.v[3].amp < before * 0.01 || !d.v[3].active, 'open hat choked');
});
test('MIDI channel filter: default channel 10, notes 36/38/42/46/39/45 → tracks 1–6', () => {
  const d = make(); ok(d.takes(0x99) && !d.takes(0x90), 'channel 10 only');
  DRUM_NOTES.forEach((n, t) => ok(d.trackOf(n) === t, `note ${n} → track ${t + 1}`));
});
test('REC: a live hit while playing is written to the nearest step and queued for the UI', () => {
  const d = make(120); d.recOn = 1; d.play(1); run(d, 1.0 + 0.5 * 4 / 16);   // ~step 2 of the second beat
  d.midi(0x99, 38, 100); ok(d.recQ.length === 1 && d.recQ[0][1] === 1, 'recorded: ' + JSON.stringify(d.recQ));
});
test('effects: delay + reverb tails stay finite, DC-free and decay to silence', () => {
  const d = make(); d.setParam(ID['t2.dly'], 1); d.setParam(ID['t2.rev'], 1); d.setParam(ID['dr.dlyfb'], 0.9); d.setParam(ID['dr.revsize'], 1);
  d.midi(0x99, 38, 127); const o = run(d, 20);
  ok(finite(o.L) && finite(o.R), 'finite'); ok(peak(o.L) <= 1, 'bounded');
  const tail = o.L.subarray(o.L.length - SR); ok(peak(tail) < 1e-3, 'tail decays (last-second peak ' + peak(tail).toExponential(2) + ')');
  const mean = o.L.reduce((s, v) => s + v, 0) / o.L.length; ok(Math.abs(mean) < 1e-3, 'no DC (mean ' + mean.toExponential(2) + ')');
});
test('samples: a track with a sample plays it and stops at the end', () => {
  const d = make(); const smp = new Float32Array(4800).map((_, i) => Math.sin(i / 10) * 0.8);
  d.setSample(0, smp, 48000); d.setParam(ID['t1.decay'], 3); if (ID['t1.engine'] != null) d.setParam(ID['t1.engine'], 1); /* Vektur Drum: samples play on the Sample engine */ d.midi(0x99, 36, 127); const o = run(d, 0.3);
  ok(peak(o.L.subarray(0, 4000)) > 0.1, 'sample audible'); ok(peak(o.L.subarray(6000)) < 1e-3, 'stops after its end');
});
test('sample-rate changes: 44.1 / 48 / 96 kHz keep tempo', () => {
  for (const sr of [44100, 48000, 96000]) { const d = new Drums(sr); d.enabledFlag = 1; d.tempo = 120; d.play(1);
    const L = new Float32Array(BLK), R = new Float32Array(BLK); for (let i = 0; i < sr / BLK * 2; i++) d.render(L, R, BLK);
    ok(Math.abs(d.beat - 4) < 0.02, `${sr} Hz: beat ${d.beat.toFixed(3)} after 2 s`); }
});
test('render cost (informational): 6 tracks of 16ths with fx', () => {
  const d = make(174); for (let t = 0; t < 6; t++) for (let k = 0; k < 16; k++) d.setStep(0, t, k, 1, 0.8, 0, 0, 1);
  for (let t = 1; t <= 6; t++) { d.setParam(ID[`t${t}.dly`], 0.3); d.setParam(ID[`t${t}.rev`], 0.3); } d.play(1);
  const t0 = process.hrtime.bigint(); run(d, 30); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`      30 s rendered in ${ms.toFixed(0)} ms (${(30000 / ms).toFixed(0)}× real time, JS)`); ok(true, '');
});

console.log(`\n${passes} checks passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
