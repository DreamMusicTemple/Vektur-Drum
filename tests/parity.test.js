// Vektur Drum — parity: with the new features left at their defaults, the Vektur Drum engine must render what the
// extracted Vektur Pulse engine renders, sample for sample, for everything Vektur Pulse can do.
//   node tests/parity.test.js reference/web/index.html web/dist/index.html
'use strict';
const { loadEngine } = require('./load-engine');
const A = loadEngine(process.argv[2] || 'reference/web/index.html'), B = loadEngine(process.argv[3] || 'web/dist/index.html');
const SR = 48000, BLK = 128;
let fails = 0;

function scene(E, setup, seconds, sr = SR) {
  const d = new E.Drums(sr); d.enabledFlag = 1; d.tempo = 124;
  // 0.8: master Warmth became TEMPER (bipolar, neutral by default). The rest of the engine is compared with both at
  // neutral (Pulse Warmth 0, Drum TEMPER 0); the Warmth scene itself is compared against TEMPER's warm side below.
  const P = (k, v) => { if (E.ID[k] == null && k === 'dr.warmth') { k = 'dr.temper'; v = -v; } d.setParam(E.ID[k], v); };
  if (E.ID['dr.warmth'] != null) { P('dr.warmth', 0); d.sm[E.ID['dr.warmth']] = 0; }
  setup(d, P);
  const n = Math.ceil(seconds * sr / BLK), L = new Float32Array(BLK), R = new Float32Array(BLK), out = new Float32Array(n * BLK * 2);
  for (let b = 0; b < n; b++) { L.fill(0); R.fill(0); d.render(L, R, BLK); for (let i = 0; i < BLK; i++) { out[(b * BLK + i) * 2] = L[i]; out[(b * BLK + i) * 2 + 1] = R[i]; } }
  return out;
}
function compare(name, setup, seconds, sr, near) {
  const a = scene(A, setup, seconds, sr), b = scene(B, setup, seconds, sr);
  let max = 0, first = -1, ea = 0, ed = 0;
  for (let i = 0; i < a.length; i++) { const e = Math.abs(a[i] - b[i]); ea += a[i] * a[i]; ed += e * e; if (e > max) max = e; if (e > 0 && first < 0) first = i >> 1; }
  if (near) {   // close, not identical: residual energy relative to the Pulse render
    const rel = Math.sqrt(ed / Math.max(ea, 1e-12)), ok = rel < near; if (!ok) fails++;
    console.log(`${ok ? 'ok   ' : 'FAIL '}${name.padEnd(58)} residual ${(100 * rel).toFixed(1)} % (< ${100 * near} %)`); return;
  }
  const ok = max === 0;
  if (!ok) fails++;
  console.log(`${ok ? 'ok   ' : 'FAIL '}${name.padEnd(58)} ${ok ? 'identical' : `max diff ${max.toExponential(2)} from sample ${first}`}`);
}
const groove = (d) => {
  for (let k = 0; k < 16; k += 4) d.setStep(0, 0, k, 1, 0.95, 0, 0, 1);
  [4, 12].forEach(k => d.setStep(0, 1, k, 1, 0.85, 0.1, -2, 1));
  for (let k = 0; k < 16; k += 2) d.setStep(0, 2, k, 1, k % 4 ? 0.45 : 0.7, 0, 0, k === 14 ? 3 : 1);
  d.setStep(0, 4, 13, 1, 0.6, -0.3, 0, 2); d.setStep(0, 5, 10, 1, 0.7, 0, 5, 1); d.setStep(0, 5, 11, 1, 0.7, 0, 3, 1);
};

compare('default kit, groove, 8 s', (d) => { groove(d); d.play(1); }, 8);
compare('every model on every track, tuned, bent, wobbling', (d, P) => {
  for (let t = 1; t <= 6; t++) { P(`t${t}.model`, (t * 3) % 8); P(`t${t}.tune`, t * 3 - 9); P(`t${t}.bend`, t - 3); P(`t${t}.brate`, t * 1.7); P(`t${t}.tone`, t / 7); P(`t${t}.snap`, 1 - t / 7); }
  groove(d); d.play(1);
}, 6);
compare('swing, polymeter, divisions, bars, chain', (d, P) => {
  P('dr.swing', 0.4); groove(d); d.setTrack(0, 2, 5, 6); d.setTrack(0, 4, 7, 2); d.setBars(0, 2);
  d.setStep(1, 0, 0, 1, 1, 0, 0, 4); d.setChain([0, 1, 0], 3, 1); d.play(1);
}, 10);
compare('step fx: crush, sends, chance, ratchets', (d, P) => {
  groove(d); for (let k = 0; k < 16; k++) d.setStepFx(0, 2, k, (k % 5) / 5, (k % 3) / 3, (k % 4) / 4, k % 2 ? 0.5 : 1);
  P('dr.dlyfb', 0.7); P('dr.dlypp', 0); P('dr.revsize', 0.9); P('dr.revdamp', 0.1); d.play(1);
}, 8);
compare('bits, rate reduction, level, mute, solo', (d, P) => {
  groove(d); P('t1.bits', 6); P('t2.rate', 4000); P('t3.bits', 10); P('t3.rate', 11025); P('dr.level', 1); P('t5.mute', 1); d.play(1);
}, 5);
compare('Warmth 1 (Pulse) ≈ TEMPER −1 (warm: same colour + softer top)', (d, P) => {
  groove(d); P('t1.bits', 6); P('dr.warmth', 1); P('dr.level', 1); d.play(1);
}, 5, SR, 0.25);
compare('Warmth 0.25 (old default) ≈ TEMPER −0.25', (d, P) => { groove(d); P('dr.warmth', 0.25); d.play(1); }, 4, SR, 0.08);
compare('solo', (d, P) => { groove(d); P('t2.solo', 1); P('t3.solo', 1); d.play(1); }, 4);
compare('MIDI pads on channel 10 + live REC', (d) => {
  groove(d); d.recOn = 1; d.play(1);
  const orig = d.render.bind(d); let n = 0;
  d.render = (L, R, f) => { if (++n % 37 === 0) d.midi(0x99, [36, 38, 42, 39, 45][n % 5], 40 + (n % 80)); orig(L, R, f); };
}, 6);
compare('closed hat chokes open hat (Pulse hat choke = group A)', (d, P) => {
  P('t4.decay', 2.5); for (let k = 0; k < 16; k += 4) d.setStep(0, 3, k, 1, 1, 0, 0, 1); for (let k = 2; k < 16; k += 4) d.setStep(0, 2, k, 1, 1, 0, 0, 1); d.play(1);
}, 4);
compare('parameter automation while playing (smoothing)', (d, P) => {
  groove(d); d.play(1); const orig = d.render.bind(d); let n = 0;
  d.render = (L, R, f) => { n++; P('t1.tune', 12 * Math.sin(n / 40)); P('t3.tone', 0.5 + 0.5 * Math.sin(n / 13)); P('dr.swing', 0.3 + 0.3 * Math.sin(n / 90)); orig(L, R, f); };
}, 6);
compare('44.1 kHz', (d) => { groove(d); d.play(1); }, 4, 44100);
compare('96 kHz, every Rate below 48 kHz (unchanged by the fix)', (d, P) => { groove(d); for (let t = 1; t <= 6; t++) P(`t${t}.rate`, 20000 + t * 4000); P('t3.bits', 12); d.play(1); }, 3, 96000);
{ // the intended fix: at 96 kHz, Rate at its top no longer holds every voice to 48 kHz
  const held = E => { const d = new E.Drums(96000); d.enabledFlag = 1; d.control(); d.trigger(2, 1, 0, 0, 0, 0, 0, 0); let h = 0, prev = null; for (let k = 0; k < 2000; k++) { const y = d.voiceTick(2); if (prev !== null && y === prev) h++; prev = y; } return h; };
  const a = held(A), b = held(B), ok = a > 900 && b === 0; if (!ok) fails++;
  console.log(`${ok ? 'ok   ' : 'FAIL '}${'96 kHz, Rate at top: held samples per 2000 (Pulse → Drum)'.padEnd(58)} ${a} → ${b}`);
}

console.log(fails ? `\n${fails} scene(s) differ` : '\nall scenes identical to Vektur Pulse');
console.log('Intended differences, not tested here: an open-hat hit now also chokes a ringing closed hat (choke groups are');
console.log('mutual); a sample plays only on the Sample engine; at 96 kHz, Rate at its top no longer halves the sample rate;');
console.log('Warmth is now the warm side of TEMPER (compared as near, above).');
process.exit(fails ? 1 : 0);
