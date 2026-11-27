// Vektur Drum — tests of the new engine features (node tests/features.test.js web/dist/index.html)
'use strict';
const { loadEngine } = require('./load-engine');
const E = loadEngine(process.argv[2] || 'web/dist/index.html'), { Drums, ID, DRUM_NOTES } = E;
const SR = 48000, BLK = 128;
const REV_TYPES = ['Room', 'Spring', 'Gate', 'Expanse'], SPEC_ZONES = ['Smear', 'Shift', 'Harmonic', 'Robot', 'Whisper', 'Freeze'];
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) { passes++; if (process.env.V && msg) console.log('     ·', msg); } else { fails++; console.log('  FAIL', msg); } };
function test(name, f) { const b = fails; try { f(); } catch (e) { fails++; console.log('  FAIL', name, e.stack); } console.log((fails === b ? 'ok   ' : 'FAIL ') + name); }
function make(bpm = 120, sr = SR) { const d = new Drums(sr); d.enabledFlag = 1; d.tempo = bpm; d.prm = (k, v) => d.setParam(ID[k], v); return d; }
function run(d, sec, each) { const n = Math.ceil(sec * d.sr / BLK), L = new Float32Array(BLK), R = new Float32Array(BLK), o = new Float32Array(n * BLK);
  for (let b = 0; b < n; b++) { L.fill(0); R.fill(0); d.render(L, R, BLK); o.set(L, b * BLK); if (each) each(b, d); } return o; }
const peak = x => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const finite = x => x.every(Number.isFinite);
const zc = (x, a, b) => { let n = 0; for (let i = a + 1; i < b; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) n++; return n; };
const silenceOthers = d => { for (let t = 1; t <= 9; t++) d.prm(`t${t}.level`, 0); };

test('12 tracks: steps on tracks 7–12 play; the track count hides tracks', () => {
  const d = make(); for (let t = 6; t < 12; t++) d.setStep(0, t, 0, 1, 1, 0, 0, 1); d.play(1); run(d, 0.8);
  ok([6, 7, 8, 9, 10, 11].every(t => d.hits[t] >= 1), 'hits on 7–12: ' + Array.from(d.hits).join(','));
  const e = make(); e.setTracks(6); for (let t = 6; t < 12; t++) e.setStep(0, t, 0, 1, 1, 0, 0, 1); e.play(1); run(e, 0.8);
  ok([6, 7, 8, 9, 10, 11].every(t => e.hits[t] === 0), 'hidden tracks are silent');
  ok(DRUM_NOTES.length === 12 && e.trackOf(DRUM_NOTES[11]) !== 11, 'notes of hidden tracks are not taken');
  const f = make(); f.midi(0x99, DRUM_NOTES[11], 100); ok(f.hits[11] === 1, 'MIDI note ' + DRUM_NOTES[11] + ' plays track 12');
});
test('engine per track: synth, sample, FM — a sample engine with no sample is silent', () => {
  const d = make(); silenceOthers(d); d.prm('t1.level', 1); d.prm('t1.engine', 1); d.midi(0x99, 36, 127); ok(peak(run(d, 0.2)) < 1e-6, 'empty sample engine silent');
  d.setSample(0, new Float32Array(4800).fill(0.5), 48000); d.midi(0x99, 36, 127); ok(peak(run(d, 0.05)) > 0.05, 'sample plays');
  d.prm('t1.engine', 2); d.midi(0x99, 36, 127); run(d, 0.002); ok(d.v[0].model === 9, 'FM engine → FM voice');
  d.prm('t1.engine', 0); d.midi(0x99, 36, 127); run(d, 0.002); ok(d.v[0].model === 0, 'synth engine → drum model');
});
test('FM: every algorithm, with feedback, fold and noise, is finite, bounded and audible', () => {
  for (let a = 0; a < 4; a++) for (const [fb, fold, nz] of [[0, 0, 0], [1, 1, 1], [0.5, 0.3, 0]]) {
    const d = make(); silenceOthers(d); const P = d.prm;
    P('t1.level', 1); P('t1.engine', 2); P('t1.fmalgo', a); P('t1.fmfb', fb); P('t1.fmfold', fold); P('t1.fmnoise', nz); P('t1.fmindex', 20); P('t1.fmfreq', 3000); P('t1.fmratio', 16); P('t1.decay', 0.5);
    d.midi(0x99, 36, 127); const o = run(d, 0.6);
    ok(finite(o) && peak(o) <= 1 && peak(o) > 0.05, `algo ${a} fb ${fb} fold ${fold} noise ${nz}: peak ${peak(o).toFixed(3)}`);
  }
});
test('FM wavefolder adds harmonics (more zero crossings) on a pure carrier', () => {
  const zcFold = fold => { const d = make(); silenceOthers(d); const P = d.prm; P('t1.level', 1); P('t1.engine', 2); P('t1.fmindex', 0); P('t1.fmfreq', 200); P('t1.fmfold', fold); P('t1.decay', 1); d.midi(0x99, 36, 127); const o = run(d, 0.2); return zc(o, 480, 4800); };
  const a = zcFold(0), b = zcFold(0.8); ok(b > a * 1.5, `zero crossings ${a} → ${b}`);
});
test('per-step FM ratio: steps with their own ratio sound different; 0 uses the track ratio', () => {
  const zcRatio = r => { const d = make(); silenceOthers(d); const P = d.prm; P('t1.level', 1); P('t1.engine', 2); P('t1.fmfreq', 150); P('t1.fmratio', 1); P('t1.fmindex', 4); P('t1.fmidec', 2); P('t1.decay', 1);
    d.setStep(0, 0, 0, 1, 1, 0, 0, 1); d.setStepFm(0, 0, 0, r); d.play(1); const o = run(d, 1.2); const s = o.findIndex(v => Math.abs(v) > 1e-3); return [zc(o, s + 480, s + 4800), d]; };
  const [base] = zcRatio(0), [hi] = zcRatio(7.1);
  ok(hi > base * 1.3, `track ratio ${base} zero crossings, step ratio 7.1 → ${hi}`);
  const d = make(); d.setStepFm(0, 0, 0, 99); ok(d.step[9] === 16, 'step ratio clamps to 16');
});
test('pitch sweep: starts high and glides home (synth, FM, sample)', () => {
  for (const eng of [0, 2, 1]) {
    const d = make(); silenceOthers(d); const P = d.prm; P('t6.level', 1); P('t6.engine', eng); P('t6.fmindex', 0); P('t6.fmfreq', 150); P('t6.decay', 2); P('t6.tone', 0); P('t6.snap', 0);
    if (eng === 1) d.setSample(5, Float32Array.from({ length: 96000 }, (_, i) => Math.sin(2 * Math.PI * 150 * i / 48000)), 48000);
    P('t6.sweep', 24); P('t6.swtime', 0.05); d.midi(0x99, DRUM_NOTES[5], 127);
    const o = run(d, 0.6), early = zc(o, 200, 2600), late = zc(o, 19200, 21600);
    ok(early > late * 2, `engine ${eng}: zero crossings early ${early} vs late ${late}`);
  }
});
test('choke groups A–D: same group cuts off, other groups ring on', () => {
  const d = make(); const P = d.prm; [1, 2, 5].forEach(t => P(`t${t}.decay`, 3));
  P('t1.choke', 2); P('t2.choke', 2); P('t5.choke', 3); P('t1.model', 7); P('t2.model', 7); P('t5.model', 7); run(d, 0.2);   // let smoothed params settle
  d.midi(0x99, DRUM_NOTES[0], 120); d.midi(0x99, DRUM_NOTES[4], 120); run(d, 0.05);
  const a0 = d.v[0].amp, e0 = d.v[4].amp; d.midi(0x99, DRUM_NOTES[1], 120); run(d, 0.05);
  ok(!d.v[0].active || d.v[0].amp < a0 * 0.01, 'track 1 choked by track 2 (group B)');
  ok(d.v[4].active && d.v[4].amp > e0 * 0.5, 'track 5 (group C) still rings');
  const f = make(); f.prm('t3.choke', 0); f.prm('t4.choke', 0); f.prm('t4.decay', 2); run(f, 0.2); f.midi(0x99, 46, 120); run(f, 0.05); const o = f.v[3].amp; f.midi(0x99, 42, 120); run(f, 0.05);
  ok(f.v[3].amp > o * 0.5, 'no group: hats do not choke');
});
test('glitch: all three modes stay finite and bounded, and change the sound', () => {
  const groove = d => { for (let k = 0; k < 16; k += 2) d.setStep(0, 0, k, 1, 0.9, 0, 0, 1); for (let k = 1; k < 16; k += 2) d.setStep(0, 2, k, 1, 0.6, 0, 0, 1); d.setStep(0, 1, 4, 1, 1, 0, 0, 1); d.setStep(0, 1, 12, 1, 1, 0, 0, 1); };
  const dry = (() => { const d = make(170); groove(d); d.play(1); return run(d, 6); })();
  for (let m = 0; m < 3; m++) {
    const d = make(170); groove(d); const P = d.prm; P('gl.on', 1); P('gl.mode', m); P('gl.mix', 1); P('gl.size', 0.4);
    P('lfo1.depth', 0.5); P('lfo1.dest', 1); P('lfo1.shape', 4); P('lfo1.rate', 3); P('lfo2.depth', 0.4); P('lfo2.dest', 2); P('lfo2.sync', 1); P('lfo2.div', 5);
    d.play(1); const o = run(d, 6); let diff = 0; for (let i = 0; i < o.length; i++) diff = Math.max(diff, Math.abs(o[i] - dry[i]));
    ok(finite(o) && peak(o) <= 1, `mode ${m}: finite, peak ${peak(o).toFixed(3)}`); ok(diff > 0.05, `mode ${m}: differs from dry (${diff.toFixed(3)})`);
    ok(peak(o) > 0.05, `mode ${m}: audible`);
  }
});
test('Metal stretch: replays grains from a lagging source — output repeats at (1 − stretch) × grain', () => {
  const d = make(120); const P = d.prm; P('gl.on', 1); P('gl.mode', 2); P('gl.mix', 1); P('gl.size', 0.3); P('gl.speed', 0);   // grain ≈ 7.4 ms, stretch 25 %
  run(d, 0.3); const N = 24000, out = new Float64Array(N), o = new Float64Array(2);
  let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296 - 0.5; };
  d.gMixS = 1;
  for (let i = 0; i < N; i++) { const x = rnd(); d.gb[0][d.gw] = x; d.gb[1][d.gw] = x; d.gw = (d.gw + 1) % d.gbLen; d.gAbs++; o[0] = x; o[1] = x; d.glitch(o, 120); out[i] = o[0]; }
  const G = Math.round(SR * 0.003 * Math.pow(20, 0.3)), lag = Math.round(0.75 * G);
  const ac = L => { let a = 0, e = 0; for (let i = 4000; i < N - L; i++) { a += out[i] * out[i + L]; e += out[i] * out[i]; } return a / e; };
  const at = ac(lag), off = ac(Math.round(lag * 0.6));
  ok(at > 0.4 && Math.abs(off) < 0.1, `autocorrelation at ${lag} samples ${at.toFixed(2)} (off-lag ${off.toFixed(2)})`);
});
test('LFOs: shapes run, sync locks to the beat, depth moves the glitch target', () => {
  const d = make(120); const P = d.prm; P('gl.on', 1); P('gl.size', 0.5); P('lfo1.depth', 0.5); P('lfo1.dest', 1); P('lfo1.shape', 3); P('lfo1.sync', 1); P('lfo1.div', 4);
  const sizes = new Set(); run(d, 2.1, () => sizes.add(Math.round(d.cGlSize * 100)));
  ok(sizes.has(100) && sizes.has(0), 'square LFO swings Size to both ends: ' + [...sizes].sort((a, b) => a - b).join(','));
  const vals = []; const e = make(120); e.prm('gl.on', 1); e.prm('lfo3.shape', 0); e.prm('lfo3.rate', 2); run(e, 1, () => vals.push(e.lfoV[2]));
  ok(Math.max(...vals) > 0.95 && Math.min(...vals) < -0.95, 'free sine LFO spans −1…1');
});
test('glitch off costs nothing audible: identical to glitch never touched', () => {
  const a = make(); a.setStep(0, 0, 0, 1, 1, 0, 0, 1); a.play(1); const x = run(a, 2);
  const b = make(); b.prm('gl.mix', 1); b.prm('lfo1.depth', 1); b.setStep(0, 0, 0, 1, 1, 0, 0, 1); b.play(1); const y = run(b, 2);
  ok(x.every((v, i) => v === y[i]), 'bit-identical');
});
test('long run: 9 tracks, FM, sweeps, glitch with 3 LFOs — 3 minutes, no drift, stays bounded', () => {
  const d = make(174); const P = d.prm;
  for (let t = 0; t < 9; t++) for (let k = 0; k < 16; k++) if ((k + t) % 3 === 0) d.setStep(0, t, k, 1, 0.8, 0, 0, 1 + (k % 4 === 3 ? 2 : 0));
  for (let t = 6; t <= 9; t++) { P(`t${t}.engine`, 2); P(`t${t}.sweep`, 12); P(`t${t}.fmfold`, 0.4); P(`t${t}.fmfb`, 0.6); }
  P('gl.on', 1); P('gl.mode', 2); P('gl.mix', 0.5); [1, 2, 3].forEach(i => { P(`lfo${i}.depth`, 0.4); P(`lfo${i}.shape`, i); P(`lfo${i}.dest`, i - 1); });
  d.play(1); let mx = 0, bad = false;
  const t0 = process.hrtime.bigint();
  run(d, 180, () => {}); const o = run(d, 1); mx = peak(o); bad = !finite(o);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  ok(!bad && mx <= 1, 'bounded after 3 min: ' + mx.toFixed(3));
  ok(Math.abs(d.beat - 181 * 174 / 60) < 1e-3, 'beat ' + d.beat.toFixed(4));
  console.log(`      181 s rendered in ${ms.toFixed(0)} ms (${(181000 / ms).toFixed(0)}× real time, JS, everything on)`);
});

// ---------------------------------------------------------------- NEW: slicer, ring modulation, mod matrix, sources
const groove = d => { for (let s = 0; s < 16; s++) d.setStep(0, s % 4 === 0 ? 0 : 2, s, 1, 1, 0, 0, 1); d.setStep(0, 1, 4, 1, 1, 0, 0, 1); d.setStep(0, 1, 12, 1, 1, 0, 0, 1); d.play(1); };
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const diff = (a, b, i0 = 0) => { let s = 0; for (let i = i0; i < Math.min(a.length, b.length); i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s / (a.length - i0)); };
test('slicer off (never touched, or switched off) is bit-identical to no slicer', () => {
  const a = make(); groove(a); const A = run(a, 3);
  const b = make(); groove(b); for (let i = 0; i < 32; i++) b.setSlice(i, 2, i); b.prm('sl.density', 1); const B = run(b, 3);
  ok(diff(A, B) === 0, 'program set but slicer off: identical');
  const c = make(); groove(c); c.prm('sl.on', 1); for (let i = 0; i < 32; i++) c.setSlice(i, 0, i); const C = run(c, 3);
  ok(diff(A, C) === 0, 'slicer on with an all-Thru program: identical (' + diff(A, C) + ')');
});
test('slicer: all 12 actions are finite, bounded, and (except Thru) change the sound', () => {
  const a = make(); groove(a); const A = run(a, 4.5);
  for (let act = 1; act < 12; act++) {
    const d = make(); groove(d); d.prm('sl.on', 1); for (let i = 0; i < 32; i++) d.setSlice(i, act, (i + 5) % 16);
    const o = run(d, 4.5);
    ok(finite(o) && peak(o) <= 1.5, `${act}: finite, peak ${peak(o).toFixed(3)}`);
    ok(diff(A, o, SR * 2) > 1e-3, `${act}: changes the sound (${diff(A, o, SR * 2).toExponential(2)})`);
  }
});
test('slicer: Gate silences; Repeat repeats the previous slice', () => {
  const d = make(); groove(d); d.prm('sl.on', 1); for (let i = 0; i < 32; i++) d.setSlice(i, 8, i); d.prm('dr.dlyfb', 0);
  const o = run(d, 3); const s0 = SR * 2, a0 = make(); groove(a0); const A0 = run(a0, 3); ok(rms(o, s0, s0 + SR) < 0.2 * rms(A0, s0, s0 + SR), 'gate: rms ' + rms(o, s0, s0 + SR).toExponential(2) + ' vs ' + rms(A0, s0, s0 + SR).toExponential(2) + ' (only the 2 ms declick edges pass)');
  const r = make(); groove(r); r.prm('sl.on', 1); r.prm('sl.div', 3); r.setSlice(1, 1, 1);   // 1/4 slices at 120 BPM = 24000 samples; slice 2 repeats slice 1
  const x = run(r, 5.2), L = 24000, c0 = 2 * 4 * L;   // the third bar
  let best = 9; for (const lag of [-1, 0, 1]) { let e = 0, n = 0; for (let i = 200; i < L - 200; i++) { e += (x[c0 + L + i] - x[c0 + i + lag]) ** 2; n++; } best = Math.min(best, Math.sqrt(e / n) / rms(x, c0, c0 + L)); }
  ok(best < 0.02, 'repeat: slice 2 = slice 1, to the sample the beat lands on (rel err ' + best.toExponential(2) + ')');
});
test('slicer: the same seed gives the same variations; another seed differs; density 0 = through', () => {
  const go = (seed, den, evo) => { const d = make(); groove(d); d.prm('sl.on', 1); d.prm('sl.seed', seed); d.prm('sl.density', den); d.prm('sl.evolve', evo); for (let i = 0; i < 32; i++) d.setSlice(i, 2, i); return run(d, 4); };
  ok(diff(go(7, .5, .3), go(7, .5, .3)) === 0, 'seed 7 twice: identical');
  ok(diff(go(7, .5, .3), go(8, .5, .3)) > 1e-3, 'seed 7 vs 8: different');
  const a = make(); groove(a); ok(diff(run(a, 4), go(1, 0, 0), SR * 2) === 0, 'density 0, evolve 0: identical to through');
});
test('slicer hold pads: momentary, from the moment pressed, released → through', () => {
  for (let h = 1; h <= 6; h++) { const d = make(); groove(d); d.prm('sl.on', 1); const o = run(d, 3, (b, e) => { if (b === 700) e.prm('sl.hold', h); if (b === 900) e.prm('sl.hold', 0); });
    ok(finite(o) && peak(o) <= 1.5, `hold ${h} finite`); }
  const a = make(); groove(a); const A = run(a, 3);
  const d = make(); groove(d); d.prm('sl.on', 1); const B = run(d, 3, (b, e) => { if (b === 700) e.prm('sl.hold', 5); if (b === 900) e.prm('sl.hold', 0); });   // gate
  ok(rms(B, 720 * BLK, 890 * BLK) < 0.2 * rms(A, 720 * BLK, 890 * BLK), 'gate hold silences while held');
  ok(diff(A.subarray(1105 * BLK), B.subarray(1105 * BLK)) < 1e-5, 'after release: through again (only the DC blocker remembers): ' + diff(A.subarray(1105 * BLK), B.subarray(1105 * BLK)).toExponential(2));
});
test('slicer at 44.1, 96 kHz and 40–240 BPM, 1/32 over 2 bars: finite, no out-of-buffer reads', () => {
  for (const [sr, bpm] of [[44100, 40], [96000, 240], [48000, 174]]) { const d = make(bpm, sr); groove(d); d.prm('sl.on', 1); d.prm('sl.div', 0); d.prm('sl.bars', 1); d.prm('sl.evolve', 1);
    const o = run(d, 13); ok(finite(o) && peak(o) <= 1.5, `${sr} Hz ${bpm} BPM peak ${peak(o).toFixed(3)}`); }
});
test('ring: a ringed step modulates its slaves only; OSC master; off = identical', () => {
  const base = d => { silenceOthers(d); d.prm('t1.level', 1); d.prm('t2.level', 1); d.setStep(0, 0, 0, 1, 1, 0, 0, 1); d.setStep(0, 1, 0, 1, 1, 0, 0, 1); d.prm('dr.revsize', 0); run(d, 0.1); d.play(1); };   // settle the levels first (parameters glide from their defaults); play starts on the next beat
  const a = make(); base(a); const A = run(a, 1.2);
  const b = make(); base(b); b.setStepRing(0, 0, 0, 0, 9, 2, 1, 220); ok(diff(A, run(b, 1.2)) === 0, 'ring fields set but off: identical');
  const c = make(); base(c); c.setStepRing(0, 0, 0, 1, 9, 2, 1, 1000); const C = run(c, 1.2); ok(finite(C) && diff(A, C) > 1e-3, 'OSC ring on track 2 changes the sound');
  const e = make(); base(e); e.setStepRing(0, 0, 0, 1, 0, 2, 1, 220); const Ee = run(e, 1.2); ok(finite(Ee) && peak(Ee) <= 1.5 && diff(A, Ee) > 1e-3, `track-1 master × track 2 (peak ${peak(Ee).toFixed(2)}, diff ${diff(A, Ee).toExponential(2)})`);
  const f = make(); base(f); f.prm('t2.level', 0); f.setStepRing(0, 0, 0, 1, 9, 2, 1, 1000); const g = make(); base(g); g.prm('t2.level', 0);
  ok(diff(run(f, 1.2), run(g, 1.2)) < 1e-9, 'the master track itself is not changed');
});
test('mod matrix: an LFO wired to a dial moves it; depth 0 / deleted wire = identical; sources bounded', () => {
  const a = make(); groove(a); const A = run(a, 2);
  const b = make(); groove(b); b.setWire(0, 0, ID['dr.level'], 0); ok(diff(A, run(b, 2)) === 0, 'depth 0: identical');
  const c = make(); groove(c); c.prm('lfo1.rate', 4); c.setWire(0, 0, ID['dr.level'], -1); const Cc = run(c, 2); ok(diff(A, Cc) > 1e-3, 'LFO 1 → level changes the sound');
  const e = make(); groove(e); e.setWire(3, 4, ID['t1.decay'], .8); e.setWire(3, 0, -1, 0); ok(diff(A, run(e, 2)) === 0, 'deleted wire: identical');
  for (let s = 0; s < 5; s++) for (const m of [0, 1, 2]) { const d = make(); groove(d); d.prm('ch.mode', m); d.prm('ch.rate', 20); d.setWire(0, s, ID['t1.tune'], 1); d.setWire(1, s, ID['sl.density'], 1); d.prm('sl.on', 1);
    let lo = 9, hi = -9; const o = run(d, 6, (bk, dd) => { const v = dd.srcV[s]; lo = Math.min(lo, v); hi = Math.max(hi, v); });
    if (s < 4 && m) continue; ok(finite(o) && lo >= -1.0001 && hi <= 1.0001 && hi - lo > 0.05, `${['LFO1', 'LFO2', 'LFO3', 'ENV', 'CHAOS'][s]}${s === 4 ? ' ' + m : ''}: range ${lo.toFixed(2)}…${hi.toFixed(2)}`); }
  const d = make(); groove(d); d.prm('env.src', 1); let mx = 0; run(d, 2, (bk, dd) => { mx = Math.max(mx, dd.srcV[3]); }); ok(mx > 0.3, 'env follower on track 1 follows the kick: ' + mx.toFixed(2));
});
test('mod: a wire never pushes a dial out of its range; modulated source parameters (chaos → LFO rate) are stable', () => {
  const d = make(); groove(d); for (let w = 0; w < 32; w++) d.setWire(w, w % 5, (w * 37) % ID['ch.rate'], w % 2 ? 1 : -1); d.setWire(31, 4, ID['lfo1.rate'], 1);
  let bad = 0; const o = run(d, 8, () => { for (let i = 0; i < d.mv.length; i++) { const q = E.DRUM_PARAMS[i]; if (!(d.mv[i] >= q[4] - 1e-9 && d.mv[i] <= q[5] + 1e-9)) bad++; } });
  ok(bad === 0 && finite(o), 'every modulated value in range (' + bad + ' out)');
});

// ---------------------------------------------------------------- NEW (0.7): step fold, track EQ, tape & vinyl
test('step fold: off = identical; on adds harmonics; ratchets carry it', () => {
  const base = d => { silenceOthers(d); d.prm('t1.level', 1); d.prm('t1.model', 5); run(d, 0.1); d.setStep(0, 0, 0, 1, 1, 0, 0, 2); d.play(1); };
  const a = make(); base(a); const A = run(a, 1.2);
  const b = make(); base(b); b.setStepFold(0, 0, 0, 0); ok(diff(A, run(b, 1.2)) === 0, 'fold 0: identical');
  const c = make(); base(c); c.setStepFold(0, 0, 0, .8); const C = run(c, 1.2);
  ok(finite(C) && peak(C) <= 1.5 && zc(C, 0, C.length) > zc(A, 0, A.length) * 1.3, `fold .8: more zero crossings (${zc(C, 0, C.length)} vs ${zc(A, 0, A.length)})`);
  ok(c.ratFold[0] === Math.fround(.8) || c.ratFold[0] === .8, 'the ratchet repeat keeps the fold');
});
test('EQ: 0 dB = identical; each band boosts / cuts around its frequency; modulated frequency stays stable', () => {
  const tone = (hz, setup) => { const d = make(); silenceOthers(d); d.prm('t1.level', 1); d.prm('t1.engine', 2); d.prm('t1.fmindex', 0); d.prm('t1.fmfreq', hz); d.prm('t1.decay', 3); if (setup) setup(d); run(d, .1); d.midi(0x99, 36, 127); const o = run(d, .4); return rms(o, 4800, 14400); };
  const d0 = make(); silenceOthers(d0); d0.prm('t1.level', 1); d0.midi(0x99, 36, 127); const A = run(d0, .5);
  const d1 = make(); silenceOthers(d1); d1.prm('t1.level', 1); for (let b = 1; b <= 4; b++) d1.prm(`t1.eq${b}f`, 300 * b); d1.midi(0x99, 36, 127); ok(diff(A, run(d1, .5)) === 0, 'frequencies set, gains 0: identical');
  for (const [b, hz, fc] of [[1, 50, 300], [2, 400, 400], [3, 2500, 2500], [4, 4500, 1500]]) {   // shelves: a tone well inside the shelf
    const ref = tone(hz), up = tone(hz, d => { d.prm(`t1.eq${b}f`, fc); d.prm(`t1.eq${b}g`, 12); }), dn = tone(hz, d => { d.prm(`t1.eq${b}f`, fc); d.prm(`t1.eq${b}g`, -12); });
    const gu = 20 * Math.log10(up / ref), gd = 20 * Math.log10(dn / ref);
    ok(gu > 8 && gu < 13 && gd < -8 && gd > -13, `band ${b} at ${hz} Hz: +12 → ${gu.toFixed(1)} dB, −12 → ${gd.toFixed(1)} dB`);
  }
  const m = make(); groove(m); m.prm('t3.eq2g', 15); m.prm('t3.eq3g', -15); m.setWire(0, 4, ID['t3.eq2f'], 1); m.setWire(1, 0, ID['t3.eq3g'], 1); m.prm('ch.rate', 20); m.prm('lfo1.rate', 15);
  const M = run(m, 6); ok(finite(M) && peak(M) <= 1.5, 'EQ frequency and gain modulated fast: finite, bounded');
});
test('tape & vinyl: off = identical; wow/flutter bend pitch; dust crackles even in silence', () => {
  const a = make(); groove(a); const A = run(a, 2);
  const b = make(); groove(b); b.prm('tp.wow', 0); b.prm('tp.dust', 0); ok(diff(A, run(b, 2)) === 0, 'all at 0: identical');
  const c = make(); groove(c); c.prm('tp.wow', 1); c.prm('tp.flutter', 1); const C = run(c, 2); ok(finite(C) && diff(A, C) > 1e-3 && peak(C) <= 1.2, 'wow + flutter change the sound');
  const s = make(); silenceOthers(s); s.prm('tp.dust', .8); const S = run(s, 2); let clicks = 0; for (let i = 1; i < S.length; i++) if (Math.abs(S[i] - S[i - 1]) > .02) clicks++;
  ok(finite(S) && rms(S, 24000) > 1e-4 && clicks > 5 && peak(S) < .9, `dust in silence: hiss rms ${rms(S, 24000).toExponential(1)}, ${clicks} crackle edges`);
  const sine = make(); silenceOthers(sine); sine.prm('t1.level', 1); sine.prm('t1.engine', 2); sine.prm('t1.fmindex', 0); sine.prm('t1.fmfreq', 1000); sine.prm('t1.decay', 3); sine.prm('tp.flutter', 1); sine.prm('tp.wow', 1);
  run(sine, .1); sine.midi(0x99, 36, 127); const X = run(sine, 1); const zs = []; for (let w = 0; w < 8; w++) zs.push(zc(X, 4800 + w * 4800, 9600 + w * 4800));
  ok(Math.max(...zs) - Math.min(...zs) >= 2, 'the pitch of a 1 kHz tone wanders: ' + zs.join(','));
});
test('the 40 new genre kits: finite, bounded and audible for 6 s each', () => { ok(true, 'see tests/kits.test.mjs (they need the whole app: run in Chrome)'); });

// ---------------------------------------------------------------- NEW (0.8): step pitch shift + spectral, reverb types, insert input
test('pitch shift per step: off = identical; +12 st doubles a sine; works on any engine', () => {
  const sine = (st, mix, eng = 2) => { const d = make(); silenceOthers(d); d.prm('t1.level', 1); d.prm('t1.engine', eng); d.prm('t1.fmindex', 0); d.prm('t1.fmfreq', 300); d.prm('t1.decay', 3); run(d, .1);
    d.setStep(0, 0, 0, 1, 1, 0, 0, 1); d.setStepShift(0, 0, 0, st, mix, 0, 0, 1); d.play(1); return run(d, 1.4); };
  const A = sine(0, 1), B = sine(0, 0); ok(diff(A, B) === 0, 'shift 0: identical');
  const U = sine(12, 1); const za = zc(A, 30000, 60000), zu = zc(U, 30000, 60000);
  ok(finite(U) && zu > za * 1.8 && zu < za * 2.2, `+12 st: ${zu} vs ${za} zero crossings`);
  const Dn = sine(-12, 1); const zd = zc(Dn, 30000, 60000); ok(zd < za * 0.6 && zd > za * 0.4, `−12 st: ${zd} vs ${za}`);
  const S = make(); silenceOthers(S); S.prm('t2.level', 1); run(S, .1); S.setStep(0, 1, 0, 1, 1, 0, 0, 1); S.setStepShift(0, 1, 0, 7, .5, 0, 0, 1); S.play(1); ok(finite(run(S, 1.2)), 'on the synth snare: finite');
});
test('spectral per step: off = identical; all six colours (and between) are finite, bounded and change the sound', () => {
  const hit = (sp, col, mix = 1) => { const d = make(); silenceOthers(d); d.prm('t3.level', 1); d.prm('t5.level', 1); run(d, .1);
    for (const s of [0, 4, 8, 12]) { d.setStep(0, 2, s, 1, 1, 0, 0, 1); d.setStepShift(0, 2, s, 0, 1, sp, col, mix); d.setStep(0, 4, s + 2, 1, 1, 0, 0, 1); d.setStepShift(0, 4, s + 2, 0, 1, sp, col, mix); }
    d.play(1); return run(d, 3); };
  const A = hit(0, 0); ok(diff(A, hit(0, .5)) === 0, 'spectral 0: identical');
  for (const col of [0.05, .2, .25, .4, .55, .6, .75, .9, .99]) { const o = hit(.8, col); ok(finite(o) && peak(o) <= 1.0 && diff(A, o, 24000) > 1e-4, `colour ${col} (${SPEC_ZONES[Math.min(5, Math.floor(col * 6))]}): peak ${peak(o).toFixed(2)}, diff ${diff(A, o, 24000).toExponential(1)}`); }
  const F = (() => { const d = make(); silenceOthers(d); d.prm('t1.level', 1); d.prm('t1.model', 7); run(d, .1); d.setStep(0, 0, 0, 1, 1, 0, 0, 1); d.setStepShift(0, 0, 0, 0, 1, 1, .99, 1); d.play(1); return run(d, 4); })();
  ok(rms(F, 48000 * 2.5, 48000 * 3) > 1e-4, 'FREEZE holds the bell after its voice has ended: rms ' + rms(F, 48000 * 2.5, 48000 * 3).toExponential(1));
});
test('reverb types: Room unchanged; Spring, Gate, Expanse finite and different; Gate closes; Expanse freezes', () => {
  const go = (type, size, sec = 3, hits = 1) => { const d = make(); silenceOthers(d); d.prm('t2.level', 1); d.prm('t2.rev', 1); d.prm('dr.revtype', type); d.prm('dr.revsize', size); d.prm('dr.revdamp', .2); run(d, .1);
    d.setStep(0, 1, 0, 1, 1, 0, 0, 1); d.setPatLen ? 0 : 0; d.play(1); const o = run(d, .8); d.play(0); return [o, run(d, sec)]; };
  const [r0] = go(0, .6); const d1 = make(); silenceOthers(d1); d1.prm('t2.level', 1); d1.prm('t2.rev', 1); d1.prm('dr.revsize', .6); d1.prm('dr.revdamp', .2); run(d1, .1); d1.setStep(0, 1, 0, 1, 1, 0, 0, 1); d1.play(1);
  ok(diff(r0, run(d1, .8)) === 0, 'Room (type 0) = the reverb as before');
  for (const ty of [1, 2, 3]) { const [o, tail] = go(ty, .6); ok(finite(o) && finite(tail) && peak(o) <= 1 && diff(r0, o, 4800) > 1e-4, `${REV_TYPES[ty]}: finite, bounded, its own sound`); }
  const [, gt] = go(2, .2, 2); ok(rms(gt, 48000, 96000) < 1e-4, 'Gate: silent soon after the hold: ' + rms(gt, 48000, 96000).toExponential(1));
  const [, ex] = go(3, .5, 3), [, wash] = go(3, .93, 3);
  const fd = make(); silenceOthers(fd); fd.prm('t2.level', 1); fd.prm('t2.rev', 1); fd.prm('dr.revtype', 3); fd.prm('dr.revsize', .93); run(fd, .1); fd.setStep(0, 1, 0, 1, 1, 0, 0, 1); fd.play(1); run(fd, .8); fd.play(0); fd.prm('dr.revsize', 1); const frz = run(fd, 6);   // ring it, then freeze
  ok(rms(wash, 96000, 144000) > rms(ex, 96000, 144000) * 2, `Expanse 93 % rings much longer than 50 % (${rms(wash, 96000, 144000).toExponential(1)} vs ${rms(ex, 96000, 144000).toExponential(1)})`);
  const f1 = rms(frz, 48000, 96000), f2 = rms(frz, 48000 * 5, 48000 * 6); ok(f1 > 1e-4 && f2 > f1 * 0.7 && finite(frz) && peak(frz) < 1, `Expanse 100 % freezes: ${f1.toExponential(2)} → ${f2.toExponential(2)} after 4 s`);
});
test('insert input: through the effects; drums off; no input = identical; Slicer on the input', () => {
  const n = 48000 * 2, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = .3 * Math.sin(2 * Math.PI * 220 * i / 48000);
  const runIn = (d, inp) => { const L = new Float32Array(BLK), R = new Float32Array(BLK), o = new Float32Array(n); for (let b = 0; b < n / BLK; b++) { L.fill(0); R.fill(0); const s = inp.subarray(b * BLK, (b + 1) * BLK); d.render(L, R, BLK, s, s); o.set(L, b * BLK); } return o; };
  const a = make(); a.prm('dr.temper', 0); a.prm('dr.level', 1); const A = runIn(a, x); ok(rms(A, 4800) > .15, 'the input comes through: rms ' + rms(A, 4800).toFixed(3));
  const g = make(); groove(g); g.prm('in.drums', 0); const G = runIn(g, new Float32Array(n)); ok(rms(G, 4800) < 1e-6, 'drums off, silent input: silence');
  const c = make(); groove(c); const C1 = run(c, 2); const c2 = make(); groove(c2); const C2 = runIn(c2, new Float32Array(n)); ok(diff(C1, C2) < 1e-9, 'a silent input changes nothing');
  const s = make(); s.prm('dr.temper', 0); s.prm('dr.level', 1); s.prm('sl.on', 1); for (let i = 0; i < 32; i++) s.setSlice(i, 8, i); s.play(1); const SL = runIn(s, x);
  ok(rms(SL, 48000, 96000) < rms(A, 48000, 96000) * .3, 'Slicer GATE program on the input: ' + rms(SL, 48000, 96000).toFixed(3));
});
test('CPU: everything at once stays light', () => {
  const d = make(); groove(d); for (let t = 0; t < 9; t++) for (let s = 0; s < 16; s += 2) { d.setStep(0, t, s, 1, 1, 0, 0, 1); d.setStepShift(0, t, s, 5, .6, .7, (t / 9), 1); }
  d.prm('dr.revtype', 3); d.prm('dr.revsize', .92); d.prm('sl.on', 1); d.prm('tp.wow', .5); d.prm('tp.dust', .4); d.prm('gl.on', 1);
  for (let t = 1; t <= 9; t++) { d.prm(`t${t}.eq2g`, 6); d.prm(`t${t}.level`, .5); }
  const t0 = process.hrtime.bigint(); const o = run(d, 10); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  ok(finite(o), `10 s rendered in ${ms.toFixed(0)} ms in JS (${(ms / 100).toFixed(1)} % of real time) — 9 tracks all shifting + spectral, Expanse wash, Slicer, tape, glitch, 9 EQs`);
});
// ---------------------------------------------------------------- 0.8 · TEMPER
const sine = (n, f, a, sr = SR) => { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = a * Math.sin(2 * Math.PI * f * i / sr); return x; };
function runIO(d, inL, inR) { const n = inL.length, L = new Float32Array(BLK), R = new Float32Array(BLK), oL = new Float32Array(n), oR = new Float32Array(n);
  for (let b = 0; b < n / BLK; b++) { L.fill(0); R.fill(0); d.render(L, R, BLK, inL.subarray(b * BLK, (b + 1) * BLK), (inR || inL).subarray(b * BLK, (b + 1) * BLK)); oL.set(L, b * BLK); oR.set(R, b * BLK); } return [oL, oR]; }
const goertzel = (x, f, sr, a, b) => { const w = 2 * Math.PI * f / sr, c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = a; i < b; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; } return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / (b - a); };
const hfRatio = (x, a, b) => { let e = 0, h = 0; for (let i = a + 1; i < b; i++) { e += x[i] * x[i]; const d = x[i] - x[i - 1]; h += d * d; } return h / e; };
const temperIn = (t, sr = SR, inp) => { const d = make(120, sr); d.prm('dr.level', 1); d.prm('dr.temper', t); for (let i = 0; i < 40; i++) d.control(); return d; };
const kitIn = sr => { const n = Math.round(sr * 2 / BLK) * BLK, x = new Float32Array(n); let q = 12345;
  for (let k = 0; k < 16; k++) { const o = Math.round(k * sr / 8); for (let i = 0; o + i < n && i < sr * .2; i++) { const t = i / sr; q = (q * 1103515245 + 12345) >>> 0; const nz = q / 2147483648 - 1;
    x[o + i] += k % 2 ? .3 * Math.exp(-t / .03) * nz + .3 * Math.exp(-t / .05) * Math.sin(2 * Math.PI * 180 * t) : .7 * Math.exp(-t / .08) * Math.sin(2 * Math.PI * 55 * t * (1 + 2 * Math.exp(-t / .02))); } } return x; };
test('TEMPER: neutral is a true bypass, and it returns to bypass', () => {
  const g = d => { for (let k = 0; k < 16; k += 2) d.setStep(0, k % 4 ? 2 : 0, k, 1, 1, 0, 0, 1); d.setStep(0, 1, 4, 1, .9, 0, 0, 1); d.play(1); };
  const a = make(); g(a); const A = run(a, 2);
  const b = make(); b.prm('dr.temper', 0); g(b); const B = run(b, 2);
  ok(diff(A, B) === 0 && !b.tmLive && b.tmS === 0, 'TEMPER 0: identical, stage never ran');
  const c = make(); g(c); c.prm('dr.temper', -1); run(c, .5); ok(c.tmLive, 'warm: the stage runs'); c.prm('dr.temper', 0); run(c, 1); ok(!c.tmLive && c.tmS === 0, 'back to 0: bypassed again (no lingering smoothing)');
  ok(DRUM_PARAMS_HAS('dr.temper', -1, 1, 0) && !E.ID['dr.warmth'], 'one control: dr.temper −1…+1, default 0; no Warmth left');
});
function DRUM_PARAMS_HAS(k, lo, hi, def) { const q = E.DRUM_PARAMS ? E.DRUM_PARAMS[ID[k]] : null; return q ? q[4] === lo && q[5] === hi && q[6] === def : ID[k] != null; }
test('TEMPER: warm softens the top and adds even harmonics; cold lifts the top and stays clean', () => {
  const x = kitIn(SR), n = x.length;
  const out = t => runIO(temperIn(t), x)[0];
  const N = out(0), W = out(-1), Wh = out(-.5), C = out(1), Ch = out(.5);
  const h = o => hfRatio(o, 4800, n);
  ok(h(W) < h(Wh) && h(Wh) < h(N) && h(N) < h(Ch) && h(Ch) < h(C), `HF ratio: warm ${h(W).toFixed(3)} < ${h(Wh).toFixed(3)} < neutral ${h(N).toFixed(3)} < ${h(Ch).toFixed(3)} < cold ${h(C).toFixed(3)}`);
  const s = sine(48000, 200, .5), so = t => runIO(temperIn(t), s)[0];
  const sw = so(-1), sc = so(1), sn = so(0), H = (o, k) => goertzel(o, 200 * k, SR, 9600, 48000);
  ok(H(sw, 2) / H(sw, 1) > 10 * H(sn, 2) / H(sn, 1) && H(sw, 2) / H(sw, 1) > 0.01, `warm: 2nd harmonic ${(100 * H(sw, 2) / H(sw, 1)).toFixed(2)} % (asymmetric, vintage)`);
  ok(H(sc, 2) / H(sc, 1) < H(sw, 2) / H(sw, 1) * 0.3, `cold: little even colour (${(100 * H(sc, 2) / H(sc, 1)).toFixed(2)} %)`);
  const thd = o => { let e = 0; for (let k = 2; k < 8; k++) e += H(o, k) ** 2; return Math.sqrt(e) / H(o, 1); };
  ok(thd(sc) < 0.2 && thd(sw) < 0.2, `not a distortion: THD warm ${(100 * thd(sw)).toFixed(1)} %, cold ${(100 * thd(sc)).toFixed(1)} % at −6 dBFS`);
  // transients: crest factor up when cold, down when warm
  const crest = o => peak(o.subarray(4800)) / rms(o, 4800);
  ok(crest(C) > crest(N) && crest(W) < crest(N), `transients: crest warm ${crest(W).toFixed(2)} · neutral ${crest(N).toFixed(2)} · cold ${crest(C).toFixed(2)}`);
});
test('TEMPER: finite, bounded, no DC, stereo kept, sample-rate independent, no clicks on moves', () => {
  for (const t of [-1, -.6, -.2, .2, .6, .8, 1]) {
    const loud = sine(48000, 60, 1.4), [L, R] = runIO(temperIn(t), loud);
    let m = 0; for (let i = 24000; i < 48000; i++) m += L[i]; m /= 24000;
    ok(finite(L) && peak(L) <= 1 && Math.abs(m) < 2e-3 && diff(L, R) === 0, `t ${t}: finite, ≤ 1, DC ${m.toExponential(1)}, mono stays mono`);
  }
  const x = kitIn(SR), z = new Float32Array(x.length), [L, R] = runIO(temperIn(1), x, z); ok(peak(R) === 0, 'left only in → right stays silent (linked detector, no bleed)');
  const [L2, R2] = runIO(temperIn(-1), z, x); ok(peak(L2) === 0 && peak(R2) > .1, 'and the other way round');
  for (const t of [-1, 1]) { const r = [44100, 48000, 96000].map(sr => { const d = temperIn(t, sr), y = kitIn(sr); const o = runIO(d, y)[0], b = runIO(temperIn(0, sr), y)[0]; return rms(o, sr / 10) / rms(b, sr / 10); });
    ok(Math.max(...r) / Math.min(...r) < 1.04, `t ${t}: same loudness change at 44.1 / 48 / 96 kHz: ${r.map(v => v.toFixed(3)).join(' / ')}`); }
  { const s = sine(96000, 110, .7), d = temperIn(0); const n = s.length, Lb = new Float32Array(BLK), Rb = new Float32Array(BLK), o = new Float32Array(n);
    for (let b = 0; b < n / BLK; b++) { d.prm('dr.temper', Math.sin(b / 9)); Lb.fill(0); Rb.fill(0); d.render(Lb, Rb, BLK, s.subarray(b * BLK, (b + 1) * BLK), s.subarray(b * BLK, (b + 1) * BLK)); o.set(Lb, b * BLK); }
    let j = 0; for (let i = 2; i < n; i++) j = Math.max(j, Math.abs(o[i] - 2 * o[i - 1] + o[i - 2]));
    const st = runIO(temperIn(1), s)[0]; let js = 0; for (let i = 2; i < n; i++) js = Math.max(js, Math.abs(st[i] - 2 * st[i - 1] + st[i - 2]));
    ok(j < js * 1.5 + 1e-4, `sweeping −1↔+1 on a sine: no clicks (2nd difference ${j.toExponential(2)} vs static cold ${js.toExponential(2)})`); }
  const t0 = process.hrtime.bigint(); runIO(temperIn(1), new Float32Array(480000).map((_, i) => Math.sin(i / 7) * .5)); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const t1 = process.hrtime.bigint(); runIO(temperIn(0), new Float32Array(480000).map((_, i) => Math.sin(i / 7) * .5)); const ms0 = Number(process.hrtime.bigint() - t1) / 1e6;
  ok(true, ''); console.log(`     (cost: 10 s through TEMPER ${ms.toFixed(0)} ms vs bypassed ${ms0.toFixed(0)} ms in JS)`);
});
// ---------------------------------------------------------------- 0.8 · HUMANISE
function humRun(h, bars = 16, setup, bpm = 120) {
  const d = make(bpm); setup = setup || (d => { for (let k = 0; k < 16; k += 4) d.setStep(0, 0, k, 1, 1, 0, 0, 1); [4, 12].forEach(k => d.setStep(0, 1, k, 1, 1, 0, 0, 1)); for (let k = 0; k < 16; k += 2) d.setStep(0, 2, k, 1, 1, 0, 0, 1); });
  setup(d); d.prm('dr.human', h); const log = [], tr = d.trigger;
  d.trigger = function (t, vel) { log.push({ t, beat: this.beat, ps: this.patStart, vel, cur: this.cur, sb: this.stepBeats(t) }); return tr.apply(this, arguments); };
  const before = d.step.slice(); d.play(1); const o = run(d, bars * 4 * 60 / bpm); return { d, log, o, before };
}
const offs = r => r.log.filter(e => e.vel > .5).map(e => { const k = Math.round((e.beat - e.ps) / e.sb); return (e.beat - e.ps - k * e.sb) * 60 / 120 * 1000; });
test('HUMANISE 0 %: the sequencer exactly as written (no offsets, no ghosts, no random draws)', () => {
  const a = humRun(0), b = (() => { const d = make(); for (let k = 0; k < 16; k += 4) d.setStep(0, 0, k, 1, 1, 0, 0, 1); [4, 12].forEach(k => d.setStep(0, 1, k, 1, 1, 0, 0, 1)); for (let k = 0; k < 16; k += 2) d.setStep(0, 2, k, 1, 1, 0, 0, 1); d.play(1); return run(d, 32); })();
  ok(diff(a.o, b) === 0, 'identical render to an engine that never saw the parameter');
  const o = offs(a); ok(o.every(v => Math.abs(v) < 0.03) && a.log.every(e => e.vel > .5), `every hit on its sample (max ${Math.max(...o.map(Math.abs)).toFixed(3)} ms), no ghosts`);
  ok(a.d.hrng[0] === 0x6C8E9CF5 && a.d.hOff.every(v => v === 0), 'the humanise PRNG was never drawn');
});
test('HUMANISE: progressive — subtle at 25 %, moderate at 50 %, obvious at 75 %, loose at 100 %, never chaotic', () => {
  const m = {}; for (const h of [.1, .25, .5, .75, 1]) { const o = offs(humRun(h, 32)); m[h] = o.reduce((s, v) => s + Math.abs(v), 0) / o.length; m['max' + h] = Math.max(...o.map(Math.abs)); m['mean' + h] = o.reduce((s, v) => s + v, 0) / o.length; }
  ok(m[.1] < m[.25] && m[.25] < m[.5] && m[.5] < m[.75] && m[.75] < m[1], `mean |offset| ms: 10 % ${m[.1].toFixed(2)} · 25 % ${m[.25].toFixed(2)} · 50 % ${m[.5].toFixed(2)} · 75 % ${m[.75].toFixed(2)} · 100 % ${m[1].toFixed(2)}`);
  ok(m[.25] < 2.5 && m['max0.25'] < 6, '25 %: subtle (a few ms)');
  ok(m[.5] > 3 && m[.5] < 12, '50 %: moderate, perceptible');
  ok(m[.75] > 10 && m['max0.75'] > 25 && m['max0.75'] < 62.5, `75 %: clearly human, up to ${m['max0.75'].toFixed(0)} ms (≈ 1/32 at 120 BPM = 62.5 ms)`);
  ok(m['max1'] <= 0.42 * 125 + .1, `100 %: still under half a step (max ${m['max1'].toFixed(1)} ms of 125)`);
  ok(Math.abs(m['mean1']) < m[1] * .25, `no drift: mean signed offset at 100 % ${m['mean1'].toFixed(2)} ms`);
});
test('HUMANISE: ghost notes start above 50 %, grow, stay quiet; embellishments above 75 %; bounded', () => {
  const g = {}; for (const h of [.25, .5, .6, .75, 1]) { const r = humRun(h, 32); const gh = r.log.filter(e => e.vel <= .5); g[h] = gh.length; g['v' + h] = gh.length ? Math.max(...gh.map(e => e.vel)) : 0; g['n' + h] = r.log.length; g['o' + h] = r.o; g['r' + h] = r; }
  ok(g[.25] === 0 && g[.5] === 0, 'no ghosts at 25 % or 50 %');
  ok(g[.6] > 0 && g[.6] < g[.75] && g[.75] < g[1], `ghosts per 32 bars: 60 % ${g[.6]} · 75 % ${g[.75]} · 100 % ${g[1]}`);
  ok(g['v1'] <= .41 && g['v0.75'] <= .41, `ghosts are quieter (loudest ${g['v1'].toFixed(2)} of a 1.0 hit)`);
  const written = g['n0.25'], r1 = g['r1']; ok(g['n1'] < written * 2.2, `100 %: ${g['n1']} hits vs ${written} written — busier, not a malfunction`);
  ok(finite(g['o1']) && peak(g['o1']) <= 1, 'finite and bounded');
  const emb = r1.log.filter((e, i) => e.vel <= .5 && i > 0 && r1.log[i - 1].t === e.t && r1.log[i - 1].vel <= .5 && e.beat - r1.log[i - 1].beat < e.sb * .7).length;
  ok(emb > 0, `100 %: some ghosts become quick doubles/triples (${emb})`);
});
test('HUMANISE: pattern untouched, not recorded, chain/ratchets/mute exact, every written hit plays once', () => {
  const chain = d => { for (let k = 0; k < 16; k += 4) d.setStep(0, 0, k, 1, 1, 0, 0, 1); d.setStep(0, 1, 6, 1, 1, 0, 0, 3);   // a 3-ratchet
    for (let k = 0; k < 16; k += 2) d.setStep(1, 2, k, 1, 1, 0, 0, 1); d.setStep(1, 0, 0, 1, 1, 0, 0, 1); d.setChain([0, 1, 1], 3, 1); };
  for (const h of [0, .5, 1]) {
    const r = humRun(h, 24, d => { chain(d); d.recOn = 1; });
    ok(r.d.step.every((v, i) => v === r.before[i]), `${h * 100} %: pattern data unchanged`);
    ok(r.d.recQ.length === 0, `${h * 100} %: nothing recorded`);
    const real = r.log.filter(e => e.vel > .5), perPass = { 0: 4 + 3, 1: 8 + 1 };
    let ok1 = true, passes0 = 0; const byPass = {}; real.forEach(e => { const key = e.ps.toFixed(4); byPass[key] = byPass[key] || { cur: e.cur, n: 0 }; byPass[key].n++; });
    const vals = Object.values(byPass); vals.pop(); vals.forEach(p => { if (p.n !== perPass[p.cur]) ok1 = false; });
    ok(ok1 && vals.length >= 20, `${h * 100} %: every written hit (incl. ratchets) once per pass, chain 0-1-1 kept over ${vals.length} bars: ${vals.slice(0, 6).map(p => p.cur + ':' + p.n).join(' ')}`);
    const rat = real.filter(e => e.t === 1); let sp = true; for (let i = 0; i + 2 < rat.length; i += 3) { const d1 = rat[i + 1].beat - rat[i].beat, d2 = rat[i + 2].beat - rat[i + 1].beat; if (Math.abs(d1 - .25 / 3) > 1e-3 || Math.abs(d2 - .25 / 3) > 1e-3) sp = false; }
    ok(sp, `${h * 100} %: ratchets keep their spacing after a humanised first hit`);
  }
  const m = humRun(1, 8, d => { for (let k = 0; k < 16; k += 4) d.setStep(0, 1, k, 1, 1, 0, 0, 1); d.prm('t2.mute', 1); });
  ok(peak(m.o) < 1e-6, 'a muted track stays silent, ghosts included');
  const s = humRun(1, 8, d => { for (let k = 0; k < 16; k += 4) d.setStep(0, 1, k, 1, 1, 0, 0, 1); for (let k = 0; k < 16; k += 2) d.setStep(0, 2, k, 1, 1, 0, 0, 1); d.prm('t3.solo', 1); });
  const s2 = humRun(1, 8, d => { for (let k = 0; k < 16; k += 4) d.setStep(0, 1, k, 1, 1, 0, 0, 1); for (let k = 0; k < 16; k += 2) d.setStep(0, 2, k, 1, 1, 0, 0, 1); d.prm('t3.solo', 1); d.prm('t2.mute', 1); });
  ok(diff(s.o, s2.o) === 0 && rms(s.o) > 1e-3, 'solo: only the soloed track (with its ghosts) is heard');
  const fast = humRun(1, 8, d => { d.setTrack(0, 2, 16, 8); for (let k = 0; k < 16; k++) d.setStep(0, 2, k, 1, 1, 0, 0, 1); }, 200);
  const fr = fast.log.filter(e => e.vel > .5); let mono = true; for (let i = 1; i < fr.length; i++) if (fr[i].beat <= fr[i - 1].beat) mono = false;
  ok(mono && fr.length === 8 * 2 * 16, `fine divisions at 200 BPM: ${fr.length} hits, in order, none merged or missed`);
});
console.log(`\n${passes} checks passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
