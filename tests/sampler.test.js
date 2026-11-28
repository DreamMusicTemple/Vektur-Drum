// Vektur Drum 0.9 — vintage sampler DSP (METALISE, RESAMPLE), slices, transient detection, stretch, per-pattern
// Slicer, 12 tracks.   node tests/sampler.test.js   (after python3 tools/build_web.py)
'use strict';
const fs = require('fs'), path = require('path');
const { loadEngine } = require('./load-engine.js');
const page = path.join(__dirname, '../web/dist/index.html');
const { Drums, ID, DRUM_NOTES } = loadEngine(page);
const SX = new Function('drumState', 'drumVal', 'S', fs.readFileSync(path.join(__dirname, '../web/src/slices.js'), 'utf8') +
  '\nreturn { sxDetect, sxClassify, sxClassifyAll, sxBpm, sxStretch, sxPrepare, sxMakeSlices, sxRedetect, drumSxDef, drumSxClean, drumSxOut, drumSliceDef, SLF_N };')(() => ({}), () => 0, { bpm: 0 });
const SR = 48000, BLK = 128;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } else console.log('ok  ', m); };
const make = (bpm = 120) => { const d = new Drums(SR); d.enabledFlag = 1; d.tempo = bpm; d.prm = (k, v) => d.setParam(ID[k], v); for (let t = 1; t <= 12; t++) d.prm(`t${t}.level`, t === 1 ? 1 : 0); return d; };
function run(d, sec, each) { const n = Math.ceil(sec * SR / BLK), L = new Float32Array(BLK), R = new Float32Array(BLK), o = new Float32Array(n * BLK);
  for (let b = 0; b < n; b++) { L.fill(0); R.fill(0); d.render(L, R, BLK); o.set(L, b * BLK); if (each) each(b, d); } return o; }
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const diff = (a, b) => { let m = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
const resid = (a, b) => { let s = 0, e = 0; for (let i = 0; i < a.length; i++) { s += b[i] * b[i]; e += (a[i] - b[i]) ** 2; } return Math.sqrt(e / Math.max(s, 1e-12)); };
const finite = x => x.every(Number.isFinite), peak = x => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const maxJump = x => { let m = 0; for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1])); return m; };
// a groove on track 1 (snare model, rich in highs)
const groove = (d, model = 1) => { d.prm('t1.model', model); d.prm('t1.decay', .4); for (let s = 0; s < 16; s += 2) d.setStep(0, 0, s, 1, 1, 0, 0, 1); d.play(1); };

// ---- a synthetic break: kick / snare / hat / ghost at known places, 2 bars at 170 BPM
function breakLoop(bpm = 170, rate = SR) {   // (every hit 180 ms long, at most 1.5 beats a bar apart)
  const beat = 60 / bpm * rate, n = Math.round(8 * beat), d = new Float32Array(n), hits = [];
  let q = 12345; const rnd = () => { q = (q * 1103515245 + 12345) >>> 0; return q / 4294967296 * 2 - 1; };
  const put = (p, cls) => { p = Math.round(p); hits.push({ p, cls });
    for (let i = 0; i < Math.round(0.18 * rate) && p + i < n; i++) { const t = i / rate; let x = 0;
      if (cls === 0) x = Math.sin(2 * Math.PI * (55 + 120 * Math.exp(-t * 40)) * t) * Math.exp(-t * 18) * .9;
      else if (cls === 1) x = (rnd() * .6 + Math.sin(2 * Math.PI * 190 * t) * .4) * Math.exp(-t * 22) * .8;
      else if (cls === 2) { x = rnd(); x = (x - (d._h || 0)) * Math.exp(-t * 70) * .35; d._h = x; }
      else x = (rnd() * .6 + Math.sin(2 * Math.PI * 190 * t) * .4) * Math.exp(-t * 30) * .12;
      d[p + i] += x; } };
  [0, 2.5, 4, 6.5].forEach(b => put(b * beat, 0)); [1, 3, 5, 7].forEach(b => put(b * beat, 1));
  [0.5, 1.5, 3.5, 4.5, 5.5].forEach(b => put(b * beat, 2)); [2.25, 3.75, 7.25].forEach(b => put(b * beat, 3));
  hits.sort((a, b) => a.p - b.p); return { d, hits, rate };
}

console.log('— METALISE —');
{ const a = make(); groove(a); const A = run(a, 1.5);
  const b = make(); groove(b); b.prm('t1.metal', 0); const B = run(b, 1.5);
  ok(diff(A, B) === 0, 'METALISE 0: the original signal path, sample for sample');
  const r = [.25, .5, .75, 1].map(v => { const d = make(); groove(d); d.prm('t1.metal', v); const o = run(d, 1.5); return { o, e: resid(o, A) }; });
  ok(r.every(x => finite(x.o) && peak(x.o) < 1.2), 'finite and bounded at every amount (peak ' + Math.max(...r.map(x => peak(x.o))).toFixed(3) + ')');
  ok(r[0].e < r[1].e && r[1].e < r[2].e && r[2].e < r[3].e, 'progressive from low to high: residual ' + r.map(x => x.e.toFixed(3)).join(' < '));
  // a pure 3 kHz tone through it: aliasing / quantisation / HF products appear (not a plain gain)
  const d = make(); d.prm('t1.engine', 1); const n = SR, s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = .5 * Math.sin(2 * Math.PI * 3000 * i / SR);
  d.setSample(0, s, SR); d.prm('t1.decay', 3); d.prm('t1.metal', 1); d.prm('t1.tone', 1); d.midi(0x99, 36, 127); const o = run(d, .5);
  let best = 0; for (const g of [.2, .4, .6, .8, 1, 1.2]) { let e = 0, t = 0; for (let i = 4800; i < 20000; i++) { const ref = s[i] * g; e += (o[i] - ref) ** 2; t += o[i] ** 2; } best = Math.max(best, e / t); }
  ok(best > 0.02, 'a sine comes out with new partials (aliasing, quantisation, resonance): non-sine energy ' + (best * 100).toFixed(1) + '%');
}
{ // per-step Metalise: only the chosen steps change, and without clicks
  const a = make(); groove(a); const A = run(a, 1);
  const b = make(); groove(b); b.setStepMetal(0, 0, 4, 1, 0, 0, 0); const B = run(b, 1);
  const st = Math.round(4 * 0.125 * SR);   // step 5 at 120 BPM, 1/16
  ok(diff(A.subarray(0, st - 64), B.subarray(0, st - 64)) === 0, 'per-step METALISE: steps before it untouched');
  ok(resid(B.subarray(st, st + 6000), A.subarray(st, st + 6000)) > 0.05, 'per-step METALISE: its step is processed (' + resid(B.subarray(st, st + 6000), A.subarray(st, st + 6000)).toFixed(3) + ')');
  ok(maxJump(B) < maxJump(A) * 1.6 + 0.05, 'click-free: largest sample-to-sample jump ' + maxJump(B).toFixed(3) + ' vs dry ' + maxJump(A).toFixed(3));
}
{ const a = make(); groove(a); a.prm('gl.on', 1); a.prm('gl.mode', 2); const A = run(a, 1.5);
  const b = make(); groove(b); b.prm('gl.on', 1); b.prm('gl.mode', 2); b.prm('gl.metal', .8); const B = run(b, 1.5);
  ok(resid(B, A) > 0.02 && finite(B), 'Metalise character (master) colours the metal-stretch output');
}

console.log('— RESAMPLE —');
{ const a = make(); groove(a); const A = run(a, 1.5);
  const z = make(); groove(z); z.prm('t1.rsmp', 0); ok(diff(run(z, 1.5), A) === 0, 'RESAMPLE 0 %: unaffected, sample for sample');
  const a0 = make(); groove(a0, 0); const A0 = run(a0, 1.5);   // a kick: the converter's distortion, not just its filtering
  const r = [.25, .5, .75, 1].map(v => { const d = make(); groove(d, 0); d.prm('t1.rsmp', v); d.prm('t1.rsmode', 2); const o = run(d, 1.5); return { o, e: resid(o, A0) }; });
  ok(r.every(x => finite(x.o) && peak(x.o) < 1.5), 'finite and bounded at 25 / 50 / 75 / 100 %');
  ok(r[0].e < r[1].e && r[1].e < r[3].e, 'progressive: ' + r.map(x => x.e.toFixed(3)).join(', '));
  const models = [0, 1, 2, 3, 4, 5].map(m => { const d = make(); groove(d); d.prm('t1.rsmp', .6); d.prm('t1.smodel', m); return run(d, 1); });
  let distinct = true; for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) if (diff(models[i], models[j]) < 1e-3) distinct = false;
  ok(distinct, 'six sampler models, each its own sound');
  const modes = [0, 1, 2, 3].map(m => { const d = make(); groove(d); d.prm('t1.rsmp', .8); d.prm('t1.rsmode', m); d.prm('t1.smodel', 5); return run(d, 1); });
  let md = true; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (diff(modes[i], modes[j]) < 1e-3) md = false;
  ok(md, 'transient modes PRESERVE / ROUND / CRUSH / REBUILD all differ');
  const att = o => resid(o.subarray(0, 240), A.subarray(0, 240));   // the first 5 ms of the first hit
  ok(att(modes[0]) < att(modes[2]), `PRESERVE keeps the attack closer to dry than CRUSH (${att(modes[0]).toFixed(3)} < ${att(modes[2]).toFixed(3)})`);
  ok(att(modes[3]) < att(modes[2]), `REBUILD lets the attack through (${att(modes[3]).toFixed(3)})`);
  const d = make(); groove(d); d.prm('t1.rsmp', 1); const o = run(d, 1.5, (b, e) => { if (b % 40 === 0) e.prm('t1.rsmp', (b / 40) % 2 ? 1 : 0.3); });
  ok(finite(o) && maxJump(o) < 1.0, 'RESAMPLE automated while playing: finite, no jumps (' + maxJump(o).toFixed(3) + ')');
}

console.log('— slices —');
const bk = breakLoop();
{ const det = SX.sxDetect(bk.d, SR, .5, 50), tol = 0.006 * SR;
  const hit = bk.hits.filter(h => det.some(p => Math.abs(p - h.p) < tol)).length, extra = det.filter(p => !bk.hits.some(h => Math.abs(p - h.p) < tol)).length;
  ok(hit >= bk.hits.length - 2 && extra <= 1, `transients: ${hit}/${bk.hits.length} found within 6 ms, ${extra} extra`);
  const lo = SX.sxDetect(bk.d, SR, .05, 50).length, hi = SX.sxDetect(bk.d, SR, .95, 50).length;
  ok(lo <= det.length && det.length <= hi, `sensitivity: ${lo} ≤ ${det.length} ≤ ${hi}`);
  ok(SX.sxDetect(bk.d, SR, .5, 400).length < det.length, 'minimum spacing drops close marks');
  const loud = Math.max(...bk.hits.map(h => { let m = 0; for (let i = h.p; i < h.p + 2880; i++) m = Math.max(m, Math.abs(bk.d[i])); return m; }));
  const cl = SX.sxClassifyAll(bk.d, SR, bk.hits.map(h => h.p)), right = bk.hits.filter((h, i) => cl[i] === h.cls).length;
  ok(right >= bk.hits.length - 2, `kick / snare / hat / ghost suggested: ${right}/${bk.hits.length} right`);
  const bpm = SX.sxBpm(bk.d, SR); ok(Math.abs(bpm - 170) < 1, 'BPM detection: ' + bpm);
}
{ const sx = SX.drumSxDef(), m = { d: bk.d, rate: SR };
  SX.sxRedetect(sx, m); const nAuto = sx.marks.length;
  sx.marks.push({ p: 1000, m: 1, on: 1, c: 4 }); sx.marks.sort((a, b) => a.p - b.p); sx.marks[sx.marks.length - 1].on = 0;
  SX.sxRedetect(sx, m); ok(sx.marks.some(k => k.p === 1000 && k.m), 're-detect keeps the marks you placed');
  SX.sxMakeSlices(sx, m); ok(sx.slices.length >= nAuto - 1 && sx.slices.length <= nAuto + 1, 'transient slices: ' + sx.slices.length);
  sx.slices[2].p = 5; sx.slices[2].r = 1; sx.slices[2].stut = 3; const s2 = sx.slices[2].s;
  SX.sxMakeSlices(sx, m); ok(sx.slices.find(v => v.s === s2).p === 5 && sx.slices.find(v => v.s === s2).r === 1, 'settings stay with their slice when re-sliced');
  sx.mode = 1; sx.div = 8; SX.sxMakeSlices(sx, m); ok(sx.slices.length === 8, 'equal: 8 slices');
  sx.mode = 2; SX.sxMakeSlices(sx, m); ok(sx.slices.length === 8, 'beat: 8 slices (2 bars at the detected tempo)');
  sx.mode = 3; SX.sxMakeSlices(sx, m); ok(sx.slices.length === 2, 'bar: 2 slices');
  sx.mode = 4; sx.grid = 2; SX.sxMakeSlices(sx, m); ok(sx.slices.length === 32, 'grid 1/16: 32 slices');
  sx.mode = 4; sx.grid = 4; SX.sxMakeSlices(sx, m); ok(sx.slices.length === 24, 'grid 1/8T: 24 slices');
  const back = SX.drumSxClean(JSON.parse(JSON.stringify(SX.drumSxOut(sx))));
  ok(JSON.stringify(back) === JSON.stringify(SX.drumSxClean(sx)), 'saved and opened: identical slices and marks');
  ok(JSON.stringify(SX.drumSxClean({ marks: [[-5], 'x', null], slices: [{ s: 'a', e: -1, p: 99, g: 'q' }], bpm: 9999 })) !== undefined, 'junk data cleans without errors');
}
{ const x = bk.d.subarray(0, Math.round(0.4 * SR));
  for (const f of [0.5, 0.8, 1.25, 2]) { const y = SX.sxStretch(x, f, SR); const A = Math.round(0.012 * SR);
    ok(Math.abs(y.length - Math.round(x.length * f)) <= 1 && finite(y) && diff(y.subarray(0, A), x.subarray(0, A)) === 0, `stretch × ${f}: length ${y.length}, attack (12 ms) kept exactly`); }
}
{ // the engine plays slices
  const sx = SX.drumSxDef(), m = { d: bk.d, rate: SR }; SX.sxRedetect(sx, m); SX.sxMakeSlices(sx, m);
  const pr = SX.sxPrepare(m, sx, { tsmode: 0, stretch: 1, tune: 0, bpm: 120 });
  const play = (k, set) => { const d = make(); d.prm('t1.engine', 1); d.prm('t1.decay', 3); d.prm('t1.tone', 1); const tab = pr.table.slice(); if (set) set(tab); d.setSample(0, pr.d, SR, tab); d.prm('t1.slice', k); run(d, 0.05); d.midi(0x99, 36, 127); return run(d, 0.3); };   // let the dials settle first
  const k = 3, o = SX.SLF_N * (k - 1), s0 = pr.table[o], len = pr.table[o + 1], out = play(k);
  const corr = (x, f, n) => { let xy = 0, xx = 0, yy = 0; for (let i = 200; i < n; i++) { const y = f(i); xy += x[i] * y; xx += x[i] * x[i]; yy += y * y; } return xy / Math.sqrt(xx * yy + 1e-30); };
  const n1 = Math.min(len, 6000), cf = corr(out, i => pr.d[s0 + i], n1);
  ok(cf > 0.97, `Slice ${k} plays its own part of the break (correlation ${cf.toFixed(4)})`);
  const rv = play(k, tab => { tab[o + 7] = 1; }), cr = corr(rv, i => pr.d[s0 + len - 1 - i], Math.min(len, 4000));
  ok(cr > 0.97, 'a reversed slice plays backwards (correlation ' + cr.toFixed(4) + ')');
  const gt = play(k, tab => { tab[o + 6] = 0.25; }), g1 = rms(gt, Math.round(len * .3), len), g0 = rms(out, Math.round(len * .3), len);
  ok(g1 < 0.05 * g0 && rms(gt, 0, Math.round(len * .2)) > 1e-3, `Gate 25 %: silent after a quarter of the slice (${g1.toExponential(1)} vs ${g0.toExponential(1)})`);
  const pt = play(k, tab => { tab[o + 2] = 12; }); ok(rms(pt, Math.round(len * .55), len) < rms(out, Math.round(len * .55), len) * 0.5, 'Pitch +12: an octave up, half as long');
  const su = play(k, tab => { tab[o + 8] = 2; tab[o + 9] = 0.01; }), cs = corr(su.subarray(480), i => su[i], 430);
  ok(cs > 0.97, 'stutter: the first 10 ms repeats (correlation ' + cs.toFixed(4) + ')');
  ok(finite(su) && maxJump(su) <= maxJump(out) * 1.5 + 0.02, 'stutter edges without clicks');
  // per-step slice + chance
  const d = make(); d.prm('t1.engine', 1); d.prm('t1.decay', 3); d.setSample(0, pr.d, SR, pr.table); d.setStep(0, 0, 0, 1, 1, 0, 0, 1); d.setStepMetal(0, 0, 0, -1, 5, 0, 0); d.play(1);
  let used = -1; run(d, .02, () => { if (d.v[0].active) used = d.v[0].sl; }); ok(used === 4, 'a step plays the slice it names (slice 5)');
  const c0 = make(); c0.prm('t1.engine', 1); c0.setSample(0, pr.d, SR, pr.table); for (let s = 0; s < 16; s++) { c0.setStep(0, 0, s, 1, 1, 0, 0, 1); c0.setStepMetal(0, 0, s, -1, 2, 1, 0); } c0.play(1);
  let revs = 0, n = 0; run(c0, 2, () => { if (c0.v[0].active && c0.v[0].sl === 1) { n++; if (c0.v[0].sRev) revs++; } }); ok(n > 0 && revs === n, 'reverse chance 100 %: every hit reversed');
  const c1 = make(); c1.prm('t1.engine', 1); c1.setSample(0, pr.d, SR, pr.table); for (let s = 0; s < 16; s++) c1.setStep(0, 0, s, 1, 1, 0, 0, 1); c1.play(1); const before = c1.brng[0]; run(c1, 2); ok(c1.brng[0] === before, 'chance 0: no random draws (the rest of the groove is untouched)');
  // Break Lab pads with REC: the slice lands in the step
  const r = make(); r.prm('t1.engine', 1); r.setSample(0, pr.d, SR, pr.table); r.recOn = 1; r.play(1); run(r, .3); r.hitSlice(0, 7, 1); run(r, .05);
  const q = r.recQ.find(x => x[1] === 0); ok(q && q[4] === 7 && r.step[((0 * 12 + 0) * 16 + q[2]) * 25 + 22] === 7, 'live slice pads record their slice into the pattern');
  // tempo lock: prepared length follows master tempo
  sx.bpm = 170; const p2 = SX.sxPrepare(m, sx, { tsmode: 2, stretch: 1, tune: 0, bpm: 85 });
  ok(Math.abs(p2.d.length / bk.d.length - 2) < 0.01, 'TEMPO LOCK: the 170 BPM break at 85 BPM is twice as long (' + (p2.d.length / bk.d.length).toFixed(3) + ')');
  const p3 = SX.sxPrepare(m, sx, { tsmode: 1, stretch: 1, tune: 7, bpm: 120 });
  ok(Math.abs(p3.d.length / bk.d.length - Math.pow(2, 7 / 12)) < 0.01, 'STRETCH: tuned +7 st, the playback keeps its length (buffer × 2^(7/12))');
}

console.log('— spec checks: pads, rapid triggering, per-slice Metalise, breaks at other tempos, MIDI —');
{ const d = make(); for (let t = 0; t < 12; t++) d.prm(`t${t + 1}.level`, .6); for (let t = 0; t < 12; t++) d.midi(0x99, DRUM_NOTES[t], 100);
  run(d, .01); ok(Array.from(d.hits).every(h => h === 1), 'all 12 pads trigger at once: ' + Array.from(d.hits).join(','));
  const e = make(); e.prm('t2.level', 1); const o = run(e, 1.2, (b, x) => { if (b % 2 === 0 && b < 400) x.midi(0x99, DRUM_NOTES[1], 60 + (b % 60)); });
  ok(finite(o) && e.hits[1] === 200 && peak(o) < 1.2, `rapid pad hits: 200 hits 5 ms apart, all played, finite, peak ${peak(o).toFixed(2)}`); }
{ const sx = SX.drumSxDef(), m = { d: bk.d, rate: SR }; SX.sxRedetect(sx, m); SX.sxMakeSlices(sx, m);
  const pr = SX.sxPrepare(m, sx, { tsmode: 0, stretch: 1, tune: 0, bpm: 120 });
  const go = mt => { const d = make(); d.prm('t1.engine', 1); d.prm('t1.decay', 3); const tab = pr.table.slice(); tab[SX.SLF_N * 2 + 10] = mt; d.setSample(0, pr.d, SR, tab); d.setStep(0, 0, 0, 1, 1, 0, 0, 1); d.setStepMetal(0, 0, 0, -1, 3, 0, 0); d.setStep(0, 0, 8, 1, 1, 0, 0, 1); d.setStepMetal(0, 0, 8, -1, 4, 0, 0); d.play(1); return run(d, 1); };
  const A = go(-1), B = go(.9), half = Math.round(SR * .5);
  ok(resid(B.subarray(0, half - 2000), A.subarray(0, half - 2000)) > .05 && diff(B.subarray(half + 3000), A.subarray(half + 3000)) < 1e-6, 'per-slice METALISE: slice 3 processed, slice 4 (after the 2 ms glide and its tail) untouched'); }
for (const [bpm, rate] of [[87, 44100], [136, 48000], [174, 96000]]) { const b2 = breakLoop(bpm, rate), det = SX.sxDetect(b2.d, rate, .5, 50), tol = .006 * rate;
  const hit = b2.hits.filter(h => det.some(p => Math.abs(p - h.p) < tol)).length; const got = SX.sxBpm(b2.d, rate, 0);
  ok(hit >= b2.hits.length - 2 && (Math.abs(got - bpm) < 1 || Math.abs(got - 2 * bpm) < 1 || Math.abs(got * 2 - bpm) < 1), `a break at ${bpm} BPM, ${rate} Hz: ${hit}/${b2.hits.length} transients, tempo ${got}`); }
{ const d = make(); d.prm('t1.level', 1); d.prm('t1.model', 0); for (let t = 9; t < 12; t++) d.prm(`t${t + 1}.level`, .5);
  d.hostBeat = 3.999; d.beatSerial++; for (let k = 0; k < 16; k += 4) d.setStep(0, 0, k, 1, 1, 0, 0, 1); d.play(1); const o = run(d, 2.1);
  let first = -1; for (let i = 0; i < o.length; i++) if (Math.abs(o[i]) > 1e-4) { first = i; break; }
  ok(first >= 0 && first < 64, 'host sync: a play request near a beat starts on that beat (first sound at sample ' + first + ')');
  const f = make(); for (const n of [50, 51, 54]) f.midi(0x99, n, 100); ok(f.hits[9] === 1 && f.hits[10] === 1 && f.hits[11] === 1, 'MIDI notes 50, 51, 54 play tracks 10–12'); }

console.log('— 0.9.1: classes in a real-sounding break, long sounds, drawn LFOs, Metalise automation —');
function amen(bpm, rate, seed){ let q=seed; const rnd=()=>{q=(q*1103515245+12345)>>>0;return q/4294967296*2-1;};
 const beat=60/bpm*rate,n=Math.round(8*beat),d=new Float32Array(n),hits=[];
 // ride: continuous metallic noise, every 8th note re-struck
 let hp=0,hp2=0;
 const put=(p0,c,g)=>{const p=Math.round(p0);hits.push({p,c});let a=0,b=0,lp=0;for(let i=0;i<Math.round(.35*rate)&&p+i<n;i++){const t=i/rate;let x=0;
  if(c===0){x=Math.sin(2*Math.PI*(50+90*Math.exp(-t*30))*t)*Math.exp(-t*9)*.85+(i<200?rnd()*.4*Math.exp(-i/40):0);}
  else if(c===1||c===3){const nz=rnd();lp+=(nz-lp)*.35;x=(lp*.9+Math.sin(2*Math.PI*185*t)*.5+Math.sin(2*Math.PI*330*t)*.25)*Math.exp(-t*14);}
  else{const r=rnd();a+=(r-a)*.9;x=(r-a)*Math.exp(-t*25)*1.4;}
  d[p+i]+=x*g;}};
 for(let b=0;b<2;b++){const o=b*4*beat;
  put(o,0,1);put(o+.5*beat,0,.95);put(o+1*beat,1,1);put(o+1.75*beat,3,.3);put(o+2.25*beat,1,.35);put(o+2.5*beat,0,1);put(o+3*beat,1,1);put(o+3.75*beat,3,.32);
  for(let k=0;k<8;k++){const pos=o+k*beat/2; if(![0,.5,1,2.5,3].some(x=>Math.abs(o+x*beat-pos)<1))put(pos,2,.45);}}
 // continuous ride wash
 for(let i=0;i<n;i++){const r=rnd();hp+= (r-hp)*.85;const x=r-hp;hp2+=(x-hp2)*.3;d[i]+=(x-hp2)*.06;}
 hits.sort((a,b)=>a.p-b.p);return {d,hits};}

for (const [bpm, seed] of [[136, 3], [170, 9], [160, 21]]) { const { d, hits } = amen(bpm, 44100, seed), det = SX.sxDetect(d, 44100, .5, 30), cls = SX.sxClassifyAll(d, 44100, det), tol = .008 * 44100;
  let right = 0, tot = 0; hits.forEach(h => { const i = det.findIndex(p => Math.abs(p - h.p) < tol); if (i < 0) return; tot++; if (cls[i] === h.c || (h.c === 1 && cls[i] === 3) || (h.c === 3 && cls[i] === 1)) right++; });
  const n = k => cls.filter(c => c === k).length;
  ok(tot >= hits.length - 4 && right >= tot - 1 && n(0) >= 4 && n(2) >= 3, `a break with a ride over it at ${bpm} BPM: ${right}/${tot} right (kick ${n(0)}, snare ${n(1)}, hat ${n(2)}, ghost ${n(3)}) — not all snares`); }
{ const run1 = lng => { const d = make(); d.prm('t1.model', 0); d.prm('t1.decay', 3); d.prm('t1.long', lng); run(d, .05); d.midi(0x99, 36, 127); return run(d, 8); };
  const a = run1(0), b = run1(1); ok(rms(a, 6 * SR, 8 * SR) < 1e-5 && rms(b, 6 * SR, 8 * SR) > 1e-3, `LONG: a 3 s decay becomes 60 s (at 6–8 s: ${rms(a, 6 * SR, 8 * SR).toExponential(1)} → ${rms(b, 6 * SR, 8 * SR).toExponential(1)})`);
  const c = make(); groove(c); const C = run(c, 1); const e2 = make(); groove(e2); e2.prm('t1.long', 0); ok(diff(run(e2, 1), C) === 0, 'LONG off: nothing changes'); }
{ const d = make(); d.prm('lfo1.shape', 5); d.setLfoPoints(0, [1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1]); d.prm('lfo1.rate', 1); const vs = []; run(d, 1, () => vs.push(d.srcV[0]));
  ok(vs.some(v => v > .99) && vs.some(v => v < -.99) && vs.every(v => v >= -1 && v <= 1), 'LFO DRAW: the drawn points are what the LFO plays'); }
{ const base = () => { const d = make(); groove(d); d.prm('gl.mode', 2); d.prm('gl.mix', .8); return d; };
  const a = base(); const A = run(a, 2);
  const b = base(); b.setWire(0, 0, ID['gl.on'], 1); b.prm('lfo1.rate', 2); let ons = 0, offs = 0; const B = run(b, 2, () => { if (b.cGlOn) ons++; else offs++; });
  ok(ons > 50 && offs > 50 && diff(A, B) > 1e-3, `an LFO wired to the Metalise switch turns it on and off (${ons} on, ${offs} off)`);
  const c = base(); c.prm('gl.on', 1); c.prm('gl.chance', .5); c.prm('gl.chdiv', 0); let on2 = 0, off2 = 0; run(c, 4, () => { if (c.cGlOn) on2++; else off2++; });
  ok(on2 > 100 && off2 > 100, `Metalise CHANCE 50 % per 1/16: on ${on2}, off ${off2} control blocks`);
  const z = base(); z.prm('gl.on', 1); const Z = run(z, 2); const y = base(); y.prm('gl.on', 1); y.prm('gl.chance', 0); ok(diff(run(y, 2), Z) === 0, 'CHANCE 0: Metalise as before (no random draws)'); }

console.log('— patterns, tracks —');
{ const a = make(); groove(a); a.prm('sl.on', 1); for (let i = 0; i < 32; i++) a.setSlice(i, 8, i); const A = run(a, 1.5);
  const b = make(); groove(b); b.prm('sl.on', 1); for (let i = 0; i < 32; i++) b.setSlice(i, 8, i); b.setPatternSlicer(0, 0); const B = run(b, 1.5);
  const c = make(); groove(c); const C = run(c, 1.5);
  ok(diff(B, C) < 1e-6 && diff(A, C) > 1e-3, 'a pattern with its Slicer OFF plays dry while SLICER is on');
  const e = make(); groove(e); for (let i = 0; i < 32; i++) e.setSlice(i, 8, i); e.setPatternSlicer(0, 1); ok(diff(run(e, 1.5), A) < 1e-6, 'a pattern with its Slicer ON slices while SLICER is off');
}
{ const d = make(); ok(DRUM_NOTES.length === 12 && d.trackOf(DRUM_NOTES[11]) === 11, '12 tracks, 12 MIDI notes');
  d.setStepRing(0, 0, 0, 1, 11, (1 << 12) - 1, 1, 220); const i = ((0 * 12 + 0) * 16 + 0) * 25; ok(d.step[i + 11] === 11 && d.step[i + 12] === 4095, 'ring: master track 12, all 12 tracks as slaves');
  d.setStepRing(0, 0, 1, 1, 99, 0, 1, 220); ok(d.step[i + 25 + 11] === 12, 'ring: 12 = the oscillator');
  for (let t = 0; t < 12; t++) d.prm(`t${t + 1}.level`, .5); for (let t = 0; t < 12; t++) { d.prm(`t${t + 1}.metal`, .5); d.prm(`t${t + 1}.rsmp`, .5); d.setStep(0, t, t, 1, 1, 0, 0, 1); }
  d.play(1); const t0 = Date.now(); const o = run(d, 10); const ms = Date.now() - t0;
  ok(finite(o), `12 tracks with METALISE + RESAMPLE on every one: finite (10 s in ${ms} ms, ${(10000 / ms).toFixed(1)}× real time in JS)`);
}
console.log(`\n${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
