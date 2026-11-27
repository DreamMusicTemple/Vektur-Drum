/* ============================================================ Vektur Drum — NEW (0.8) factory kits
   INIT (a blank kit: every parameter at its default, empty patterns) · 10 80s Electro · 10 Breakbeat · 10 Ambient.
   Same method as factory-genres.js: each kit is "DNA" grown into patterns by genre rules with a fixed seed, so it is
   always the same kit, here and native. Kits may carry a tempo (bpm): the standalone app takes it on load; an AUv3
   follows its host. Ambient kits are slow, sparse and wet: the Expanse reverb (some in its 90–95 % wash range),
   evolving modulation, step spectral smears and pitch-shifted shimmer. */
(function () {
  const rngOf = seed => { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const r2 = x => Math.round(x * 100) / 100;
  const euclid = (k, n, rot = 0) => { const o = []; for (let i = 0; i < n; i++) o.push(((i + rot) * k) % n < k); return o; };
  /** A step: velocity, pan, pitch, ratchet · crush, delay, reverb, chance, FM ratio · ring ×5, fold · shift st, shift mix, spectral, colour, spectral mix. */
  function step(o = {}) {
    const s = [r2(o.v != null ? o.v : 0.8), r2(o.pan || 0), Math.round(o.p || 0), o.r || 1];
    const fx = [r2(o.crush || 0), r2(o.dly || 0), r2(o.rev || 0), o.prob != null ? r2(o.prob) : 1, o.fm || 0];
    const ring = o.ring ? [1, ...o.ring] : [0, 9, 0, 1, 220];
    const sp = [Math.round(o.sh || 0), o.shMix != null ? r2(o.shMix) : 1, r2(o.spec || 0), r2(o.col || 0), o.spMix != null ? r2(o.spMix) : 1];
    if (o.sh || o.spec) return s.concat(fx, ring, [r2(o.fold || 0)], sp);
    if (o.fold > 0 || o.ring) return s.concat(fx, ring, o.fold > 0 ? [r2(o.fold)] : []);
    if (fx[0] || fx[1] || fx[2] || fx[3] !== 1 || fx[4]) return s.concat(fx);
    return s;
  }
  function pat(tracks, bars = 1) {
    const pt = drumEmptyPattern(); pt.bars = bars;
    tracks.forEach((tr, t) => { if (!tr) return; pt.tr[t].len = tr.len || 16; pt.tr[t].div = tr.div != null ? tr.div : DRUM_DEF_DIV;
      for (const [k, o] of Object.entries(tr.steps || {})) if (o && +k < 16) pt.tr[t].s[+k] = step(o); });
    return pt;
  }
  const prefix = (t, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`t${t}.${k}`, v]));
  function kit(name, cat, voices, master, pats, extra = {}) {
    const p = {}; voices.forEach((v, i) => Object.assign(p, prefix(i + 1, v))); Object.assign(p, master);
    for (const k of Object.keys(p)) { const q = DRUM_PARAMS[DP_ID[k]]; if (!q) throw new Error(`factory ${name}: no parameter ${k}`); p[k] = q[3] === 'cont' ? r2(clamp(p[k], q[4], q[5])) : Math.round(clamp(p[k], q[4], q[5])); }
    DRUM_FACTORY.push(Object.assign({ name, cat, ntr: 9, p, pats, chain: extra.chain || [0, 0, 0, 1], chainOn: true, bpm: extra.bpm },
      extra.slice ? { slice: extra.slice } : {}, extra.wires ? { wires: extra.wires } : {}));
  }
  const W = (s, k, a) => ({ s, k, a });
  const SL = (acts, srcs = {}) => Array.from({ length: SL_SLOTS }, (_, i) => [acts[i % acts.length] | 0, srcs[i] != null ? srcs[i] : i]);
  const A = { T: 0, R: 1, S: 2, V: 3, X: 4, Y: 5, P: 6, D: 7, G: 8, M: 9, C: 10, E: 11 };
  const prog = s => s.split('').map(c => A[c] != null ? A[c] : 0);

  // =================================================================================== INIT
  // Every parameter at its default (TEMPER neutral, HUMANISE off), empty tracks, no samples, no Slicer, no wires.
  DRUM_FACTORY.unshift({ name: 'Init', cat: 'Init', ntr: 9, p: {}, pats: [drumEmptyPattern()], chain: [], chainOn: false, init: true });

  // =================================================================================== 80s ELECTRO
  // 808-style kicks on the syncopated electro grid, claps on 2 and 4 through the GATE reverb, cowbells and toms,
  // FM zaps and ring-modulated blips, a touch of 12-bit, cold TEMPER for that machine edge.
  const ELECTRO = [
    ['Planet Rock Signal', 401, { bpm: 127, cow: 1, zap: .6, tom: .5, cold: .35, bits: 16, sl: false }],
    ['Breakdance Circuit', 409, { bpm: 118, cow: .6, zap: .9, tom: .8, cold: .2, bits: 12, sl: true }],
    ['Robot Lock Step', 419, { bpm: 112, cow: 0, zap: 1, tom: .3, cold: .55, bits: 10, sl: false }],
    ['Neon Freestyle', 421, { bpm: 122, cow: .8, zap: .4, tom: .6, cold: .15, bits: 16, sl: false }],
    ['Clear Channel Drive', 431, { bpm: 130, cow: .3, zap: .7, tom: .4, cold: .4, bits: 16, sl: true }],
    ['Vocoder Avenue', 433, { bpm: 110, cow: .5, zap: .5, tom: .9, cold: .25, bits: 12, sl: false }],
    ['Mirrorball Syncopation', 439, { bpm: 124, cow: 1, zap: .3, tom: .5, cold: .1, bits: 16, sl: false }],
    ['Cybotron Alley', 443, { bpm: 128, cow: .2, zap: .8, tom: .2, cold: .6, bits: 8, sl: true }],
    ['Arcade Pop Lock', 449, { bpm: 116, cow: .7, zap: 1, tom: .7, cold: .3, bits: 12, sl: false }],
    ['Miami Bass Bounce', 457, { bpm: 125, cow: .4, zap: .5, tom: .6, cold: .2, bits: 16, sl: true }],
  ];
  ELECTRO.forEach(([name, seed, o], n) => {
    const R = rngOf(seed), rnd = (a, b) => a + (b - a) * R(), pick = a => a[Math.floor(R() * a.length)];
    const voices = [
      { model: 0, tune: rnd(-5, -1), decay: rnd(.9, 1.8), tone: rnd(.2, .35), snap: rnd(.25, .45), level: 1, sweep: rnd(2, 6), swtime: rnd(.05, .12), eq1f: 50, eq1g: rnd(2, 5) },   // long 808 boom
      { model: 4, tune: rnd(-1, 3), decay: rnd(.2, .32), tone: rnd(.5, .7), snap: rnd(.65, .85), level: .78, rev: rnd(.35, .55), eq1f: 220, eq1g: -9, eq4f: 8000, eq4g: 2 },   // clap → gate
      { model: 2, tune: rnd(1, 5), decay: rnd(.025, .045), tone: rnd(.65, .85), level: .42, pan: -.15, choke: 1, eq1f: 600, eq1g: -12 },
      { model: 3, tune: rnd(0, 3), decay: rnd(.18, .3), tone: rnd(.6, .8), level: .36, pan: .15, choke: 1, eq1f: 600, eq1g: -12 },
      { model: 7, tune: rnd(4, 9), decay: rnd(.12, .22), tone: .55, level: .32 * o.cow + .02, pan: rnd(.2, .4), dly: rnd(.1, .3) },   // cowbell
      { model: 5, tune: rnd(-7, -2), decay: rnd(.3, .5), tone: .45, level: .5 * o.tom + .05, pan: rnd(-.4, -.1), rev: .3, bend: rnd(-5, -2), brate: 0 },   // toms
      { model: 6, tune: rnd(2, 7), decay: .06, level: .4, pan: rnd(-.5, .5), bits: o.bits, rate: o.bits < 16 ? 22050 : 48000 },   // rim
      { engine: 2, fmalgo: pick([0, 1]), fmfreq: rnd(600, 1400), fmratio: pick([1.5, 2, 3.5]), fmindex: rnd(4, 9), fmidec: rnd(.03, .09), sweep: rnd(-30, -14), swtime: rnd(.05, .12), decay: rnd(.12, .25), level: .36 * o.zap + .04, pan: rnd(-.4, .4), dly: rnd(.15, .35) },   // zap
      { engine: 2, fmalgo: 0, fmfreq: rnd(45, 58), fmratio: .5, fmindex: rnd(.6, 1.4), fmidec: .15, decay: rnd(.4, .8), level: .55, sweep: -3, swtime: .1, eq4f: 2500, eq4g: -10 },   // bass blips
    ];
    const kicks = pick([[0, 6, 10], [0, 3, 6, 10], [0, 6, 11, 14], [0, 7, 10, 13], [0, 3, 10]]);
    const root = pick([0, 3, 5, -2]);
    const grow = v => {
      const tr = [];
      const kk = {}; kicks.forEach(k => kk[k] = { v: k ? .85 : 1 }); if (v) kk[pick([13, 15, 9])] = { v: .7 }; tr.push({ steps: kk });
      tr.push({ steps: { 4: { v: 1 }, 12: { v: 1 }, ...(v === 2 ? { 15: { v: .6, r: 2 } } : {}) } });
      const ch = {}; for (let k = 0; k < 16; k++) if (k % 4 !== 2 || !v) ch[k] = { v: k % 2 ? .45 : .7, r: (v && k === 14) ? 2 : 1 }; tr.push({ steps: ch });
      tr.push({ steps: { 2: { v: .7 }, 10: { v: .7 }, ...(v ? { 6: { v: .55, prob: .6 } } : {}) } });
      const cw = {}; if (o.cow) [3, 6, 11, 14].forEach(k => { if (R() < .55 + v * .1) cw[k] = { v: rnd(.55, .85), p: pick([0, 0, 7]) }; }); tr.push({ steps: cw });
      const tm = {}; if (v >= 1) [10, 12, 14].forEach((k, i) => { if (R() < o.tom) tm[k + (v === 2 ? 1 : 0)] = { v: .8, p: 7 - i * 4 }; }); tr.push({ steps: tm });
      const rim = {}; euclid(pick([3, 5]), 16, Math.floor(R() * 16)).forEach((b, k) => { if (b && k % 4) rim[k] = { v: rnd(.4, .7) }; }); tr.push({ steps: rim });
      const zp = {}; for (let k = 0; k < 16; k++) if (R() < .12 * o.zap + v * .05) zp[k] = { v: rnd(.55, .9), p: pick([0, 12, 7, -5]), ring: R() < .3 ? [8, 1 << 2, .7, Math.round(rnd(400, 1200))] : undefined };
      tr.push({ steps: zp });
      const bs = {}; kicks.forEach((k, i) => { bs[(k + 1 + (i % 2)) % 16] = { v: .85, p: root + pick([0, 0, 12, 7]) }; }); if (v === 2) bs[15] = { v: .7, p: root + 12 }; tr.push({ steps: bs });
      return pat(tr);
    };
    kit(name, '80s Electro', voices, {
      'dr.swing': rnd(0, .06), 'dr.temper': o.cold, 'dr.human': 0, 'dr.dlydiv': pick([3, 5, 4]), 'dr.dlyfb': rnd(.3, .5), 'dr.dlytone': rnd(.5, .75), 'dr.dlypp': 1,
      'dr.revtype': 2, 'dr.revsize': rnd(.25, .45), 'dr.revdamp': rnd(.2, .4),   // the GATE: the 80s snare
      'gl.on': 0, 'lfo1.shape': 0, 'lfo1.sync': 1, 'lfo1.div': 2, 'lfo2.shape': 4, 'lfo2.sync': 1, 'lfo2.div': 4,
      'sl.on': o.sl ? 1 : 0, 'sl.mix': .85, 'sl.div': 1, 'sl.bars': 1, 'sl.density': .2, 'sl.evolve': .1, 'sl.seed': seed % 100, 'sl.stutter': 2, 'sl.pitch': 12,
      'env.src': 1, 'env.att': .002, 'env.rel': .12, 'env.gain': 3,
    }, [grow(0), grow(1), grow(2)], {
      bpm: o.bpm, chain: [0, 1, 0, 1, 0, 1, 0, 2],
      slice: SL(prog('TTTTTTTTTTTTTTTTTTTTTTTTTTTTSSGG')),
      wires: [W(0, 't8.fmindex', .35), W(1, 't5.pan', .4), W(3, 't9.fmindex', .25), W(2, 't7.tune', .15)],
    });
  });

  // =================================================================================== BREAKBEAT
  // Funk-break skeletons (kick/snare placements of the classic breaks), ghost snares, swung hats, rides and shakers;
  // Spring or Room reverb, warm TEMPER, the Slicer cutting the break up in the last bar.
  const BREAKS = [
    ['Amen Corner Rush', 503, { bpm: 170, sk: 'amen', swing: .1, warm: .4, sl: 'TTTTTTTTTTTTTTTTRTTSTTVTTTMTSSRS', rev: 0, hum: .3 }],
    ['Funky Drummer Echo', 509, { bpm: 102, sk: 'funky', swing: .3, warm: .5, sl: 'TTTTTTTTTTTTTTTTTTTTTTTTTTTTRTSS', rev: 1, hum: .35 }],
    ['Think Loop Pressure', 521, { bpm: 132, sk: 'think', swing: .18, warm: .3, sl: 'TTTTTTTTTTTTTTTTTTTRTTTTSTTTMTRS', rev: 0, hum: .25 }],
    ['Apache Bongo Break', 523, { bpm: 112, sk: 'apache', swing: .25, warm: .55, sl: 'TTTTTTTTTTTTTTTTTTTTTTTTTTTTSTVS', rev: 1, hum: .4 }],
    ['Big Beat Bulldozer', 541, { bpm: 128, sk: 'bigbeat', swing: .05, warm: .2, cold: .3, sl: 'TTTTTTTTTTTTTTTTTTTTTTTTSSSSRRXY', rev: 0, hum: .1 }],
    ['Nu Skool Rinse', 547, { bpm: 135, sk: 'think', swing: .08, warm: 0, cold: .35, sl: 'TTTTTTTTTTTTTTTTTTRTTTTTTTMTSSRS', rev: 2, hum: .15 }],
    ['Jungle Tea Party', 557, { bpm: 165, sk: 'amen', swing: .12, warm: .45, sl: 'TTTTTTTTTTTTTTRTTTTTTTSTTTVTMSSS', rev: 1, hum: .3 }],
    ['Hot Pants Shuffle', 563, { bpm: 98, sk: 'funky', swing: .38, warm: .6, sl: 'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTRS', rev: 1, hum: .45 }],
    ['Breakstep Rumble', 569, { bpm: 140, sk: 'bigbeat', swing: .1, warm: .25, sl: 'TTTTTTTTTTTTTTTTTTTTTTTTTTTSSRVS', rev: 0, hum: .2 }],
    ['Chopped Soul Sermon', 571, { bpm: 92, sk: 'apache', swing: .34, warm: .5, sl: 'TTTTTTTTTTTTTTTTTTRTTTTTTTTTMTRS', rev: 1, hum: .4 }],
  ];
  const SKEL = {   // [kicks, snares, ghosts]
    amen: [[0, 2, 10, 11], [4, 7, 9, 12, 15], [6, 14]],
    funky: [[0, 3, 7, 10], [4, 12], [6, 9, 11, 15]],
    think: [[0, 6, 10], [4, 12], [7, 9, 14, 15]],
    apache: [[0, 5, 8, 11], [4, 12], [2, 7, 14]],
    bigbeat: [[0, 6, 8, 11], [4, 12], [15]],
  };
  BREAKS.forEach(([name, seed, o], n) => {
    const R = rngOf(seed), rnd = (a, b) => a + (b - a) * R(), pick = a => a[Math.floor(R() * a.length)];
    const [K, S, G] = SKEL[o.sk];
    const voices = [
      { model: 0, tune: rnd(-2, 2), decay: rnd(.3, .5), tone: rnd(.4, .6), snap: rnd(.45, .7), level: .95, eq1f: 70, eq1g: rnd(1, 4), eq3f: 3000, eq3g: rnd(0, 3) },
      { model: 1, tune: rnd(-2, 3), decay: rnd(.18, .3), tone: rnd(.45, .65), snap: rnd(.6, .85), level: .85, rev: rnd(.15, .3), eq2f: 220, eq2g: rnd(1, 4), eq4f: 7000, eq4g: rnd(-2, 2) },
      { model: 2, tune: rnd(-1, 2), decay: rnd(.04, .07), tone: rnd(.5, .7), level: .42, pan: rnd(.1, .3), choke: 1 },
      { model: 3, decay: rnd(.22, .4), tone: rnd(.5, .7), level: .34, pan: rnd(.1, .3), choke: 1 },
      { engine: 2, fmalgo: 3, fmfreq: rnd(2500, 3800), fmratio: 1.41, fmratio2: rnd(2.3, 3.1), fmindex: rnd(2.5, 4.5), fmidec: .15, fmnoise: .25, decay: rnd(.4, .9), level: .25, pan: -.25 },   // ride
      { model: 1, tune: rnd(1, 5), decay: rnd(.08, .14), tone: .55, snap: .7, level: .42, pan: rnd(-.15, .15) },   // ghost snare
      { engine: 2, fmalgo: 2, fmfreq: rnd(3500, 6500), fmratio: 1.5, fmratio2: 2.3, fmindex: 2, fmidec: .02, fmnoise: .85, decay: rnd(.05, .1), level: .26, pan: rnd(-.5, .5) },   // shaker
      { model: 5, tune: rnd(-5, 2), decay: rnd(.25, .4), tone: .5, level: .42, pan: rnd(-.4, .4), rev: .25 },   // tom / bongo
      { engine: 2, fmalgo: 0, fmfreq: rnd(42, 55), fmratio: .5, fmindex: rnd(.6, 1.2), fmidec: .3, decay: rnd(.6, 1.1), level: .5, eq4f: 2000, eq4g: -10 },   // sub
    ];
    const grow = v => {
      const tr = [];
      const kk = {}; K.forEach(k => kk[k] = { v: k ? rnd(.75, .95) : 1 }); if (v === 2) kk[pick([13, 14])] = { v: .7 }; tr.push({ steps: kk });
      const sn = {}; S.forEach(k => sn[k] = { v: k === 4 || k === 12 ? 1 : rnd(.65, .85) }); if (v === 2) { sn[14] = { v: .8, r: 2 }; sn[15] = { v: .9, r: 3 }; } tr.push({ steps: sn });
      const ch = {}; for (let k = 0; k < 16; k += 2) ch[k] = { v: k % 4 ? .5 : .75 }; for (let k = 1; k < 16; k += 2) if (R() < .45) ch[k] = { v: .35, prob: .7 }; tr.push({ steps: ch });
      tr.push({ steps: { [pick([6, 14, 10])]: { v: .7 }, ...(v ? { 2: { v: .5, prob: .5 } } : {}) } });
      const rd = {}; if (o.sk === 'amen' || o.sk === 'think') for (let k = 0; k < 16; k += 2) rd[k] = { v: k % 4 ? .45 : .65 }; tr.push({ steps: rd });
      const gh = {}; G.forEach(k => gh[k] = { v: rnd(.25, .45), prob: rnd(.6, .95) }); if (v) gh[pick([1, 3, 5])] = { v: .3, prob: .6 }; tr.push({ steps: gh });
      const sh = {}; for (let k = 0; k < 16; k++) if (R() < .55) sh[k] = { v: rnd(.25, .6), prob: rnd(.6, 1) }; tr.push({ len: pick([16, 12]), div: pick([5, 6]), steps: sh });
      const tm = {}; if (o.sk === 'apache' || v === 2) [3, 7, 11, 13].forEach((k, i) => { if (R() < .6) tm[k] = { v: rnd(.55, .85), p: [5, 2, 0, -3][i] }; }); tr.push({ steps: tm });
      const sb = {}; K.forEach((k, i) => { if (i === 0 || R() < .5) sb[k] = { v: .85, p: pick([0, 0, 3, 7, -2]) }; }); tr.push({ steps: sb });
      return pat(tr);
    };
    kit(name, 'Breakbeat', voices, {
      'dr.swing': o.swing, 'dr.temper': o.cold ? o.cold : -o.warm, 'dr.human': o.hum, 'dr.dlydiv': pick([4, 5, 3]), 'dr.dlyfb': rnd(.3, .5), 'dr.dlypp': 1,
      'dr.revtype': o.rev, 'dr.revsize': rnd(.4, .65), 'dr.revdamp': rnd(.3, .5),
      'gl.on': n % 3 === 0 ? 1 : 0, 'gl.mode': pick([0, 1]), 'gl.mix': rnd(.2, .35), 'gl.size': rnd(.1, .3),
      'lfo1.shape': 4, 'lfo1.sync': 1, 'lfo1.div': 3, 'lfo2.shape': 0, 'lfo2.rate': rnd(.1, .4),
      'sl.on': 1, 'sl.mix': rnd(.75, .95), 'sl.div': 1, 'sl.bars': 1, 'sl.density': rnd(.35, .6), 'sl.evolve': rnd(.1, .3), 'sl.seed': seed % 100, 'sl.stutter': pick([1, 2, 3]), 'sl.tape': .7, 'sl.pitch': pick([-12, 12, 7]),
      'tp.wow': rnd(0, .15), 'tp.flutter': rnd(0, .2), 'tp.dust': o.warm > .4 ? rnd(.1, .3) : 0,
    }, [grow(0), grow(1), grow(2)], {
      bpm: o.bpm, chain: [0, 1, 0, 2],
      slice: SL(prog(o.sl), { 17: 4, 22: 12, 26: 2 }),
      wires: [W(0, 'sl.seed', .2), W(4, 't6.level', .3), W(1, 't7.pan', .5), W(3, 't5.decay', -.25)],
    });
  });

  // =================================================================================== AMBIENT
  // 58–84 BPM, sparse and slow (1/8 and 1/4 divisions, low chance), soft round kicks, brushed noise, FM bells and
  // glass, pitch-shifted shimmer and spectral smears/freezes on steps, everything into the Expanse reverb.
  const AMB = [
    ['Glacier Breath', 601, { bpm: 64, size: .93, smear: .5, shimmer: 12, human: .3 }],
    ['Cathedral of Dust', 607, { bpm: 72, size: .91, smear: .35, shimmer: 7, human: .25 }],
    ['Slow Tide Archive', 613, { bpm: 58, size: .94, smear: .6, shimmer: 12, human: .35 }],
    ['Lantern Fog', 617, { bpm: 76, size: .86, smear: .3, shimmer: 0, human: .2 }],
    ['Aurora Drift', 619, { bpm: 68, size: .92, smear: .45, shimmer: 19, human: .3 }],
    ['Hollow Moon Bells', 631, { bpm: 80, size: .88, smear: .25, shimmer: 12, human: .15 }],
    ['Under Ice Pulse', 641, { bpm: 84, size: .84, smear: .4, shimmer: -12, human: .2 }],
    ['Weightless Hours', 643, { bpm: 60, size: .94, smear: .7, shimmer: 24, human: .4 }],
    ['Mist Garden Clock', 647, { bpm: 70, size: .9, smear: .3, shimmer: 7, human: .25 }],
    ['Night Observatory', 653, { bpm: 66, size: .925, smear: .55, shimmer: 12, human: .3 }],
  ];
  AMB.forEach(([name, seed, o], n) => {
    const R = rngOf(seed), rnd = (a, b) => a + (b - a) * R(), pick = a => a[Math.floor(R() * a.length)];
    const scale = pick([[0, 2, 7, 9, 12, 14], [0, 3, 7, 10, 12, 15], [0, 4, 7, 11, 14, 16], [0, 5, 7, 12, 14, 19]]);
    const voices = [
      { model: 0, tune: rnd(-6, -2), decay: rnd(.6, 1.1), tone: rnd(.15, .3), snap: rnd(.05, .15), level: .8, rev: rnd(.15, .3), eq4f: 3000, eq4g: -8 },   // soft round kick
      { engine: 2, fmalgo: 2, fmfreq: rnd(180, 300), fmratio: 1.3, fmratio2: 2.7, fmindex: 2, fmidec: .08, fmnoise: .9, decay: rnd(.35, .6), level: .38, rev: rnd(.5, .8), dly: .2, eq1f: 300, eq1g: -6, eq4f: 6000, eq4g: -6 },   // brush
      { model: 2, decay: rnd(.05, .09), tone: rnd(.3, .45), level: .22, pan: rnd(-.3, .3), rev: .5, choke: 0, eq4f: 8000, eq4g: -6 },
      { engine: 2, fmalgo: 0, fmfreq: rnd(400, 700), fmratio: pick([3.5, 2.76, 4.2]), fmindex: rnd(1.2, 2.5), fmidec: rnd(.6, 1.4), decay: rnd(1.8, 3), level: .34, pan: rnd(-.5, -.15), rev: .9, dly: .35 },   // bell A
      { engine: 2, fmalgo: 3, fmfreq: rnd(900, 1500), fmratio: 1.41, fmratio2: rnd(2.3, 3.7), fmindex: rnd(1.5, 3), fmidec: rnd(.4, 1), decay: rnd(1.5, 2.8), level: .26, pan: rnd(.15, .5), rev: .95, dly: .3 },   // glass
      { engine: 2, fmalgo: 0, fmfreq: rnd(55, 75), fmratio: .5, fmindex: rnd(.3, .8), fmidec: .8, decay: rnd(2, 3), level: .42, rev: .4, eq4f: 1500, eq4g: -12 },   // drone sub
      { model: 7, tune: rnd(-12, -5), decay: rnd(.8, 1.5), tone: .3, level: .24, pan: rnd(-.6, .6), rev: 1, dly: .4 },   // low bell
      { engine: 2, fmalgo: 1, fmfreq: rnd(200, 350), fmratio: rnd(1.9, 2.1), fmratio2: rnd(.99, 1.01), fmindex: rnd(.6, 1.4), fmidec: 2, decay: 3, level: .28, pan: rnd(-.3, .3), rev: 1 },   // pad tone
      { engine: 2, fmalgo: 2, fmfreq: rnd(4000, 7000), fmratio: 1.5, fmratio2: 2.3, fmindex: 1.5, fmidec: .05, fmnoise: 1, decay: rnd(.15, .3), level: .18, pan: rnd(-.7, .7), rev: .8 },   // air
    ];
    const grow = v => {
      const tr = [];
      tr.push({ div: 2, len: 8, steps: { 0: { v: .9 }, ...(R() < .5 ? { 5: { v: .5, prob: .5 } } : {}), ...(v ? { 6: { v: .45, prob: .6 } } : {}) } });   // 1/8 kick, two bars of eighths
      const br = {}; euclid(pick([2, 3]), 8, Math.floor(R() * 8)).forEach((b, k) => { if (b) br[k] = { v: rnd(.4, .7), prob: rnd(.6, .9), spec: o.smear * .6, col: rnd(.02, .14) }; }); tr.push({ div: 2, len: 8, steps: br });
      const ch = {}; for (let k = 0; k < 16; k++) if (R() < .3) ch[k] = { v: rnd(.2, .45), prob: rnd(.3, .7), pan: rnd(-.5, .5) }; tr.push({ len: pick([16, 13, 11]), steps: ch });
      const ba = {}; [0, 3, 5].forEach((k, i) => { if (R() < .8) ba[k + v] = { v: rnd(.5, .8), p: scale[(i * 2 + v) % scale.length] - 7, sh: o.shimmer, shMix: rnd(.25, .45), prob: rnd(.7, 1) }; }); tr.push({ div: 0, len: pick([7, 6, 8]), steps: ba });   // 1/4
      const gl = {}; for (let k = 0; k < 8; k++) if (R() < .35) gl[k] = { v: rnd(.4, .7), p: pick(scale) - 5, prob: rnd(.4, .8), spec: R() < .5 ? o.smear : 0, col: pick([.05, .75, .93, .4]) }; tr.push({ div: 2, len: pick([5, 7, 9]), steps: gl });
      tr.push({ div: 0, len: 8, steps: { 0: { v: .8, p: scale[0] }, ...(v === 2 ? { 4: { v: .6, p: scale[1] - 12 } } : {}) } });
      const lb = {}; if (R() < .7) lb[pick([2, 3, 6])] = { v: .6, p: pick([0, 7, -5]), spec: .5, col: .95 }; tr.push({ div: 0, len: 8, steps: lb });   // a frozen low bell
      tr.push({ div: 0, len: 16, steps: { 0: { v: .7, p: scale[2] - 12, spec: o.smear * .8, col: rnd(.08, .15) }, 8: { v: .6, p: scale[3] - 12, prob: .7 } } });   // a smeared pad tone
      const ai = {}; for (let k = 0; k < 16; k++) if (R() < .2) ai[k] = { v: rnd(.3, .6), prob: rnd(.3, .6), dly: .4 }; tr.push({ div: 6, len: pick([12, 9]), steps: ai });
      return pat(tr, 2);
    };
    kit(name, 'Ambient', voices, {
      'dr.swing': 0, 'dr.temper': -rnd(.15, .35), 'dr.human': o.human, 'dr.level': .8,
      'dr.dlydiv': pick([2, 4, 0]), 'dr.dlyfb': rnd(.5, .7), 'dr.dlytone': rnd(.25, .45), 'dr.dlypp': 1,
      'dr.revtype': 3, 'dr.revsize': o.size, 'dr.revdamp': rnd(.25, .5),   // Expanse
      'lfo1.shape': 0, 'lfo1.rate': rnd(.03, .08), 'lfo1.depth': 0, 'lfo2.shape': 1, 'lfo2.rate': rnd(.02, .05), 'lfo3.shape': 4, 'lfo3.rate': rnd(.05, .15),
      'ch.mode': 1, 'ch.rate': rnd(.05, .2),
      'tp.wow': rnd(.15, .35), 'tp.flutter': rnd(.05, .15), 'tp.dust': rnd(0, .15),
    }, [grow(0), grow(1), grow(2)], {
      bpm: o.bpm, chain: [0, 1, 0, 2],
      wires: [W(0, 't4.fmindex', .3), W(1, 't5.pan', .5), W(4, 't8.fmindex', .25), W(2, 't9.pan', .6), W(0, 'dr.dlytone', .2), W(1, 't7.tune', .05), W(4, 't2.eq4g', .3)],
    });
  });
})();
