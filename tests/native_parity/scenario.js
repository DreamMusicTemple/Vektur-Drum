// Writes events.txt: one scripted performance that exercises every part of Vektur Drum's engine.
// Lines: '<frame> <op> …' (P key value · S p t s on vel pan pitch rat crush dly rev prob fmr · K p t len div · B p bars ·
// C on n pats… · Y p · Z on · R on · N tracks · E on · T bpm · H beat · M st d1 d2 · W t len hz dec rate ·
// NEW: S … ring master mask amt hz (ring step) · X slot src key amt (wire; key '-' = empty) · L slot action source (slicer)); last 'END <frames>'.
'use strict';
const STRICT = process.argv.includes('--strict');   // strict: no FM feedback (the one chaotic ingredient) → must match exactly
const fs = require('fs'), path = require('path');
const SR = 48000; let t = 0; const ev = [];
const e = (...a) => ev.push([t, ...a]);
const wait = s => { t += Math.round(s * SR); };
const P = (k, v) => e('P', k, v);
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const X09 = o => o.mt != null || o.sl || o.rv || o.su;   // NEW 0.9: … Metalise (−1 = track), slice, reverse chance, stutter chance
const step = (p, tr, s, o = {}) => e('S', p, tr, s, 1, o.vel ?? 0.8, o.pan ?? 0, o.pitch ?? 0, o.rat ?? 1, o.crush ?? 0, o.dly ?? 0, o.rev ?? 0, o.prob ?? 1, o.fmr ?? 0,
  ...(o.ring ? [1, o.ring[0], o.ring[1], o.ring[2], o.ring[3]] : (o.fold || o.sh || o.spec || X09(o)) ? [0, 12, 0, 1, 220] : []), ...((o.fold || o.sh || o.spec || X09(o)) ? [o.fold || 0] : []),
  ...((o.sh || o.spec || X09(o)) ? [o.sh || 0, o.shMix ?? 1, o.spec || 0, o.col || 0, o.spMix ?? 1] : []),   // NEW 0.8: … shift st, mix, spectral, colour, mix
  ...(X09(o) ? [o.mt ?? -1, o.sl || 0, o.rv || 0, o.su || 0] : []));
const groove = (p = 0) => { for (let k = 0; k < 16; k += 4) step(p, 0, k, { vel: .95 }); [4, 12].forEach(k => step(p, 1, k, { vel: .85 }));
  for (let k = 0; k < 16; k += 2) step(p, 2, k, { vel: k % 4 ? .45 : .7, rat: k === 14 ? 3 : 1 }); step(p, 3, 14, { vel: .6 }); step(p, 4, 12, { pan: -.3 }); step(p, 5, 10, { pitch: 5 }); };

e('E', 1); e('T', 124); groove(); e('Z', 1); wait(6);                                         // 1 · Pulse defaults
for (let tr = 1; tr <= 6; tr++) { P(`t${tr}.model`, (tr * 3) % 8); P(`t${tr}.tune`, tr * 3 - 9); P(`t${tr}.bend`, tr - 3); P(`t${tr}.brate`, tr * 1.7); P(`t${tr}.bits`, 6 + tr); P(`t${tr}.rate`, 4000 * tr); }
P('dr.swing', .35); P('dr.temper', -.8); e('K', 0, 2, 5, 6); e('K', 0, 4, 7, 2); wait(5);   // 2 · models, crush, rate, swing, polymeter
for (let k = 0; k < 16; k++) step(0, 2, k, { vel: .6, crush: (k % 5) / 5, dly: (k % 3) / 3, rev: (k % 4) / 4, prob: k % 2 ? .5 : 1 });
P('dr.dlyfb', .7); P('dr.dlypp', 0); P('dr.revsize', .9); wait(5);                           // 3 · step fx, delay, reverb
e('B', 1, 2); groove(1); step(1, 0, 0, { rat: 4 }); e('C', 1, 3, 0, 1, 0); wait(8);           // 4 · bars, chain
e('R', 1); for (let i = 0; i < 24; i++) { e('M', 0x99, [36, 38, 42, 39, 45, 37, 56, 49, 50, 51, 54][i % 11], 40 + (i * 13) % 80); wait(.13); } e('R', 0);   // 5 · MIDI + REC on 12 tracks
for (let tr = 1; tr <= 9; tr++) { P(`t${tr}.engine`, 2); P(`t${tr}.fmalgo`, tr % 4); P(`t${tr}.fmfreq`, 40 + tr * 90); P(`t${tr}.fmratio`, .5 + tr * .77);
  P(`t${tr}.fmratio2`, 3.3 - tr * .2); P(`t${tr}.fmindex`, tr * 1.8); P(`t${tr}.fmidec`, .02 * tr); P(`t${tr}.fmfb`, STRICT ? 0 : (tr % 3) / 2); P(`t${tr}.fmfold`, (tr % 4) / 3); P(`t${tr}.fmnoise`, (tr % 2) * .4); P(`t${tr}.sweep`, (tr - 5) * 6); P(`t${tr}.swtime`, .01 * tr); }
for (let tr = 6; tr < 9; tr++) for (let k = 0; k < 16; k += 3) step(0, tr, k, { fmr: k % 2 ? 0 : 1 + k * .37, vel: .7 });
e('C', 0, 0); e('Y', 0); wait(8);                                                             // 6 · FM everywhere, sweeps, per-step ratios
P('t1.choke', 2); P('t2.choke', 2); P('t3.choke', 1); P('t4.choke', 1); P('t4.decay', 2.5); wait(3);   // 7 · choke groups
P('t1.engine', 1); e('W', 0, 30000, 220, .3, 44100); P('t2.engine', 1); e('W', 1, 9000, 900, .05, 48000); P('t3.engine', 1); wait(4);   // 8 · samples (track 3: none → silent)
P('t1.decay', 3); P('t1.tone', .3); wait(3); e('W', 0, 0, 0, 0, 0); wait(2);                  // full-length sample, tone; removed
for (let m = 0; m < 3; m++) {                                                                 // 9 · glitch, all modes, LFOs
  P('gl.on', 1); P('gl.mode', m); P('gl.mix', .8); P('gl.size', .2 + m * .2); P('gl.speed', .3 + m * .2);
  [1, 2, 3].forEach(i => { P(`lfo${i}.depth`, (i - 2) * .4 + .1); P(`lfo${i}.shape`, (i + m) % 5); P(`lfo${i}.dest`, (i + m) % 3); P(`lfo${i}.sync`, (i + m) % 2); P(`lfo${i}.div`, (i * 2 + m) % 7); P(`lfo${i}.rate`, .3 * i + m); });
  wait(6);
}
P('gl.on', 0); wait(2);
e('N', 7); wait(3); e('N', 12);                                                                // 10 · track count
e('T', 171); wait(3); e('H', 3.3); wait(2); e('T', 90); e('H', 400.0); wait(3);              // 11 · tempo + host relocation
for (let i = 0; i < 40; i++) { P(`t${1 + (i % 12)}.tune`, rnd() * 24 - 12); P('gl.mix', rnd()); wait(.05); }   // 12 · automation
// 13 · NEW: modulation sources and wires, ring steps, the Slicer
e('Y', 0); P('t1.engine', 0); P('t2.engine', 0); P('t3.engine', 0); P('t2.level', .9); P('t3.level', .8);
step(0, 0, 0, { vel: .95, ring: [12, 0b110, 1, 700] }); step(0, 0, 8, { vel: .9, ring: [1, 0b100, .7, 220] }); step(0, 1, 4, { ring: [0, 0b1100, .8, 220] });
e('X', 0, 0, 't1.tune', .4); e('X', 1, 3, 'dr.dlyfb', -.6); e('X', 2, 4, 't3.decay', .7); e('X', 3, 1, 'lfo1.rate', .5); e('X', 4, 4, 'sl.density', -.3);
P('lfo1.rate', 3); P('lfo2.rate', .7); P('env.src', 0); P('env.att', .002); P('env.gain', 4); P('ch.mode', 0); P('ch.rate', 2); wait(4);
P('ch.mode', 1); P('ch.rate', 9); wait(2); P('ch.mode', 2); P('ch.rate', 15); wait(2); e('X', 3, 0, '-', 0); P('env.src', 2); wait(2);
const acts = [0, 1, 2, 3, 9, 4, 5, 6, 7, 8, 10, 11, 1, 2, 9, 3];
for (let i = 0; i < 32; i++) e('L', i, acts[i % 16], (i * 7 + 3) % 16);
P('sl.on', 1); P('sl.mix', .9); P('sl.div', 1); P('sl.density', .8); P('sl.evolve', .25); P('sl.seed', 17); wait(6);
P('sl.div', 0); P('sl.bars', 1); P('sl.stutter', 4); P('sl.pitch', 7); P('sl.speed', 1.6); P('sl.tape', .5); wait(6);
P('sl.div', 3); P('sl.bars', 0); P('sl.pitch', -19); P('sl.speed', .4); wait(4);
for (let h = 1; h <= 6; h++) { P('sl.hold', h); wait(.3); P('sl.hold', 0); wait(.2); }
e('X', 5, 2, 'sl.mix', -1); P('lfo3.sync', 1); P('lfo3.div', 4); wait(3);
e('T', 160); wait(3); P('sl.on', 0); wait(1);
// 14 · NEW: step fold (with ratchets), per-track EQ (static and modulated), tape wow / flutter and vinyl dust
e('Z', 1); step(0, 0, 4, { fold: .7, rat: 3 }); step(0, 2, 6, { fold: .35 }); step(0, 1, 12, { fold: 1, ring: [12, 0b100, .5, 330] });
P('t1.eq1g', 6); P('t1.eq1f', 70); P('t2.eq2g', -9); P('t2.eq2f', 900); P('t3.eq3g', 12); P('t3.eq4g', -15); P('t3.eq4f', 6000); wait(3);
e('X', 6, 0, 't3.eq3f', .6); e('X', 7, 4, 't1.eq1g', -.4); e('X', 8, 3, 'tp.wow', .5); P('lfo1.rate', 7); wait(3);
P('tp.wow', .6); P('tp.flutter', .8); wait(3); P('tp.dust', .7); wait(3); P('tp.wow', 0); P('tp.flutter', 0); e('X', 8, 0, '-', 0); wait(2);
e('Z', 0); wait(4);                                                                           // 15 · stop: tails die (dust keeps crackling)
// 16 · NEW (0.8): TEMPER, HUMANISE, step pitch shift + spectral (every colour), reverb types, insert input
P('tp.dust', 0); e('Y', 0); e('Z', 1); for (let tr = 1; tr <= 9; tr++) P(`t${tr}.engine`, tr === 2 ? 2 : 0);
for (const tv of [-1, -.4, .3, 1]) { P('dr.temper', tv); wait(1.5); } for (let i = 0; i < 30; i++) { P('dr.temper', Math.sin(i / 3)); wait(.03); } P('dr.temper', 0); wait(1);
for (const h of [.3, .7, 1]) { P('dr.human', h); wait(4); } P('dr.human', 0); wait(1);
for (let z = 0; z < 6; z++) { const c = (z + .5) / 6; step(0, 0, 4, { vel: .9, sh: z % 2 ? 7 : -12, shMix: .6, spec: .8, col: c }); step(0, 1, 12, { spec: .7, col: (z + .2) / 6, spMix: .9 }); step(0, 2, 6, { sh: 12 - z * 5, shMix: 1, rat: 2 }); wait(2); }
step(0, 0, 4, { vel: .9 }); step(0, 1, 12, {}); step(0, 2, 6, {}); wait(1);
for (let ty = 1; ty <= 3; ty++) { P('dr.revtype', ty); P('t2.rev', .8); P('dr.revsize', ty === 2 ? .4 : .7); wait(3); }
P('dr.revsize', .93); wait(4); P('dr.revsize', 1); wait(2); e('Z', 0); wait(3); P('dr.revsize', .6);
e('I', 1); P('in.level', .8); P('in.dly', .4); P('in.rev', .5); P('dr.revtype', 1); wait(3); P('in.drums', 0); e('Z', 1); wait(2); P('sl.on', 1); wait(3);
P('in.drums', 1); P('dr.revtype', 0); P('sl.on', 0); e('I', 0); e('Z', 0); wait(3);
// 17 · NEW (0.9): tracks 10–12, METALISE (track, step, slice, master character), RESAMPLE (every model and transient mode),
//      sliced samples (pitch, gain, pan, attack, gate, reverse, stutter, per-step slice, reverse / stutter chance), slice pads + REC,
//      per-pattern Slicer
for (let tr = 1; tr <= 12; tr++) P(`t${tr}.engine`, tr === 4 ? 2 : 0);
e('Y', 0); e('Z', 1); for (let tr = 9; tr < 12; tr++) for (let k = tr - 9; k < 16; k += 4) step(0, tr, k, { vel: .8 });
for (const a of [.2, .5, .8, 1]) { P('t1.metal', a); P('t2.metal', 1 - a); wait(1); } P('t1.metal', 0); P('t2.metal', 0); wait(.5);
step(0, 0, 4, { vel: .9, mt: .9 }); step(0, 1, 12, { mt: .4 }); step(0, 2, 6, { mt: 0 }); P('t3.metal', .7); wait(2); P('t3.metal', 0);
for (let m = 0; m < 6; m++) { P('t2.rsmp', .25 + (m % 4) * .25); P('t2.smodel', m); P('t2.rsmode', m % 4); P('t2.rssens', (m + 1) / 7); P('t3.rsmp', 1 - m * .12); P('t3.rsmode', (m + 2) % 4); wait(1.2); }
P('t2.rsmp', 0); P('t3.rsmp', 0); wait(.5);
P('gl.on', 1); P('gl.mode', 2); P('gl.mix', .7); P('gl.metal', .8); wait(2); P('gl.metal', 0); wait(.5); P('gl.on', 0);
P('t5.engine', 1); P('t5.decay', 3); P('t5.tone', .8); e('V', 4, 60000, 180, .25, 44100, 8); P('t5.slice', 3);
for (let k = 0; k < 16; k++) step(0, 4, k, { vel: .85, sl: k % 3 ? 1 + (k * 5) % 8 : 0, rv: k % 4 === 1 ? .6 : 0, su: k % 5 === 2 ? .7 : 0, mt: k === 7 ? .5 : -1, rat: k === 10 ? 2 : 1 });
P('t5.metal', .3); P('t5.rsmp', .4); wait(4); P('t5.metal', 0); P('t5.rsmp', 0);
e('R', 1); for (let i = 0; i < 12; i++) { e('Q', 4, 1 + (i * 3) % 8, .5 + (i % 5) / 10); wait(.11); } e('R', 0); wait(2);
for (let i = 0; i < 32; i++) e('L', i, i % 2 ? 8 : 0, i); P('sl.on', 0); e('G', 0, 1); wait(2); e('G', 0, -1); P('sl.on', 1); e('G', 0, 0); wait(2); e('G', 0, -1); wait(1); P('sl.on', 0);
e('V', 4, 0, 0, 0, 0, 0); wait(.5); e('Z', 0); wait(2);
// 18 · NEW (0.9.1): LONG sounds, a drawn LFO, the Metalise switch on an LFO, Metalise chance
P('t6.engine', 0); P('t6.long', 1); P('t6.decay', 1.5); P('t6.level', .7); e('Y', 0); e('Z', 1); step(0, 5, 0, { vel: .9 }); wait(4); P('t6.long', 0); wait(1);
e('D', 0, 1, -1, .5, -.5, 1, 0, -1, .25, .75, -.75, 0, 1, -1, .3, -.3, 0); P('lfo1.shape', 5); P('lfo1.rate', 3); e('X', 9, 0, 't2.tune', .6); wait(2);
P('gl.mode', 2); P('gl.mix', .7); e('X', 10, 1, 'gl.on', 1); P('lfo2.rate', 1.5); wait(3); e('X', 10, 0, '-', 0); e('X', 9, 0, '-', 0);
P('gl.on', 1); P('gl.chance', .5); P('gl.chdiv', 0); wait(3); P('gl.chdiv', 3); P('gl.chance', .7); wait(3); P('gl.chance', 0); P('gl.on', 0); e('Z', 0); wait(2);
const lines = ev.map(a => a.join(' ')); lines.push('END ' + t);
fs.writeFileSync(path.join(__dirname, 'events.txt'), lines.join('\n') + '\n');
console.log(`${ev.length} events, ${(t / SR).toFixed(1)} s${STRICT ? ' (strict)' : ''}`);
