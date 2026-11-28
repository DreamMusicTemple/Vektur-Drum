/* ============================================================ Vektur Drum — NEW factory kits: 40 genre kits
   10 IDM · 10 Techno · 10 Lo-Fi & Downtempo · 10 Hard Trance & Psytrance.
   Each kit is written as "DNA" (its sounds, feel and effects) and its patterns are grown from it by genre rules with a
   fixed seed — so a kit is always exactly the same, in the web app and (through the generated factory file) native.
   They use everything: per-track engines and EQ, per-step pitch, ratchets, chance, crush, fold, FM ratio and ring
   modulation, polymeter and mixed divisions, the glitch, the Slicer, tape, and modulation wires. */
(function () {
  const rngOf = seed => { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const r2 = x => Math.round(x * 100) / 100;
  const euclid = (k, n, rot = 0) => { const o = []; for (let i = 0; i < n; i++) o.push(((i + rot) * k) % n < k); return o; };
  /** A step: velocity, pan, pitch, ratchet, then crush, delay, reverb, chance, FM ratio, ring ×5, fold — only as long as needed. */
  function step(o = {}) {
    const s = [r2(o.v != null ? o.v : 0.8), r2(o.pan || 0), Math.round(o.p || 0), o.r || 1];
    const fx = [o.crush || 0, o.dly || 0, o.rev || 0, o.prob != null ? r2(o.prob) : 1, o.fm || 0];
    const ring = o.ring ? [1, ...o.ring] : [0, 9, 0, 1, 220];
    if (o.fold > 0 || o.ring) return s.concat(fx, ring, o.fold > 0 ? [r2(o.fold)] : []);
    if (fx[0] || fx[1] || fx[2] || fx[3] !== 1 || fx[4]) return s.concat(fx);
    return s;
  }
  /** pattern: tracks = [{ len, div, steps: { k: stepOptions } }] */
  function pat(tracks, bars = 1) {
    const pt = drumEmptyPattern(); pt.bars = bars;
    tracks.forEach((tr, t) => { if (!tr) return; pt.tr[t].len = tr.len || 16; pt.tr[t].div = tr.div != null ? tr.div : DRUM_DEF_DIV;
      for (const [k, o] of Object.entries(tr.steps || {})) if (o) pt.tr[t].s[+k] = step(o); });
    return pt;
  }
  const prefix = (t, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`t${t}.${k}`, v]));
  function kit(name, cat, voices, master, pats, extra = {}) {
    const p = {}; voices.forEach((v, i) => Object.assign(p, prefix(i + 1, v))); Object.assign(p, master);
    for (const k of Object.keys(p)) { const q = DRUM_PARAMS[DP_ID[k]]; if (!q) throw new Error(`factory ${name}: no parameter ${k}`); p[k] = q[3] === 'cont' ? r2(clamp(p[k], q[4], q[5])) : Math.round(clamp(p[k], q[4], q[5])); }
    DRUM_FACTORY.push(Object.assign({ name, cat, ntr: 9, p, pats, chain: extra.chain || [0, 0, 0, 1], chainOn: true },
      extra.slice ? { slice: extra.slice } : {}, extra.wires ? { wires: extra.wires } : {}));
  }
  const W = (s, k, a) => ({ s, k, a });   // a modulation wire: source 0–2 LFO, 3 env, 4 chaos
  const SL = (acts, srcs = {}) => Array.from({ length: SL_SLOTS }, (_, i) => [acts[i % acts.length] | 0, srcs[i] != null ? srcs[i] : i]);
  const A = { T: 0, R: 1, S: 2, V: 3, X: 4, Y: 5, P: 6, D: 7, G: 8, M: 9, C: 10, E: 11 };   // slicer action letters
  const prog = s => s.split('').map(c => A[c] != null ? A[c] : 0);

  // =================================================================================== IDM
  const IDM = [
    ['Polymetric Lattice', 11, { kick: 'fm', fold: .2, swing: .05, sl: 'TTTTSTTMTTTTRTSS', den: .55, evo: .2, tape: [0, .1, 0] }],
    ['Glass Ratchet Choir', 23, { kick: 'synth', fold: .35, swing: 0, sl: 'TSTTMTTCTTRTTSGT', den: .6, evo: .3, tape: [0, 0, 0] }],
    ['Fractured Mallet', 37, { kick: 'fm', fold: .1, swing: .1, sl: 'TTMTTRTTTTMTCTSS', den: .45, evo: .25, tape: [.1, .2, .1] }],
    ['Chaotic Interference', 41, { kick: 'fm', fold: .5, swing: 0, sl: 'SMTCRTGTSMTEPTSS', den: .7, evo: .45, tape: [0, 0, 0] }],
    ['Granular Clockwork', 53, { kick: 'synth', fold: .25, swing: .15, sl: 'TTTMTTTRTTTMTTDS', den: .5, evo: .15, tape: [0, .15, .05] }],
    ['Spectral Debris', 67, { kick: 'fm', fold: .4, swing: .05, sl: 'TCTTSTMTTGTTRTPS', den: .6, evo: .35, tape: [0, .1, .25] }],
    ['Prime Number Rain', 71, { kick: 'synth', fold: .15, swing: 0, sl: 'TTRTTTMTTSTTTTSS', den: .4, evo: .2, tape: [0, 0, 0] }],
    ['Bent Circuit Garden', 89, { kick: 'fm', fold: .6, swing: .2, sl: 'MTTSTTCTMTTRTGSS', den: .65, evo: .4, tape: [.15, .25, .15] }],
    ['Lorenz Etude', 97, { kick: 'fm', fold: .3, swing: .08, sl: 'TTSTMTTTCTTSTTRS', den: .5, evo: .5, tape: [0, .05, 0] }],
    ['Microtonal Shatter', 101, { kick: 'synth', fold: .45, swing: .03, sl: 'STMTRTSTCTGTMTSS', den: .75, evo: .3, tape: [0, .2, 0] }],
  ];
  IDM.forEach(([name, seed, o], n) => {
    const R = rngOf(seed), rnd = (a, b) => a + (b - a) * R(), pick = a => a[Math.floor(R() * a.length)];
    const scale = pick([[0, 3, 5, 7, 10, 12], [0, 2, 3, 7, 8, 12], [0, 1, 5, 6, 10, 13], [0, 4, 6, 11, 14]]);
    const kick = o.kick === 'fm' ? { engine: 2, fmalgo: 0, fmfreq: rnd(42, 60), fmratio: pick([.5, 1, 1.5]), fmindex: rnd(1.5, 4), fmidec: rnd(.015, .05), fmfold: o.fold * .5, decay: rnd(.25, .5), sweep: rnd(18, 34), swtime: rnd(.02, .05), level: .95, eq1f: 60, eq1g: 3 }
      : { model: 0, tune: rnd(-3, 3), decay: rnd(.25, .45), tone: rnd(.4, .7), snap: rnd(.4, .8), level: .95, sweep: rnd(6, 14), swtime: .03 };
    const voices = [kick,
      { engine: 2, fmalgo: 2, fmfreq: rnd(160, 260), fmratio: rnd(1.3, 2.1), fmratio2: rnd(2.5, 4.5), fmindex: rnd(4, 9), fmidec: rnd(.02, .06), fmnoise: rnd(.4, .8), decay: rnd(.12, .25), level: .8, rev: rnd(.1, .3), eq2f: 900, eq2g: rnd(-6, -2), eq4f: 7000, eq4g: 3 },
      { engine: 2, fmalgo: 3, fmfreq: rnd(2000, 3800), fmratio: rnd(1.3, 1.6), fmratio2: rnd(2.2, 3.4), fmindex: rnd(3, 6), fmidec: .01, fmnoise: rnd(.2, .5), decay: rnd(.02, .05), level: .4, pan: rnd(-.4, .4), eq1f: 400, eq1g: -12 },
      { model: 3, decay: rnd(.15, .35), tone: rnd(.5, .8), level: .32, pan: rnd(-.3, .3), choke: 1 },
      { model: 4, tune: rnd(-4, 6), decay: rnd(.1, .3), level: .45, dly: rnd(.1, .4), pan: rnd(-.5, .5), bits: pick([16, 10, 8]) },
      { engine: 2, fmalgo: 0, fmfreq: rnd(90, 160), fmratio: rnd(1.4, 2.6), fmindex: rnd(2, 5), fmidec: rnd(.04, .12), sweep: rnd(-14, 14), swtime: rnd(.03, .2), decay: rnd(.2, .45), level: .55, pan: rnd(-.5, .5), dly: rnd(0, .3) },
      { model: 6, tune: rnd(-5, 7), decay: rnd(.04, .09), level: .42, pan: rnd(-.6, .6), rate: pick([48000, 24000, 16000]) },
      { engine: 2, fmalgo: pick([0, 1, 3]), fmfreq: rnd(300, 900), fmratio: rnd(2, 5.5), fmratio2: rnd(.5, 3), fmindex: rnd(2, 7), fmidec: rnd(.08, .4), fmfold: o.fold, decay: rnd(.3, .8), level: .38, dly: rnd(.2, .5), rev: rnd(.2, .4), pan: rnd(-.4, .4) },
      { engine: 2, fmalgo: pick([1, 2]), fmfreq: rnd(500, 1800), fmratio: rnd(3, 9), fmratio2: rnd(1, 4), fmindex: rnd(3, 10), fmidec: rnd(.005, .03), fmfb: rnd(0, .4), decay: rnd(.03, .1), level: .4, pan: rnd(-.6, .6) },
    ];
    const lens = [16, pick([16, 12]), pick([13, 11, 15]), pick([16, 9]), pick([7, 11, 5]), pick([12, 10, 14]), pick([9, 13, 7]), pick([16, 15, 11]), pick([5, 7, 13])];
    const divs = [5, 5, pick([5, 8, 6]), 5, pick([5, 6]), pick([5, 3, 6]), pick([5, 8]), pick([5, 6, 7]), pick([8, 9, 5])];
    const grow = (variant) => pat(lens.map((len, t) => {
      const steps = {};
      const dens = [.3, .2, .6, .2, .3, .35, .45, .4, .5][t] + variant * .08;
      const eu = euclid(Math.max(1, Math.round(len * dens)), len, Math.floor(R() * len));
      for (let k = 0; k < len; k++) {
        if (t === 0 && k === 0) { steps[k] = { v: 1 }; continue; }
        if (!eu[k]) continue;
        const s = { v: rnd(.45, 1) };
        if (t === 1 && k % 4 === 0 && R() < .5) s.v = 1;
        if (R() < .18 + variant * .1) s.r = pick([2, 3, 4]);
        if ([2, 3, 6, 8].includes(t) && R() < .5) s.prob = rnd(.4, .9);
        if ([5, 7].includes(t)) s.p = pick(scale) - 6;
        if (t === 7 || t === 8) { if (R() < .5) s.fm = r2(rnd(.5, 7)); }
        if (R() < .15) s.fold = rnd(.2, .8);
        if (R() < .1) s.crush = rnd(.3, .7);
        if (t === 7 && R() < .35) s.ring = [pick([0, 5]), 1 << 2 | 1 << 8, rnd(.5, 1), 220];
        if (t === 8 && R() < .2) s.ring = [9, 1 << 1 | 1 << 4, rnd(.4, .9), Math.round(rnd(300, 1500))];
        if (t === 4 && R() < .3) s.dly = rnd(.2, .6);
        if (t === 1 && variant && R() < .2) s.p = pick([-2, 2, 5]);
        steps[k] = s;
      }
      return { len, div: divs[t], steps };
    }), 1);
    kit(name, 'IDM', voices, {
      'dr.swing': o.swing, 'dr.temper': -rnd(.15, .4), 'dr.dlydiv': pick([3, 6, 7]), 'dr.dlyfb': rnd(.35, .6), 'dr.dlypp': 1, 'dr.revsize': rnd(.5, .8),
      'gl.on': n % 3 === 0 ? 1 : 0, 'gl.mode': pick([0, 1, 2]), 'gl.mix': rnd(.2, .45), 'gl.size': rnd(.1, .4),
      'lfo1.shape': 4, 'lfo1.sync': 1, 'lfo1.div': pick([2, 3]), 'lfo1.depth': 0, 'lfo2.shape': pick([0, 1]), 'lfo2.rate': rnd(.1, .6), 'lfo3.shape': 2, 'lfo3.sync': 1, 'lfo3.div': 1,
      'sl.on': 1, 'sl.mix': rnd(.6, .9), 'sl.div': pick([0, 1]), 'sl.bars': pick([0, 1]), 'sl.density': o.den, 'sl.evolve': o.evo, 'sl.seed': seed % 100,
      'sl.stutter': pick([1, 2, 3, 4]), 'sl.pitch': pick([-12, 7, 12, -5]), 'sl.speed': pick([.5, 1.5, .75]),
      'env.src': 1, 'env.gain': 3, 'ch.mode': pick([0, 1, 2]), 'ch.rate': rnd(.2, 3),
      'tp.wow': o.tape[0], 'tp.flutter': o.tape[1], 'tp.dust': o.tape[2],
    }, [grow(0), grow(1), grow(2)], {
      chain: [0, 1, 0, 2], slice: SL(prog(o.sl), { 6: 2, 13: 9 }),
      wires: [W(0, 'sl.seed', .3), W(4, 't8.fmindex', .35), W(4, 't9.fmratio', .25), W(3, 't3.decay', -.3), W(1, 't6.pan', .5), W(2, 't5.dly', .4), W(4, 't2.eq3g', .3)],
    });
  });

  // =================================================================================== TECHNO
  const TECHNO = [
    ['Concrete Pressure', 211, { rumble: .8, ride: 1, clap: 'clap', fm: .3, sl: false, tape: 0 }],
    ['Hypnotic Loopwork', 223, { rumble: .5, ride: 0, clap: 'rim', fm: .6, sl: true, tape: 0 }],
    ['Industrial Furnace', 227, { rumble: 1, ride: 1, clap: 'clap', fm: .9, sl: true, tape: 0 }],
    ['Detroit Grid', 229, { rumble: .2, ride: 1, clap: 'clap', fm: .4, sl: false, tape: .1 }],
    ['Berlin Basement', 233, { rumble: .9, ride: 0, clap: 'rim', fm: .2, sl: false, tape: .2 }],
    ['Acid Corridor', 239, { rumble: .4, ride: 1, clap: 'clap', fm: 1, sl: true, tape: 0 }],
    ['Minimal Ticks', 241, { rumble: .3, ride: 0, clap: 'rim', fm: .5, sl: false, tape: 0 }],
    ['Peak Hour Engine', 251, { rumble: .7, ride: 1, clap: 'clap', fm: .7, sl: true, tape: 0 }],
    ['Dub Pulse Signal', 257, { rumble: .6, ride: 0, clap: 'rim', fm: .3, sl: false, tape: .3 }],
    ['Steel Frame Groove', 263, { rumble: .5, ride: 1, clap: 'clap', fm: .8, sl: true, tape: 0 }],
  ];
  TECHNO.forEach(([name, seed, o], n) => {
    const R = rngOf(seed), rnd = (a, b) => a + (b - a) * R(), pick = a => a[Math.floor(R() * a.length)];
    const voices = [
      { model: 0, tune: rnd(-4, 0), decay: rnd(.45, .7), tone: rnd(.3, .5), snap: rnd(.35, .6), level: 1, sweep: rnd(4, 10), swtime: .04, eq1f: 55, eq1g: rnd(2, 5), eq2f: 300, eq2g: -4 },
      o.clap === 'clap' ? { model: 4, decay: rnd(.25, .4), tone: rnd(.4, .6), snap: .7, level: .7, rev: rnd(.2, .4), eq1f: 200, eq1g: -9 } : { model: 6, tune: rnd(0, 5), decay: .07, level: .5, dly: rnd(.2, .5), pan: .1 },
      { model: 2, tune: rnd(0, 4), decay: rnd(.03, .05), tone: rnd(.6, .8), level: .42, pan: -.1, choke: 1, eq1f: 500, eq1g: -12, eq4f: 9000, eq4g: 2 },
      { model: 3, decay: rnd(.2, .35), tone: rnd(.55, .75), level: .42, pan: .1, choke: 1, eq1f: 500, eq1g: -12 },
      { engine: 2, fmalgo: 3, fmfreq: rnd(2800, 4200), fmratio: 1.41, fmratio2: rnd(2.3, 3.1), fmindex: rnd(3, 5), fmidec: .2, fmnoise: .3, decay: rnd(.5, 1.1), level: o.ride ? .28 : 0, pan: .25, eq1f: 500, eq1g: -12 },
      { model: 5, tune: rnd(-14, -9), decay: rnd(.6, 1.2), tone: .3, level: .45 * o.rumble, rev: .6, eq1f: 70, eq1g: 4, eq4f: 3000, eq4g: -12 },   // the rumble
      { model: pick([6, 7]), tune: rnd(-3, 5), decay: rnd(.05, .12), level: .38, pan: rnd(-.5, .5), dly: rnd(.2, .45) },
      { engine: 2, fmalgo: pick([0, 1]), fmfreq: rnd(180, 420), fmratio: pick([1, 2, 3.5, 1.5]), fmindex: rnd(2, 6) * o.fm + .5, fmidec: rnd(.05, .15), fmfold: o.fm * .4, decay: rnd(.12, .3), level: .34, pan: rnd(-.4, .4), dly: rnd(.2, .5) },
      { engine: 2, fmalgo: 2, fmfreq: rnd(600, 1400), fmratio: rnd(2.5, 6), fmratio2: rnd(1, 3), fmindex: rnd(3, 8), fmidec: .02, fmnoise: .4, decay: .06, level: .3, pan: rnd(-.6, .6) },
    ];
    const grow = v => {
      const tr = [];
      const kick = {}; for (let k = 0; k < 16; k += 4) kick[k] = { v: 1 }; if (v === 2) kick[14] = { v: .6 }; tr.push({ steps: kick });
      const cl = {}; cl[4] = { v: .9 }; cl[12] = { v: .9 }; if (v) cl[pick([7, 15])] = { v: .5, prob: .6 }; tr.push({ steps: cl });
      const ch = {}; for (let k = 0; k < 16; k++) if (k % 2 || R() < .45) ch[k] = { v: k % 4 === 2 ? .9 : rnd(.4, .7), prob: k % 2 ? 1 : rnd(.5, .9), r: v === 2 && k === 15 ? 3 : 1 }; tr.push({ steps: ch });
      const oh = {}; for (let k = 2; k < 16; k += 4) oh[k] = { v: .8 }; tr.push({ steps: oh });
      const ride = {}; if (o.ride) for (let k = 0; k < 16; k += 2) ride[k] = { v: k % 4 ? .5 : .75 }; tr.push({ steps: ride });
      const rum = {}; for (let k = 0; k < 16; k++) if (k % 4 === 2 || (k % 4 === 3 && R() < .5)) rum[k] = { v: rnd(.5, .8) }; tr.push({ steps: rum });
      const pc = {}, eu = euclid(pick([3, 5, 7]), 16, Math.floor(R() * 16)); eu.forEach((b, k) => { if (b) pc[k] = { v: rnd(.5, .9), p: pick([0, 0, 3, 7, -5]) }; }); tr.push({ len: pick([16, 12, 14]), steps: pc });
      const st = {}, eu2 = euclid(pick([3, 5]), 16, Math.floor(R() * 16)); eu2.forEach((b, k) => { if (b) st[k] = { v: rnd(.6, 1), fm: R() < .5 ? r2(rnd(1, 4)) : 0, fold: R() < .3 ? rnd(.2, .6) : 0, ring: R() < .25 ? [0, 1 << 7, .7, 220] : null }; }); tr.push({ len: pick([16, 15, 13]), steps: st });
      const zz = {}; for (let k = 0; k < 16; k++) if (R() < .25 + v * .1) zz[k] = { v: rnd(.4, .8), r: R() < .3 ? pick([2, 3]) : 1, prob: rnd(.5, 1) }; tr.push({ div: pick([5, 8]), steps: zz });
      return pat(tr);
    };
    kit(name, 'Techno', voices, {
      'dr.swing': rnd(0, .08), 'dr.temper': -rnd(.3, .6), 'dr.dlydiv': pick([4, 2, 7]), 'dr.dlyfb': rnd(.4, .65), 'dr.dlytone': rnd(.3, .6), 'dr.revsize': rnd(.6, .9), 'dr.revdamp': .5,
      'gl.on': 0, 'lfo1.shape': 0, 'lfo1.sync': 1, 'lfo1.div': 0, 'lfo2.shape': 1, 'lfo2.sync': 1, 'lfo2.div': 1, 'lfo3.shape': 4, 'lfo3.sync': 1, 'lfo3.div': 5,
      'sl.on': o.sl ? 1 : 0, 'sl.mix': .85, 'sl.div': 1, 'sl.bars': 1, 'sl.density': .35, 'sl.evolve': .1, 'sl.seed': seed % 100, 'sl.stutter': 2,
      'env.src': 1, 'env.att': .002, 'env.rel': .12, 'env.gain': 3, 'ch.mode': 2, 'ch.rate': rnd(.1, .5),
      'tp.wow': 0, 'tp.flutter': o.tape, 'tp.dust': o.tape * .5,
    }, [grow(0), grow(1), grow(2)], {
      chain: [0, 0, 1, 0, 0, 1, 0, 2],
      slice: SL(prog('TTTTTTTTTTTTTTTTTTTTTTTTTTTTSSRS')),
      wires: [W(0, 't3.decay', .25), W(1, 't8.fmindex', .4 * o.fm), W(3, 't6.level', -.5), W(4, 't7.pan', .5), W(2, 't9.tune', .3), W(0, 't4.eq3g', .3)],
    });
  });

  // =================================================================================== LO-FI & DOWNTEMPO
  const LOFI = [
    ['Rainy Window Tapes', 311, { swing: .32, half: false, tape: [.35, .25, .45], bits: 12 }],
    ['Faded Polaroid', 313, { swing: .28, half: false, tape: [.25, .3, .55], bits: 11 }],
    ['Late Bus Home', 317, { swing: .38, half: true, tape: [.4, .2, .3], bits: 12 }],
    ['Cassette Sunday', 331, { swing: .3, half: false, tape: [.5, .35, .35], bits: 10 }],
    ['Velvet Dusk', 337, { swing: .22, half: true, tape: [.2, .15, .25], bits: 14 }],
    ['Dusty Crate Diggers', 347, { swing: .42, half: false, tape: [.3, .3, .7], bits: 10 }],
    ['Slow Motion City', 349, { swing: .25, half: true, tape: [.45, .25, .2], bits: 13 }],
    ['Tea and Static', 353, { swing: .35, half: false, tape: [.3, .4, .6], bits: 11 }],
    ['Moonlit Cul-de-sac', 359, { swing: .3, half: true, tape: [.6, .3, .4], bits: 12 }],
    ['Warm Analog Haze', 367, { swing: .27, half: false, tape: [.35, .2, .3], bits: 14 }],
  ];
  LOFI.forEach(([name, seed, o], n) => {
    const R = rngOf(seed), rnd = (a, b) => a + (b - a) * R(), pick = a => a[Math.floor(R() * a.length)];
    const lofi = x => Object.assign({ bits: o.bits, rate: pick([22050, 24000, 26000]), eq4f: rnd(5000, 8000), eq4g: rnd(-9, -4) }, x);
    const voices = [
      lofi({ model: 0, tune: rnd(-3, 1), decay: rnd(.45, .7), tone: rnd(.25, .45), snap: rnd(.2, .4), level: .95, eq1f: 80, eq1g: 3 }),
      lofi({ model: 1, tune: rnd(-4, 0), decay: rnd(.25, .4), tone: rnd(.35, .55), snap: rnd(.45, .65), level: .8, rev: rnd(.15, .3), eq2f: 250, eq2g: 3 }),
      lofi({ model: 2, decay: rnd(.04, .07), tone: rnd(.4, .6), level: .38, pan: rnd(.1, .3), choke: 1 }),
      lofi({ model: 3, decay: rnd(.25, .4), tone: .45, level: .3, pan: .2, choke: 1 }),
      lofi({ model: 6, tune: rnd(-2, 3), decay: .08, level: .4, pan: -.25, dly: rnd(.1, .3) }),
      lofi({ model: 4, decay: .3, tone: .4, level: .4, rev: .35, pan: -.1 }),
      lofi({ engine: 2, fmalgo: 0, fmfreq: rnd(250, 500), fmratio: pick([2, 3, 4]), fmindex: rnd(.8, 2), fmidec: rnd(.2, .5), decay: rnd(.6, 1.2), level: .3, dly: .35, rev: .4, pan: .3 }),   // a soft bell / keys hit
      lofi({ engine: 2, fmalgo: 2, fmfreq: rnd(3000, 6000), fmratio: 1.5, fmratio2: 2.3, fmindex: 2, fmidec: .02, fmnoise: .8, decay: rnd(.06, .12), level: .28, pan: rnd(-.4, .4) }),   // shaker
      lofi({ engine: 2, fmalgo: 0, fmfreq: rnd(45, 60), fmratio: .5, fmindex: .8, fmidec: .2, decay: rnd(.8, 1.4), level: .5, sweep: -2, swtime: .3 }),   // sub
    ];
    const notes = pick([[0, 3, 7, 10], [0, 5, 7, 12], [0, 4, 7, 11], [0, 2, 7, 9]]);
    const grow = v => {
      const tr = [];
      const kick = o.half ? { 0: { v: 1 }, 7: { v: .6, prob: .7 }, 10: { v: .8 } } : { 0: { v: 1 }, 7: { v: .7 }, 10: { v: .85 }, [pick([13, 14])]: { v: .5, prob: .5 } };
      if (v) kick[pick([3, 6])] = { v: .45, prob: .6 }; tr.push({ steps: kick });
      tr.push({ steps: o.half ? { 8: { v: .95 } } : { 4: { v: .95 }, 12: { v: .95 }, ...(v ? { 15: { v: .35 } } : {}) } });
      const ch = {}; for (let k = 0; k < 16; k += 2) ch[k] = { v: k % 4 ? .45 : .7 }; for (let k = 1; k < 16; k += 2) if (R() < .35) ch[k] = { v: .3, prob: .6 }; tr.push({ steps: ch });
      tr.push({ steps: { [pick([6, 14])]: { v: .6, prob: .7 } } });
      const rim = {}; for (let k = 0; k < 16; k++) if (R() < .14) rim[k] = { v: rnd(.35, .6), dly: R() < .4 ? .4 : 0 }; tr.push({ steps: rim });
      tr.push({ steps: v === 2 ? { 12: { v: .6 }, 14: { v: .4 } } : {} });
      const key = {}; [0, 6, 10].forEach((k, i) => { if (R() < .8) key[k + (v === 1 && i ? 1 : 0)] = { v: rnd(.5, .8), p: notes[(i + v) % notes.length] - 5, fold: R() < .2 ? .25 : 0 }; }); tr.push({ len: 16, div: o.half ? 2 : 5, steps: key });
      const sh = {}; for (let k = 0; k < 16; k++) if (R() < .5) sh[k] = { v: rnd(.25, .6), prob: rnd(.5, .95) }; tr.push({ len: pick([16, 12]), div: pick([5, 6]), steps: sh });
      tr.push({ steps: { 0: { v: .9, p: notes[0] }, 10: { v: .7, p: notes[v % notes.length] - 12 + 12 } } });
      return pat(tr, 1);
    };
    kit(name, 'Lo-Fi & Downtempo', voices, {
      'dr.swing': o.swing, 'dr.temper': -rnd(.5, .75), 'dr.dlydiv': pick([2, 4]), 'dr.dlyfb': rnd(.3, .5), 'dr.dlytone': rnd(.2, .4), 'dr.revsize': rnd(.5, .75), 'dr.revdamp': .7,
      'gl.on': 0, 'lfo1.shape': 0, 'lfo1.rate': rnd(.05, .2), 'lfo2.shape': 1, 'lfo2.sync': 1, 'lfo2.div': 0, 'lfo3.shape': 4, 'lfo3.sync': 1, 'lfo3.div': 2,
      'sl.on': n % 2, 'sl.mix': .7, 'sl.div': 2, 'sl.bars': 1, 'sl.density': .5, 'sl.evolve': .05, 'sl.seed': seed % 100, 'sl.tape': .9, 'sl.pitch': -12,
      'env.src': 1, 'env.att': .005, 'env.rel': .3, 'env.gain': 2, 'ch.mode': 2, 'ch.rate': .1,
      'tp.wow': o.tape[0], 'tp.flutter': o.tape[1], 'tp.dust': o.tape[2],
    }, [grow(0), grow(1), grow(2)], {
      chain: [0, 1, 0, 2],
      slice: SL(prog('TTTTTTTTTTTTTTXTTTTTTTTTTTTTTTXY')),
      wires: [W(0, 't7.tune', .03), W(4, 't3.tone', .2), W(3, 't9.level', -.4), W(1, 'dr.dlyfb', .15), W(4, 't8.pan', .4)],
    });
  });

  // =================================================================================== HARD TRANCE & PSYTRANCE
  const TRANCE = [
    ['Psy Rolling Forest', 401, { psy: true, root: 0, zap: .8 }],
    ['Full On Morning', 409, { psy: true, root: 2, zap: .6 }],
    ['Hard Trance Anthem', 419, { psy: false, root: 0, zap: .5 }],
    ['Goa Spiral Gate', 421, { psy: true, root: 5, zap: 1 }],
    ['Night Psy Machine', 431, { psy: true, root: -2, zap: .9 }],
    ['Offbeat Hammer', 433, { psy: false, root: 3, zap: .4 }],
    ['Laser Temple', 439, { psy: true, root: 0, zap: .7 }],
    ['Euphoric Stomp', 443, { psy: false, root: 5, zap: .5 }],
    ['Darkpsy Ritual', 449, { psy: true, root: -3, zap: 1 }],
    ['Tranceformer 150', 457, { psy: false, root: -1, zap: .6 }],
  ];
  TRANCE.forEach(([name, seed, o], n) => {
    const R = rngOf(seed), rnd = (a, b) => a + (b - a) * R(), pick = a => a[Math.floor(R() * a.length)];
    const voices = [
      { engine: 2, fmalgo: 0, fmfreq: rnd(48, 58), fmratio: 1, fmindex: rnd(1.5, 3), fmidec: .015, fmfold: rnd(.2, .45), decay: o.psy ? rnd(.22, .3) : rnd(.35, .5), sweep: rnd(28, 40), swtime: rnd(.018, .03), level: 1, snap: .6, eq1f: 60, eq1g: 4, eq2f: 350, eq2g: -5, choke: 2 },
      { model: 4, decay: rnd(.25, .4), tone: .55, snap: .75, level: .72, rev: rnd(.25, .4), eq1f: 220, eq1g: -10 },
      { model: 2, tune: 3, decay: .035, tone: .8, level: .4, pan: -.15, eq1f: 500, eq1g: -12, choke: 1 },
      { model: 3, tune: 2, decay: rnd(.12, .2), tone: .8, level: .5, pan: .15, eq1f: 500, eq1g: -12, choke: 1 },
      { engine: 2, fmalgo: 3, fmfreq: 3600, fmratio: 1.41, fmratio2: 2.6, fmindex: 4, fmidec: .15, fmnoise: .3, decay: .45, level: .26, pan: .3, eq1f: 500, eq1g: -12 },
      { engine: 2, fmalgo: 1, fmfreq: rnd(800, 1600), fmratio: rnd(2, 6), fmratio2: rnd(.5, 2), fmindex: rnd(6, 14) * o.zap, fmidec: rnd(.05, .2), fmfb: rnd(.1, .5), decay: rnd(.12, .25), level: .3, pan: rnd(-.5, .5), dly: .4, sweep: pick([-24, 24, 12]), swtime: .08 },   // zaps
      { model: 6, tune: 4, decay: .05, level: .4, pan: -.35, dly: .35 },
      { engine: 2, fmalgo: 0, fmfreq: rnd(400, 900), fmratio: pick([2, 3, 1.5]), fmindex: rnd(3, 7), fmidec: rnd(.08, .2), fmfold: rnd(.2, .5), decay: .25, level: .3, dly: .45, rev: .3, pan: .3 },   // stab
      { engine: 2, fmalgo: 0, fmfreq: 55 * Math.pow(2, o.root / 12), fmratio: pick([.5, 1]), fmindex: rnd(2.5, 5), fmidec: rnd(.04, .08), fmfold: rnd(.15, .4), decay: o.psy ? .1 : .16, level: .62, eq1f: 50, eq1g: -6, eq2f: 140, eq2g: 3, choke: 2 },   // bass
    ];
    const grow = v => {
      const tr = [];
      const kick = {}; for (let k = 0; k < 16; k += 4) kick[k] = { v: 1 }; tr.push({ steps: kick });
      tr.push({ steps: { 4: { v: .9 }, 12: { v: .9 }, ...(v === 2 ? { 14: { v: .6, r: 2 }, 15: { v: .7, r: 3 } } : {}) } });
      const ch = {}; for (let k = 0; k < 16; k++) if (k % 4 !== 2) ch[k] = { v: k % 2 ? .45 : .65, prob: k % 4 === 3 ? rnd(.6, 1) : 1 }; tr.push({ steps: ch });
      const oh = {}; for (let k = 2; k < 16; k += 4) oh[k] = { v: .9 }; tr.push({ steps: oh });
      const ride = {}; if (!o.psy || v) for (let k = 0; k < 16; k += 2) ride[k] = { v: .5 }; tr.push({ steps: ride });
      const zap = {}; for (let k = 0; k < 16; k++) if (R() < (o.psy ? .3 : .15) + v * .08) zap[k] = { v: rnd(.5, .9), p: pick([0, 7, 12, -5, 3]), fm: R() < .5 ? r2(rnd(1, 6)) : 0, fold: R() < .3 ? rnd(.3, .8) : 0, ring: R() < .2 ? [8, 1 << 5, .7, 220] : null }; tr.push({ div: pick([5, 6]), len: pick([16, 12, 14]), steps: zap });
      const rim = {}; [3, 11].forEach(k => { if (R() < .6) rim[k + v % 2] = { v: .5 }; }); tr.push({ steps: rim });
      const stab = {}; if (!o.psy) [2, 6, 10, 14].forEach(k => { if (R() < .55) stab[k] = { v: .8, p: pick([0, 3, 7, 12]) }; }); else if (v) stab[pick([2, 10])] = { v: .7, ring: [9, 1 << 7, .6, 660] }; tr.push({ steps: stab });
      const bass = {};
      for (let b = 0; b < 4; b++) {
        if (o.psy) [1, 2, 3].forEach((x, j) => { bass[b * 4 + x] = { v: j === 0 ? .95 : .8, p: (b === 3 && j === 2 && v) ? 12 : (j === 2 && R() < .3 ? 7 : 0) }; });   // rolling: kick-bass-bass-bass
        else bass[b * 4 + 2] = { v: .95, p: (b === 3 && v) ? pick([3, 5, 7]) : 0 };   // hard trance offbeat
      }
      tr.push({ steps: bass });
      return pat(tr);
    };
    kit(name, o.psy ? 'Psytrance' : 'Hard Trance', voices, {
      'dr.swing': 0, 'dr.temper': -rnd(.35, .6), 'dr.dlydiv': pick([4, 7, 2]), 'dr.dlyfb': rnd(.4, .6), 'dr.dlypp': 1, 'dr.revsize': rnd(.6, .85),
      'gl.on': n % 4 === 1 ? 1 : 0, 'gl.mode': 0, 'gl.mix': .3, 'gl.size': .2,
      'lfo1.shape': 0, 'lfo1.sync': 1, 'lfo1.div': 0, 'lfo2.shape': 2, 'lfo2.sync': 1, 'lfo2.div': 3, 'lfo3.shape': 4, 'lfo3.sync': 1, 'lfo3.div': 5,
      'sl.on': 1, 'sl.mix': .9, 'sl.div': 1, 'sl.bars': 1, 'sl.density': 1, 'sl.evolve': .05, 'sl.seed': seed % 100, 'sl.stutter': pick([2, 4]), 'sl.tape': .6, 'sl.pitch': 12,
      'env.src': 1, 'env.att': .001, 'env.rel': .08, 'env.gain': 4, 'ch.mode': 0, 'ch.rate': rnd(1, 4),
      'tp.wow': 0, 'tp.flutter': 0, 'tp.dust': 0,
    }, [grow(0), grow(1), grow(2)], {
      chain: [0, 1, 0, 1, 0, 1, 0, 2],
      slice: SL(prog(o.psy ? 'TTTTTTTTTTTTTTTTTTTTTTTTTTTTSSSS' : 'TTTTTTTTTTTTTTTTTTTTTTTTTTTTSSRP')),
      wires: [W(1, 't6.fmindex', .45), W(4, 't6.pan', .6), W(0, 't8.fmfold', .3), W(2, 't9.fmindex', .25), W(3, 't9.level', o.psy ? 0 : -.3), W(4, 't5.eq4g', .3)].filter(w => w.a),
    });
  });
})();
