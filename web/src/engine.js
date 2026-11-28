/* ============================================================ VEKTUR DRUM — drum engine + step sequencer (web build)
   Started as Vektur VJ's Vektur Pulse engine (a port of native/Shared/DSP/Drums.h); with every new feature off it
   still renders Vektur Pulse sample for sample (tests/parity.test.js). New in Vektur Drum:
   · 12 tracks (kT from the note table; 9 before 0.9), of which the project plays 6–12   · per-track engine: drum synth, sample or FM
   · NEW (0.9): per-track METALISE and RESAMPLE (six sampler models, four transient modes), sliced samples (any step plays
     any slice: pitch, gate, reverse, stutter, attack; reverse / stutter chance), Break Lab slice pads, each pattern's Slicer
   · per-track pitch sweep · choke groups A–D (replace the fixed closed→open hat choke)
   · FM voice: 3 operators, 4 algorithms, feedback, index envelope, wavefolder, noise; per-step modulator ratio
   · global glitch (stutter, reverse, metallic time-stretch) with 3 LFOs
   · modulation: 5 sources (LFO 1–3, envelope follower, chaos) → up to 32 wires to any dial
   · per-step ring modulation (a master track or oscillator × chosen slave tracks, for the step's length)
   · Slicer: beat-synced rearranging of the whole output (repeat, stutter, reverse, tape stop/start, pitch,
     speed, gate, permute, scratch, echo), with density, evolve, seed and momentary hold
   · per-step wavefolder · 4-band EQ per track (low shelf, 2 peaks, high shelf; every gain and frequency modulatable)
   · global tape wow, flutter and vinyl dust (after the Slicer)
   · Rate at its top is "off" at any sample rate (Pulse held 96 kHz to 48 kHz) */
function drumsMakeEngine(PARAMS, DIVB, NOTES, DEF_DIV) {
  const N = PARAMS.length, kT = NOTES.length, kS = 16, kP = 8, kC = 16, kCR = 16, kPi = Math.PI, ND = DIVB.length;
  const PMIN = new Float32Array(N), PMAX = new Float32Array(N), PDEF = new Float32Array(N), PSM = new Uint8Array(N), ID = {};
  PARAMS.forEach((p, i) => { ID[p[0]] = i; PMIN[i] = p[4]; PMAX[i] = p[5]; PDEF[i] = p[6]; PSM[i] = p[3] === 'cont' ? 1 : 0; });
  const T1 = ID['t1.model'], TSTRIDE = ID['t2.model'] - ID['t1.model'];
  const CH = ID['dr.ch'], SWING = ID['dr.swing'], TEMPER = ID['dr.temper'], HUMAN = ID['dr.human'], LEVEL = ID['dr.level'], CHOKE = ID['dr.choke'],
    DLYDIV = ID['dr.dlydiv'], DLYFB = ID['dr.dlyfb'], DLYTONE = ID['dr.dlytone'], DLYPP = ID['dr.dlypp'], REVSIZE = ID['dr.revsize'], REVDAMP = ID['dr.revdamp'];
  // new per-track template indices (after Pulse's 15) and the glitch / LFO block
  const K = k => ID['t1.' + k] - T1;
  const K_ENGINE = K('engine'), K_CHOKE = K('choke'), K_SWEEP = K('sweep'), K_SWTIME = K('swtime'), K_ALGO = K('fmalgo'),
    K_FREQ = K('fmfreq'), K_RATIO = K('fmratio'), K_RATIO2 = K('fmratio2'), K_INDEX = K('fmindex'), K_IDEC = K('fmidec'),
    K_FB = K('fmfb'), K_FOLD = K('fmfold'), K_NOISE = K('fmnoise');
  const K_METAL = K('metal'), K_RSMP = K('rsmp'), K_RSMODE = K('rsmode'), K_RSSENS = K('rssens'), K_SMODEL = K('smodel'), K_SLICE = K('slice'), GL_METAL = ID['gl.metal'];   // NEW (0.9)
  const SLF = 11;
  const K_LONG = K('long'), GL_CH = ID['gl.chance'], GL_CHD = ID['gl.chdiv'], GL_CHB = [0.25, 0.5, 1, 4];   // NEW (0.9.1): long sounds, Metalise chance
  const LPTS = 16;   // NEW (0.9.1): points of a drawn LFO shape   // slice record: start, length, pitch st, gain, pan, attack s, gate 0…1, reverse, stutter repeats, stutter s, Metalise (−1 = track)
  const K_EQ = [1, 2, 3, 4].map(b => [K(`eq${b}f`), K(`eq${b}g`)]);   // per band: frequency, gain
  const TP_WOW = ID['tp.wow'], TP_FL = ID['tp.flutter'], TP_DUST = ID['tp.dust'];
  const REVTYPE = ID['dr.revtype'], IN_LEVEL = ID['in.level'], IN_DLY = ID['in.dly'], IN_REV = ID['in.rev'], IN_DRUMS = ID['in.drums'];
  // NEW (0.8): per-step pitch shifter and spectral processor — sizes
  const PSN = 4096, SPN = 256, SPH = 64, SPK = SPN / 2 + 1, SPLOG = 8;
  // FFT (radix 2, in place) — the same algorithm and tables in DrumEngine.hpp, for sample-identical output
  const FFT_COS = new Float64Array(SPN / 2), FFT_SIN = new Float64Array(SPN / 2), FFT_REV = new Uint16Array(SPN), SP_WIN = new Float64Array(SPN);
  for (let i = 0; i < SPN / 2; i++) { FFT_COS[i] = Math.cos(2.0 * kPi * i / SPN); FFT_SIN[i] = Math.sin(2.0 * kPi * i / SPN); }
  for (let i = 0; i < SPN; i++) { let r = 0; for (let b = 0; b < SPLOG; b++) if (i & (1 << b)) r |= 1 << (SPLOG - 1 - b); FFT_REV[i] = r; SP_WIN[i] = 0.5 - 0.5 * Math.cos(2.0 * kPi * i / SPN); }
  function fft(re, im, inv) {
    for (let i = 0; i < SPN; i++) { const j = FFT_REV[i]; if (j > i) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } }
    for (let len = 2; len <= SPN; len <<= 1) {
      const half = len >> 1, st = SPN / len;
      for (let i = 0; i < SPN; i += len) for (let k = 0; k < half; k++) {
        const wr = FFT_COS[k * st], wi = inv ? FFT_SIN[k * st] : -FFT_SIN[k * st], a = i + k, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
  const GL_ON = ID['gl.on'], GL_MODE = ID['gl.mode'], GL_MIX = ID['gl.mix'], GL_SIZE = ID['gl.size'], GL_SPEED = ID['gl.speed'];
  const LF = [1, 2, 3].map(n => ['rate', 'shape', 'depth', 'dest', 'sync', 'div'].map(k => ID[`lfo${n}.${k}`]));
  const LDIV = [16, 8, 4, 2, 1, 0.5, 0.25], GL_SLICE = [0.125, 0.25, 0.5, 1, 2];   // LFO divisions, stutter slices (beats)
  const SL = ['on', 'mix', 'div', 'bars', 'density', 'evolve', 'seed', 'speed', 'stutter', 'tape', 'pitch', 'hold'].map(k => ID['sl.' + k]);
  const [SL_ON, SL_MIX, SL_DIV, SL_BARS, SL_DEN, SL_EVO, SL_SEED, SL_SPEED, SL_STUT, SL_TAPE, SL_PITCH, SL_HOLD] = SL;
  const ENV_SRC = ID['env.src'], ENV_ATT = ID['env.att'], ENV_REL = ID['env.rel'], ENV_GAIN = ID['env.gain'], CH_MODE = ID['ch.mode'], CH_RATE = ID['ch.rate'];
  const SLDIVB = [0.125, 0.25, 0.5, 1], SLSTUT = [2, 3, 4, 6, 8], SLHOLD = [0, 2, 3, 4, 6, 8, 10];   // hold → action
  const NSLOT = 32, NWIRE = 32, NSRC = 5, RINGOSC = 12;   // 0.9: ring master 0–11 = a track, 12 = the oscillator
  // NEW (0.9) vintage sampler models for RESAMPLE: bits, converter rate, reconstruction (0 hold, 1 linear, 2 drop-sample),
  // input filter (× rate), emphasis, converter curve, noise. Generic descriptions — no product names.
  const SMODELS = [[12, 26040, 0, .42, .55, .35, .0006], [12, 40000, 1, .45, .35, .25, .0004], [16, 44100, 1, .47, .15, .08, .00005],
    [16, 32000, 1, .44, .25, .12, .0001], [8, 22050, 2, .4, .6, .5, .002], [8, 11025, 0, .38, .7, .6, .003]];
  const PLOG = new Uint8Array(N); PARAMS.forEach((p, i) => { PLOG[i] = p[7] === 'log' ? 1 : 0; });
  const normP = (i, v) => { const mn = PMIN[i], mx = PMAX[i]; if (PLOG[i]) return mn > 0 ? Math.log(v / mn) / Math.log(mx / mn) : Math.cbrt(clampd(v / mx, 0.0, 1.0)); return (v - mn) / (mx - mn); };
  const denormP = (i, t) => { const mn = PMIN[i], mx = PMAX[i]; t = clampd(t, 0.0, 1.0); if (PLOG[i]) return mn > 0 ? mn * Math.pow(mx / mn, t) : mx * t * t * t; return mn + t * (mx - mn); };
  const clampd = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lround = x => x < 0 ? -Math.round(-x) : Math.round(x);   // C lround / round: halves away from zero
  const ftz = x => Math.abs(x) < 1e-18 ? 0.0 : x;
  const xs = s => { let x = s[0]; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; s[0] = x; return x; };
  const FDN_RATE = new Float64Array([0.11, 0.13, 0.17, 0.19, 0.23, 0.29, 0.31, 0.37]);   // Expanse: modulation rates (Hz)
  const kMetal = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
  class Svf {
    constructor() { this.ic1 = 0.0; this.ic2 = 0.0; this.a1 = 0.0; this.a2 = 0.0; this.a3 = 0.0; this.k = 1.0; this.lp = 0.0; this.bp = 0.0; this.hp = 0.0; }
    set(fc, q, sr) { const g = Math.tan(kPi * clampd(fc, 20.0, sr * 0.45) / sr); this.k = 1.0 / q; this.a1 = 1.0 / (1.0 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2; }
    reset() { this.ic1 = this.ic2 = 0.0; }
    run(v0) { const v3 = v0 - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
      this.ic1 = 2.0 * v1 - this.ic1; this.ic2 = 2.0 * v2 - this.ic2; this.lp = v2; this.bp = v1; this.hp = v0 - this.k * v1 - v2; }
  }
  const newVoice = () => ({ active: false, model: 0, t: 0.0, amp: 0.0, ampK: 1.0, pe: 0.0, peK: 1.0, ck: 0.0, ckK: 1.0, choke: 1.0,
    ph: new Float64Array(6), vel: 1.0, sl: -1, s0: 0, sLen: 1, sG: 1.0, sAtt: 1, sGate: 2, sRel: 1, sRev: false, stN: 0, stL: 32, stC: 0, swE: 0.0, swK: 1.0, stepRatio: 0.0, fcInc: 0.0, m1Inc: 0.0, m2Inc: 0.0, fmI: 0.0, ie: 0.0, ieK: 1.0, fmFb: 0.0, fmFold: 0.0, fmN: 0.0, fmAlgo: 0, sf: 0.0, m1y: 0.0, m1y2: 0.0, pan: 0.0, pitch: 0.0, ratio: 1.0, bph: 0.0, hold: 0.0, holdPh: 0.0, out: 0.0, gl: 0.0, gr: 0.0, cq: 0.0, sdly: 0.0, srev: 0.0, spos: 0.0, slp: 0.0, slpA: 1.0, f1: new Svf(), f2: new Svf() });
  const kSF = 25;   // per step (0.9: + Metalise, slice, reverse chance, stutter chance — fields 21–24): on, velocity, pan, pitch, ratchet, crush, delay send, reverb send, probability, FM ratio (0 = track's),
                     //           ring on, ring master (0–11 track, 12 oscillator), ring slaves (bit mask), ring amount, ring oscillator Hz, fold,
                     //           pitch shift (st, 0 = off), shift mix, spectral (0 = off), spectral colour, spectral mix
  class Drums {
    constructor(rate) {
      this.target = Float32Array.from(PDEF); this.sm = Float64Array.from(PDEF);
      this.step = new Float32Array(kP * kT * kS * kSF);
      for (let i = 0; i < kP * kT * kS; i++) { this.step[i * kSF + 1] = 0.8; this.step[i * kSF + 4] = 1; this.step[i * kSF + 8] = 1; } for (let i = 0; i < kP * kT * kS; i++) { this.step[i * kSF + 11] = RINGOSC; this.step[i * kSF + 14] = 220; this.step[i * kSF + 17] = 1; this.step[i * kSF + 20] = 1; this.step[i * kSF + 21] = -1; }   // ring oscillator, shift mix, spectral mix defaults
      this.smp = new Array(kT).fill(null);   // each track's imported sample: { d: Float32Array (mono), rate }
      this.trkLen = new Int32Array(kP * kT).fill(kS); this.trkDiv = new Int32Array(kP * kT).fill(DEF_DIV); this.patBars = new Int32Array(kP).fill(1);
      this.chain = new Int32Array(kC); this.chainN = 0; this.chainOn = 0; this.want = 0; this.jumpReq = 0; this.playReq = -1; this.recOn = 0;
      this.enabledFlag = 0; this.tempo = Math.fround(120); this.hostBeat = 0.0; this.beatSerial = 0;
      this.tel = new Float32Array(4 + 3 * kT + 3 + NSRC + 2 + 2 * NWIRE); this.recQ = []; this.nTr = kT;   // … + modulated dials: [dense index, position] × 32
      this.hOff = new Float64Array(kT); this.hrng = new Uint32Array([0x6C8E9CF5]); this.cHum = 0.0;   // HUMANISE: the pending step's offset (beats), its own PRNG
      this.tmS = 0.0; this.tmLive = false; this.tmSr = 0; this.tmA = 0.0; this.tmFa = 0.0; this.tmSa = 0.0; this.tmR = 0.0; this.tmLa = 0.0;   // TEMPER
      this.tmF = 0.0; this.tmSl = 0.0; this.tmLp = new Float64Array(2);
      this.sr = 48000.0; this.beat = 0.0; this.beatSeen = 0; this.crCount = 0;
      this.wasEnabled = false; this.running = false; this.waiting = false; this.startAt = 0.0; this.patStart = 0.0; this.cur = 0; this.chainPos = 0;
      this.nextIdx = new Float64Array(kT); this.nextBeat = new Float64Array(kT); this.skipIdx = new Float64Array(kT);
      this.ratLeft = new Int32Array(kT); this.ratNext = new Float64Array(kT); this.ratDt = new Float64Array(kT); this.ratVel = new Float64Array(kT); this.ratPan = new Float64Array(kT); this.ratPitch = new Float64Array(kT);
      this.ratFx = new Float64Array(kT * 3); this.ratFm = new Float64Array(kT); this.ratFold = new Float64Array(kT); this.prng = new Uint32Array([0x9E3779B9]);
      this.hits = new Float32Array(kT); this.v = []; for (let t = 0; t < kT; t++) this.v.push(newVoice());
      this.rng = new Uint32Array([0x1234567]);
      this.store = null; this.dly = [null, null]; this.rvC = []; this.rvA = []; this.dlyLen = 0; this.dlyPos = 0;
      this.rvCL = new Int32Array(16); this.rvAL = new Int32Array(8); this.rvCP = new Int32Array(16); this.rvAP = new Int32Array(8);
      this.dlyT = 0.0; this.dlyLp = new Float64Array(2); this.rvF = new Float64Array(16); this.dcX = new Float64Array(2); this.dcY = new Float64Array(2); this.outEnv = 0.0; this.quiet = 0;
      this.o2 = new Float64Array(6);
      // glitch: 2.2 s history (written always, so a glitch engages on what just played), LFOs, mode state
      this.gb = [null, null]; this.gbLen = 0; this.gw = 0; this.gAbs = 0;
      this.lfoPh = new Float64Array(3); this.lfoHold = new Float64Array(3); this.lfoV = new Float64Array(3); this.lrng = new Uint32Array([0x2545F491]);
      // modulation: effective values (smoothed + wires), sources, wires
      this.mv = new Float64Array(N); this.mv.set(this.sm); this.srcV = new Float64Array(NSRC);
      this.wSrc = new Int8Array(NWIRE); this.wDst = new Int16Array(NWIRE).fill(-1); this.wAmt = new Float64Array(NWIRE);
      this.wired = new Uint8Array(N); this.modOff = new Float64Array(N); this.modList = new Int16Array(NWIRE); this.nMod = 0;
      this.envPk = 0.0; this.envV = 0.0; this.chX = 0.1; this.chY = 0.0; this.chZ = 0.0; this.chL = 0.5; this.chPh = 0.0; this.chOut = 0.0; this.chrng = new Uint32Array([0x6C078965]);
      // per-step ring modulation (one ring at a time: the latest ring step)
      this.yr = new Float64Array(kT); this.act = new Uint8Array(kT);
      // per-track EQ: biquads (transposed direct form II), 4 bands × 2 states × kT tracks
      // NEW (0.8): per-track pitch shifter (two-tap granular delay) and spectral processor (STFT 256 / hop 64)
      this.nx = new Float64Array(9); this.ratNx = new Float64Array(kT * 9);   // step fields 16–24 (shift, spectral, Metalise, slice, reverse / stutter chance)
      this.patSl = new Int8Array(kP).fill(-1);
      this.lfoTab = new Float64Array(3 * LPTS); for (let i = 0; i < 3 * LPTS; i++) this.lfoTab[i] = Math.sin(2.0 * kPi * (i % LPTS) / LPTS);   // NEW (0.9.1): drawn LFO shapes (default: a sine)
      this.glrng = new Uint32Array([0x6A09E667]); this.glChK = -1e9; this.glChOn = true;   // NEW (0.9.1): Metalise chance   // NEW (0.9): each pattern's Slicer (−1 follows SLICER, 0 off, 1 on)
      this.brng = new Uint32Array([0x51ED270B]);   // reverse / stutter chance: their own PRNG (no draw when both are 0)
      // NEW (0.9) per-track METALISE and RESAMPLE state; slots kT, kT+1 = the master Metalise (L, R)
      this.mtS = new Float64Array(kT); this.rsQ = new Uint32Array(kT).fill(0x2545F491); this.cGm = false; this.mtSrc = new Float64Array(kT).fill(-1); this.mtOn = new Uint8Array(kT); this.rsOn = new Uint8Array(kT);
      this.mt = Array.from({ length: kT + 2 }, () => ({ ef: 0, es: 0, pe: 0, de: 0, ph: 1, h0: 0, h1: 0, c1: new Float64Array(256), c2: new Float64Array(256), cp: 0 }));
      this.rs = Array.from({ length: kT }, () => ({ ef: 0, es: 0, ph: 0, prev: 0, d0x: 0, d1x: 0, h0: 0, h1: 0, a1: 0, a2: 0, b0: 0, b1: 0, b2: 0, o1: 0, o2: 0, pe: 0, de: 0, lp: 0, tm: 1e9, was: 0, a: 0, mode: 0, st: 1, q: 1, em: 0, cv: 0, nz: 0, sat: 0, wm: 0, thr: 2, lpA: 1, interp: 1, bits: 24, R: 48000 }));
      for (const m of this.mt) { m.a = 0; m.st = 1; m.q = 32768; m.zm = 0; m.k = 0; m.fb = 0.25; m.L1 = 54; m.L2 = 82; m.cv = 0; m.cm = 0; }
      this.psBuf = new Float64Array(kT * PSN); this.psW = new Int32Array(kT); this.psPh = new Float64Array(kT); this.psOn = new Uint8Array(kT);
      this.psSt = new Float64Array(kT); this.psMix = new Float64Array(kT); this.psWin = 1440;
      this.spOn = new Uint8Array(kT); this.spA = new Float64Array(kT); this.spC = new Float64Array(kT); this.spMix = new Float64Array(kT);
      this.spIn = new Float64Array(kT * SPN); this.spDry = new Float64Array(kT * SPN); this.spOut = new Float64Array(kT * SPN); this.spPos = new Int32Array(kT); this.spCnt = new Int32Array(kT);
      this.spMag = new Float64Array(kT * SPK); this.spPh = new Float64Array(kT * SPK); this.spFirst = new Uint8Array(kT); this.spTail = new Int32Array(kT);
      this.spRe = new Float64Array(SPN); this.spIm = new Float64Array(SPN); this.spM = new Float64Array(SPK); this.spT = new Float64Array(SPK); this.sprng = new Uint32Array([0x2545F491]);
      this.fxTail = new Int32Array(kT);
      // NEW (0.8): reverb types — Spring (dispersive allpass loops), Gate (dense room + gate), Expanse (8-line FDN up to a freeze)
      this.rvType = -1; this.spgAp = new Float64Array(2 * 16); this.spgLen = 0; this.spgBuf = [null, null]; this.spgPos = 0; this.spgLp = new Float64Array(2);
      this.gtEnv = 0.0; this.gtHold = 0; this.gtG = 0.0;
      this.fdnLen = new Int32Array(8); this.fdnMax = 0; this.fdnBuf = null; this.fdnPos = 0; this.fdnLp = new Float64Array(8); this.fdnPh = new Float64Array(8);
      this.xpG = new Float64Array(8); this.xpFz = 0.0; this.xpScale = 1.0; this.xpDepth = 0.0; this.xpDk = 0.0; this.xpAp = [null, null, null, null]; this.xpApL = new Int32Array(4); this.xpApP = new Int32Array(4); this.xpLast = new Float64Array(8);
      this.eqOn = new Uint8Array(kT * 4); this.eqC = new Float64Array(kT * 4 * 5); this.eqZ = new Float64Array(kT * 4 * 2);
      // tape and vinyl
      this.tb = [null, null]; this.tbLen = 0; this.tw = 0; this.wowPh = 0.0; this.flPh = 0.0; this.fl2Ph = 0.0; this.wD = 0.0;
      this.popL = 0.0; this.popR = 0.0; this.hissL = 0.0; this.hissR = 0.0; this.tprng = new Uint32Array([0x51ED270B]); this.popK = 0.0;
      this.rOn = false; this.rMaster = 0; this.rMask = 0; this.rAmt = 0.0; this.rHz = 220.0; this.rEnd = 0.0; this.rPh = 0.0; this.rS = 0.0; this.rEnv = 0.0;
      // Slicer: program, history, cycle state
      this.slAct = new Uint8Array(NSLOT); this.slSrc = new Uint8Array(NSLOT); for (let i = 0; i < NSLOT; i++) this.slSrc[i] = i;
      this.sb = [null, null]; this.sbLen = 0; this.sw = 0; this.sAbs = 0.0; this.curSt = new Float64Array(NSLOT).fill(-1); this.prevSt = new Float64Array(NSLOT).fill(-1);
      this.sCyc = -1; this.sIdx = -1; this.sAct = 0; this.sSrc = 0; this.sStart = 0.0; this.sL = 1.0; this.sMixS = 0.0; this.sHold = 0; this.slrng = new Uint32Array([1]);
      this.sLastP = -1.0; this.sLastG = 1.0; this.dclL = 0.0; this.dclR = 0.0; this.dclN = 0;
      this.cTape = false; this.cDust = false; this.cRevType = 0; this.cInDrums = true; this.cSlOn = false; this.cSlMix = 0.0; this.cSlDiv = 1; this.cSlBars = 0; this.cSlDen = 1.0; this.cSlEvo = 0.0; this.cSlSeed = 1; this.cSlSpeed = 0.5;
      this.cSlStut = 2; this.cSlTape = 0.8; this.cSlPitch = -12; this.cSlHold = 0;
      this.cGlOn = false; this.cGlMode = 0; this.cGlMix = 0.0; this.cGlSize = 0.0; this.cGlSpeed = 0.0; this.gMixS = 0.0; this.gModeNow = -1;
      this.gCap = -1; this.gStart = 0; this.gLen = 1; this.gPos = 0.0; this.gSrc = 0.0; this.gi = 0; this.gG = 0;
      // control-rate caches (inputs only change in control(): bit-identical to computing them per sample)
      this.cMute = new Uint8Array(kT); this.cSolo = new Uint8Array(kT); this.cAnySolo = false; this.cPP = true;
      this.cBits = new Int32Array(kT); this.cBitsQ = new Float64Array(kT); this.cRate = new Float64Array(kT);
      this.cDlyGlide = 0.0; this.cLpA = 0.0; this.cDsec = 0.1; this.cBpm = 120.0; this.cDiv = 0; this.fxZero = 0;
      this.prepare(rate);
    }
    prepare(rate) {
      this.sr = rate > 0 ? rate : 48000.0; const sr = this.sr;
      const kComb = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], kAp = [556, 441, 341, 225];
      this.dlyLen = Math.ceil(sr * 3.05) + 4;
      let total = 2 * this.dlyLen;
      for (let c = 0; c < 2; c++) {
        for (let k = 0; k < 8; k++) { this.rvCL[c * 8 + k] = Math.max(8, lround((kComb[k] + c * 23) * sr / 44100.0)); total += this.rvCL[c * 8 + k]; }
        for (let k = 0; k < 4; k++) { this.rvAL[c * 4 + k] = Math.max(8, lround((kAp[k] + c * 23) * sr / 44100.0)); total += this.rvAL[c * 4 + k]; }
      }
      this.store = new Float64Array(total);
      this.gbLen = Math.ceil(sr * 2.2) + 4; this.gb = [new Float32Array(this.gbLen), new Float32Array(this.gbLen)];
      this.sbLen = Math.ceil(sr * 14.0) + 4; this.sb = [new Float32Array(this.sbLen), new Float32Array(this.sbLen)];   // slicer: 2 bars + a slice at 40 BPM
      this.ringK = 1.0 - Math.exp(-1.0 / (0.002 * sr)); this.rEnvK = Math.exp(-1.0 / (0.02 * sr));
      this.tbLen = Math.ceil(sr * 0.02) + 4; this.tb = [new Float64Array(this.tbLen), new Float64Array(this.tbLen)]; this.popK = Math.exp(-1.0 / (0.00025 * sr));
      this.psWin = Math.min(PSN - 8, lround(0.03 * sr));
      this.spgLen = lround(0.045 * sr) + 4; this.spgBuf = [new Float64Array(this.spgLen), new Float64Array(lround(this.spgLen * 1.13) + 4)];
      const fdnMs = [89.7, 113.3, 137.9, 163.1, 191.3, 223.7, 251.9, 283.7]; for (let i = 0; i < 8; i++) this.fdnLen[i] = lround(fdnMs[i] * 0.001 * sr);
      this.fdnMax = lround(0.2837 * 2.2 * sr) + 64; this.fdnBuf = new Float64Array(8 * this.fdnMax);
      [142, 107, 379, 277].forEach((n, i) => { this.xpApL[i] = Math.max(8, lround(n * sr / 44100.0)); this.xpAp[i] = new Float64Array(this.xpApL[i]); });
      let q = 0; const sub = n => { const a = this.store.subarray(q, q + n); q += n; return a; };
      for (let c = 0; c < 2; c++) this.dly[c] = sub(this.dlyLen);
      for (let c = 0; c < 2; c++) { for (let k = 0; k < 8; k++) this.rvC[c * 8 + k] = sub(this.rvCL[c * 8 + k]); for (let k = 0; k < 4; k++) this.rvA[c * 4 + k] = sub(this.rvAL[c * 4 + k]); }
      this.clearFx();
      for (let i = 0; i < N; i++) this.sm[i] = this.target[i];
      if (this.mv) this.mv.set(this.sm);
      for (let t = 0; t < kT; t++) this.v[t] = newVoice();
    }
    clearFx() {
      if (this.store) this.store.fill(0);
      this.dlyPos = 0; this.dlyLp[0] = this.dlyLp[1] = 0.0; this.rvF.fill(0); this.rvCP.fill(0); this.rvAP.fill(0);
      this.dcX[0] = this.dcX[1] = this.dcY[0] = this.dcY[1] = 0.0; this.quiet = 0; this.tmLive = false; this.hOff.fill(0);
      this.fxZero = this.dlyLen + 1;   // buffers are all zero now
      if (this.gb[0]) { this.gb[0].fill(0); this.gb[1].fill(0); } this.gw = 0; this.gAbs = 0; this.gMixS = 0.0; this.gModeNow = -1;
      if (this.sb[0]) { this.sb[0].fill(0); this.sb[1].fill(0); } this.sw = 0; this.sAbs = 0.0; this.sMixS = 0.0; this.sCyc = -1; this.sIdx = -1; this.sHold = 0;
      this.sLastP = -1.0; this.dclL = this.dclR = 0.0; this.dclN = 0;
      this.rS = 0.0; this.rOn = false; this.rEnv = 0.0;
      this.eqZ.fill(0); this.eqOn.fill(0);
      for (const m of this.mt) this.metalReset(m); for (const q of this.rs) this.rsReset(q); this.rsOn.fill(0); this.mtOn.fill(0); this.mtS.fill(0); this.cGm = false;
      this.psBuf.fill(0); this.psOn.fill(0); this.spOn.fill(0); this.spIn.fill(0); this.spDry.fill(0); this.spOut.fill(0); this.spMag.fill(0); this.fxTail.fill(0);
      this.rvClear();
      if (this.tb[0]) { this.tb[0].fill(0); this.tb[1].fill(0); } this.tw = 0; this.popL = this.popR = this.hissL = this.hissR = 0.0;
    }
    // ---- API (main thread → worklet messages, or direct in tests)
    /** One message of the drum protocol ([op, ...args]): the worklet and the offline export (export.js) both use it. */
    op(a) {
      const r = this, o = a[0];
      if (o === 'p') r.setParam(a[1], a[2]); else if (o === 'ps') for (let i = 0; i < a[1].length; i++) r.setParam(i, a[1][i]);
      else if (o === 's') { r.setStep(a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]); if (a.length > 9) r.setStepFx(a[1], a[2], a[3], a[9], a[10], a[11], a[12]); if (a.length > 13) r.setStepFm(a[1], a[2], a[3], a[13]); if (a.length > 18) r.setStepRing(a[1], a[2], a[3], a[14], a[15], a[16], a[17], a[18]); if (a.length > 19) r.setStepFold(a[1], a[2], a[3], a[19]); if (a.length > 24) r.setStepShift(a[1], a[2], a[3], a[20], a[21], a[22], a[23], a[24]); if (a.length > 28) r.setStepMetal(a[1], a[2], a[3], a[25], a[26], a[27], a[28]); }
      else if (o === 'w') r.setSample(a[1], a[2], a[3], a[4]); else if (o === 'k') r.setTrack(a[1], a[2], a[3], a[4]);
      else if (o === 'b') r.setBars(a[1], a[2]); else if (o === 'c') r.setChain(a[2], a[2].length, a[1]);
      else if (o === 'y') r.select(a[1]); else if (o === 'z') r.play(a[1]); else if (o === 'r') r.recOn = a[1] ? 1 : 0;
      else if (o === 'e') r.enabledFlag = a[1] ? 1 : 0;
      else if (o === 'P') { const p = a[1], v = a[2]; r.setBars(p, v[0]); r.setPatternSlicer(p, v[1]); let i = 2;   // a whole pattern at once: bars, Slicer (0.9), tracks
        for (let t = 0; t < kT; t++) { r.setTrack(p, t, v[i], v[i + 1]); i += 2; for (let k = 0; k < 16; k++, i += 25) { r.setStep(p, t, k, v[i], v[i + 1], v[i + 2], v[i + 3], v[i + 4]); r.setStepFx(p, t, k, v[i + 5], v[i + 6], v[i + 7], v[i + 8]); r.setStepFm(p, t, k, v[i + 9]); r.setStepRing(p, t, k, v[i + 10], v[i + 11], v[i + 12], v[i + 13], v[i + 14]); r.setStepFold(p, t, k, v[i + 15]); r.setStepShift(p, t, k, v[i + 16], v[i + 17], v[i + 18], v[i + 19], v[i + 20]); r.setStepMetal(p, t, k, v[i + 21], v[i + 22], v[i + 23], v[i + 24]); } } }
      else if (o === 'W') r.setWire(a[1], a[2], a[3], a[4]); else if (o === 'L') r.setSlice(a[1], a[2], a[3]);
      else if (o === 'n') r.setTracks(a[1]); else if (o === 'hit') r.midi(0x90, NOTES[a[1]], a[2]);
      else if (o === 'hs') r.hitSlice(a[1], a[2], a[3]); else if (o === 'D') r.setLfoPoints(a[1], a[2]); else if (o === 'B') r.setPatternSlicer(a[1], a[2]);
    }
    setParam(id, value) { if (id < 0 || id >= N) return; this.target[id] = Math.min(Math.max(Math.fround(value), PMIN[id]), PMAX[id]); }
    setStep(p, t, s, on, vel, pan, pitch, rat) {
      if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
      const i = ((p * kT + t) * kS + s) * kSF;
      this.step[i + 1] = Math.min(Math.max(vel, 0), 1); this.step[i + 2] = Math.min(Math.max(pan, -1), 1);
      this.step[i + 3] = Math.min(Math.max(pitch, -12), 12); this.step[i + 4] = Math.min(Math.max(rat | 0, 1), 4); this.step[i] = on ? 1 : 0;
    }
    setStepFx(p, t, s, crush, dly, rev, prob) {
      if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
      const i = ((p * kT + t) * kS + s) * kSF;
      this.step[i + 5] = Math.min(Math.max(crush, 0), 1); this.step[i + 6] = Math.min(Math.max(dly, 0), 1);
      this.step[i + 7] = Math.min(Math.max(rev, 0), 1); this.step[i + 8] = Math.min(Math.max(prob, 0), 1);
    }
    /** A track's sample (mono Float32Array at `rate`), or null to remove it: plays instead of the drum model. */
    setSample(t, d, rate, table) {   // 0.9: table = the slices (SLF floats each, positions in samples of d), or none
      if (t < 0 || t >= kT) return;
      const ok = d && d.length >= 2 && rate >= 1000, dd = ok ? (d.length > rate * 60 ? d.subarray(0, Math.floor(rate * 60)) : d) : null;
      let sl = null, ns = 0;
      if (ok && table && table.length >= SLF) { ns = Math.min(Math.floor(table.length / SLF), 64); sl = new Float64Array(ns * SLF);
        for (let i = 0; i < ns; i++) { const o = i * SLF; for (let j = 0; j < SLF; j++) sl[o + j] = table[o + j];
          sl[o] = Math.min(Math.max(Math.round(sl[o]), 0), dd.length - 2); sl[o + 1] = Math.min(Math.max(Math.round(sl[o + 1]), 2), dd.length - sl[o]); } }
      this.smp[t] = ok ? { d: dd, rate, sl, ns } : null;
      if (this.v[t].model === 8) this.v[t].active = false;
    }
    setStepMetal(p, t, s, metal, slice, revP, stutP) {   // NEW (0.9): Metalise (−1 = track/slice), slice (0 = the track's), reverse / stutter chance
      if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
      const i = ((p * kT + t) * kS + s) * kSF;
      this.step[i + 21] = metal < 0 ? -1 : clampd(metal, 0.0, 1.0); this.step[i + 22] = Math.min(Math.max(lround(slice), 0), 32);
      this.step[i + 23] = clampd(revP, 0.0, 1.0); this.step[i + 24] = clampd(stutP, 0.0, 1.0);
    }
    setLfoPoints(l, pts) { if (l < 0 || l > 2 || !pts) return; for (let j = 0; j < LPTS; j++) this.lfoTab[l * LPTS + j] = clampd(+pts[j] || 0, -1.0, 1.0); }   // NEW (0.9.1)
    setPatternSlicer(p, v) { if (p >= 0 && p < kP) this.patSl[p] = v === 0 || v === 1 ? v : -1; }
    setStepShift(p, t, s, st, mix, spec, col, smix) {   // NEW (0.8): pitch shifter (st, mix) and spectral (amount, colour, mix)
      if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
      const i = ((p * kT + t) * kS + s) * kSF;
      this.step[i + 16] = clampd(st, -24.0, 24.0); this.step[i + 17] = clampd(mix, 0.0, 1.0);
      this.step[i + 18] = clampd(spec, 0.0, 1.0); this.step[i + 19] = clampd(col, 0.0, 1.0); this.step[i + 20] = clampd(smix, 0.0, 1.0);
    }
    setStepFold(p, t, s, fold) {
      if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
      this.step[((p * kT + t) * kS + s) * kSF + 15] = clampd(fold, 0.0, 1.0);
    }
    setStepFm(p, t, s, ratio) {
      if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
      this.step[((p * kT + t) * kS + s) * kSF + 9] = ratio > 0 ? Math.min(Math.max(ratio, 0.25), 16) : 0;
    }
    setStepRing(p, t, s, on, master, mask, amt, hz) {
      if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
      const i = ((p * kT + t) * kS + s) * kSF;
      this.step[i + 10] = on ? 1 : 0; this.step[i + 11] = Math.min(Math.max(master | 0, 0), RINGOSC);
      this.step[i + 12] = Math.min(Math.max(mask | 0, 0), (1 << kT) - 1); this.step[i + 13] = clampd(amt, 0.0, 1.0); this.step[i + 14] = clampd(hz, 20.0, 5000.0);
    }
    setWire(slot, src, dst, amt) {   // dst: dense parameter index, −1 = empty
      if (slot < 0 || slot >= NWIRE) return;
      this.wSrc[slot] = Math.min(Math.max(src | 0, 0), NSRC - 1); this.wDst[slot] = dst >= 0 && dst < N ? dst : -1; this.wAmt[slot] = clampd(amt, -1.0, 1.0);
      this.wired.fill(0); let n = 0;
      for (let w = 0; w < NWIRE; w++) { const d = this.wDst[w]; if (d < 0) continue; if (!this.wired[d]) { this.wired[d] = 1; this.modList[n++] = d; } }
      this.nMod = n;
    }
    setSlice(slot, act, src) { if (slot < 0 || slot >= NSLOT) return; this.slAct[slot] = Math.min(Math.max(act | 0, 0), 11); this.slSrc[slot] = Math.min(Math.max(src | 0, 0), NSLOT - 1); }
    setTracks(n) { this.nTr = Math.min(Math.max(n | 0, 1), kT); for (let t = this.nTr; t < kT; t++) this.v[t].active = false; }
    setTrack(p, t, len, div) { if (p < 0 || p >= kP || t < 0 || t >= kT) return; this.trkLen[p * kT + t] = Math.min(Math.max(len | 0, 1), kS); this.trkDiv[p * kT + t] = Math.min(Math.max(div | 0, 0), ND - 1); }
    setBars(p, bars) { if (p >= 0 && p < kP) this.patBars[p] = bars >= 4 ? 4 : (bars >= 2 ? 2 : 1); }
    setChain(pats, n, on) { n = Math.min(Math.max(n | 0, 0), kC); for (let i = 0; i < n; i++) this.chain[i] = Math.min(Math.max(pats[i] | 0, 0), kP - 1); this.chainN = n; this.chainOn = on ? 1 : 0; }
    select(p) { this.want = Math.min(Math.max(p | 0, 0), kP - 1); this.jumpReq = 1; }
    play(on) { this.playReq = on ? 1 : 0; }
    setTempo(bpm, beat) { this.tempo = Math.fround(bpm); this.hostBeat = beat; this.beatSerial++; }

    P(id) { return this.mv[id]; }              // smoothed value + modulation
    Pi(id) { return lround(this.mv[id]); }
    T(id) { return this.target[id]; }
    tp(t, k) { return T1 + t * TSTRIDE + k; }
    S(p, t, s, f) { return this.step[((p * kT + t) * kS + s) * kSF + f]; }

    takes(status) {
      if (!this.enabledFlag) return false;
      const t = status & 0xF0, ch = lround(this.target[CH]);
      return (t === 0x80 || t === 0x90) && (ch === 0 || (status & 0x0F) === ch - 1);
    }
    trackOf(note) { for (let t = 0; t < this.nTr; t++) if (NOTES[t] === note) return t; return note >= 36 ? (note - 36) % this.nTr : -1; }
    midi(st, d1, d2) {
      if ((st & 0xF0) !== 0x90 || d2 === 0) return;
      const t = this.trackOf(d1); if (t < 0) return;
      const vel = d2 / 127.0;
      this.trigger(t, vel, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, null);
      if (this.recOn && this.running) this.record(t, vel);
    }
    /** NEW (0.9): a pad playing one slice of its track (Break Lab pads); recorded with the slice when REC is on. */
    hitSlice(t, slice, vel) {
      if (t < 0 || t >= kT) return;
      const nx = this.nx; nx.fill(0); nx[1] = 1; nx[4] = 1; nx[5] = -1; nx[6] = slice;
      this.trigger(t, vel, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, nx);
      if (this.recOn && this.running) this.record(t, vel, slice);
    }
    record(t, vel) {
      const cur = this.cur;
      const sb = DIVB[Math.min(Math.max(this.trkDiv[cur * kT + t], 0), ND - 1)];
      const len = Math.min(Math.max(this.trkLen[cur * kT + t], 1), kS);
      const patLen = 4.0 * Math.min(Math.max(this.patBars[cur], 1), 4);
      let k = lround((this.beat - this.patStart) / sb);
      if (k * sb >= patLen - 1e-9) k = 0;
      const s = k % len;
      this.setStep(cur, t, s, 1, Math.fround(vel), 0, 0, 1); this.setStepFx(cur, t, s, 0, 0, 0, 1); this.setStepFm(cur, t, s, 0);
      const sl = arguments.length > 2 ? arguments[2] : 0; this.setStepMetal(cur, t, s, -1, sl, 0, 0);
      if (k >= this.nextIdx[t]) this.skipIdx[t] = k;
      if (this.recQ.length < 64) this.recQ.push([cur, t, s, Math.fround(vel), sl]);
    }
    trigger(t, vel, stepPan, stepPitch, crush, sdly, srev, fmr, fold, nx) {
      const w = this.v[t], sr = this.sr;
      this.stepFx(t, nx);
      const eng = lround(this.T(this.tp(t, K_ENGINE)));   // 0 drum synth · 1 sample (model 8) · 2 FM (model 9)
      if (eng === 1 && !this.smp[t]) return;              // sample engine with no sample: silent
      const model = eng === 2 ? 9 : eng === 1 ? 8 : Math.min(Math.max(lround(this.T(this.tp(t, 0))), 0), 7);
      w.active = true; w.model = model; w.t = 0.0; w.choke = 1.0;
      w.vel = clampd(vel, 0.0, 1.0); w.pan = stepPan; w.pitch = stepPitch;
      { const bits = 16 - lround(clampd(crush, 0.0, 1.0) * 14.0); w.cq = bits < 16 ? Math.pow(2, bits - 1) : 0.0; }
      w.sdly = sdly; w.srev = srev;
      w.spos = 0.0; w.slp = 0.0;
      // NEW (0.9): Metalise source — the step's own amount, else the slice's, else the track's (live)
      let msrc = nx && nx[5] >= 0 ? nx[5] : -1;
      if (model === 8) this.sliceStart(t, w, nx); else w.sl = -1;
      if (msrc < 0 && w.sl >= 0) { const mm = this.smp[t].sl[w.sl * SLF + 10]; if (mm >= 0) msrc = mm; }
      this.mtSrc[t] = msrc;
      { const tg = msrc >= 0 ? msrc : clampd(this.P(this.tp(t, K_METAL)), 0.0, 1.0);   // bypassed (not a sample touched) unless it has an amount
        if (tg > 0 || this.mtS[t] > 0) { this.mtOn[t] = 1; this.metalParams(this.mt[t], this.mtS[t]); } }
      const lng = this.Pi(this.tp(t, K_LONG)) === 1, dec = clampd(this.P(this.tp(t, 2)) * (lng ? 20.0 : 1.0), 0.01, 60.0);   // 0.9.1: LONG = Decay × 20 (to 60 s)
      w.amp = 1.0; w.ampK = model === 8 && dec >= (lng ? 59.0 : 2.95) ? 1.0 : Math.exp(Math.log(0.001) / (dec * sr));
      w.pe = 1.0; w.peK = Math.exp(-1.0 / ((model === 5 ? 0.06 : 0.035) * sr));
      w.ck = 1.0; w.ckK = Math.exp(-1.0 / (0.0025 * sr));
      w.ph.fill(0);
      w.bph = 0.0;
      w.f1.reset(); w.f2.reset(); w.holdPh = 1.0;
      w.swE = 1.0; w.swK = Math.exp(-kCR / (clampd(this.P(this.tp(t, K_SWTIME)), 0.005, 2.0) * sr));   // pitch sweep, control rate
      w.stepRatio = fmr > 0 ? fmr : 0.0; w.sf = fold > 0 ? fold : 0.0;
      if (model === 9) { w.ie = 1.0; w.ieK = Math.exp(-1.0 / (clampd(this.P(this.tp(t, K_IDEC)), 0.005, 2.0) * sr)); w.m1y = w.m1y2 = 0.0; }
      this.hits[t] += 1;
      { const g = lround(this.T(this.tp(t, K_CHOKE)));   // choke group: this hit silences the group's other tracks
        if (g > 0) for (let u = 0; u < kT; u++) if (u !== t && this.v[u].active && lround(this.T(this.tp(u, K_CHOKE))) === g) this.v[u].choke = Math.exp(-1.0 / (0.004 * sr)); }
      this.voiceCoefs(t);
    }
    voiceCoefs(t) {
      const w = this.v[t], sr = this.sr;
      const br = this.P(this.tp(t, 14)), bend = br > 0.001 ? this.P(this.tp(t, 7)) * Math.sin(2.0 * kPi * w.bph) : this.P(this.tp(t, 7));
      w.ratio = Math.pow(2, (this.P(this.tp(t, 1)) + w.pitch + bend + this.P(this.tp(t, K_SWEEP)) * w.swE) / 12.0);
      { const a = (clampd(this.P(this.tp(t, 6)) + w.pan, -1.0, 1.0) + 1.0) * kPi * 0.25; w.gl = Math.cos(a); w.gr = Math.sin(a); }
      const tone = this.P(this.tp(t, 3));
      switch (w.model) {
        case 1: w.f1.set(900.0 + tone * 6000.0, 0.7, sr); break;
        case 2: case 3: w.f1.set((5500.0 + tone * 5000.0) * Math.sqrt(w.ratio), 1.2, sr); w.f2.set(6000.0 + tone * 3000.0, 0.7, sr); break;
        case 4: w.f1.set((900.0 + tone * 1400.0) * Math.sqrt(w.ratio), 2.6, sr); break;
        case 6: w.f1.set(3200.0 * w.ratio, 3.0, sr); break;
        case 7: w.f1.set((1800.0 + tone * 2400.0) * Math.sqrt(w.ratio), 3.5, sr); break;
        case 9: {
          const fc = this.P(this.tp(t, K_FREQ)) * w.ratio, r1 = w.stepRatio > 0 ? w.stepRatio : this.P(this.tp(t, K_RATIO));
          w.fcInc = Math.min(fc / sr, 0.49); w.m1Inc = Math.min(fc * r1 / sr, 0.49); w.m2Inc = Math.min(fc * this.P(this.tp(t, K_RATIO2)) / sr, 0.49);
          w.fmI = this.P(this.tp(t, K_INDEX)) * (0.25 + 1.5 * tone); w.fmFb = this.P(this.tp(t, K_FB)) * kPi;
          w.fmFold = this.P(this.tp(t, K_FOLD)); w.fmN = this.P(this.tp(t, K_NOISE)); w.fmAlgo = lround(this.T(this.tp(t, K_ALGO)));
          break; }
        case 8: w.slpA = tone >= 0.999 ? 1.0 : 1.0 - Math.exp(-2.0 * kPi * Math.min(120.0 * Math.pow(2, tone * 7.7), sr * 0.45) / sr); break;
        default: break;
      }
    }
    noise() { return xs(this.rng) / 2147483648.0 - 1.0; }
    /** NEW (0.9): starts slice playback — which slice (the step's, else the track's Slice), its gain / pan / pitch, gate,
        reverse (the slice's, flipped by the step's reverse chance), stutter (the slice's, or 2–3 × 1/32 by the step's chance). */
    sliceStart(t, w, nx) {
      const sp = this.smp[t]; w.sl = -1;
      if (!sp || !sp.sl || sp.ns < 1) return;
      const k = nx && nx[6] > 0 ? lround(nx[6]) : lround(this.T(this.tp(t, K_SLICE)));
      const i = Math.min(Math.max(k, 1), sp.ns) - 1, L = sp.sl, o = i * SLF;
      w.sl = i; w.s0 = L[o]; w.sLen = Math.max(1, L[o + 1]); w.pitch += L[o + 2]; w.sG = L[o + 3]; w.pan = clampd(w.pan + L[o + 4], -1.0, 1.0);
      const rt = sp.rate;
      w.sAtt = Math.max(1, L[o + 5] * rt); w.sGate = Math.max(2, Math.min(w.sLen, Math.round(w.sLen * clampd(L[o + 6], 0.02, 1.0)))); w.sRel = Math.max(1, Math.min(0.006 * rt, w.sGate * 0.5));
      let rev = L[o + 7] > 0.5, sn = Math.round(L[o + 8]), sl = L[o + 9] * rt;
      const rp = nx ? nx[7] : 0, stp = nx ? nx[8] : 0;
      if (rp > 0 && xs(this.brng) / 4294967296.0 < rp) rev = !rev;
      if (stp > 0 && xs(this.brng) / 4294967296.0 < stp) { sn = 2 + (xs(this.brng) & 1); sl = 60.0 / Math.max(this.tempo, 20.0) / 8.0 * rt; }
      w.sRev = rev; w.stN = Math.max(0, sn); w.stL = Math.max(32, Math.min(sl, w.sGate)); w.stC = 0; w.spos = 0.0;
    }
    sliceTick(w, sp, r) {
      let p = w.spos;
      if (w.stN > 0 && p >= w.stL) { p -= w.stL; w.spos = p; w.stC++; if (w.stC >= w.stN) w.stN = 0; }
      if (p >= w.sGate - 1) { w.active = false; w.out = 0.0; return 0.0; }
      const i = Math.trunc(p), fr = p - i, d = sp.d;
      const j0 = w.sRev ? w.s0 + w.sLen - 1 - i : w.s0 + i, j1 = w.sRev ? j0 - 1 : j0 + 1;
      const a = d[Math.min(Math.max(j0, 0), d.length - 1)], b = d[Math.min(Math.max(j1, 0), d.length - 1)];
      let g = w.sG;
      if (p < w.sAtt) g *= p / w.sAtt;
      if (p > w.sGate - w.sRel) g *= (w.sGate - p) / w.sRel;
      if (w.stN > 0) { const e = Math.min(p, w.stL - p) / 48.0; if (e < 1.0) g *= e < 0 ? 0 : e; }   // stutter edges: ~1 ms fades, no clicks
      else if (w.stC > 0 && p < 48.0) g *= p / 48.0;
      w.spos = p + sp.rate / this.sr * r;
      const x = (a + (b - a) * fr) * g;
      w.slp += (x - w.slp) * w.slpA;
      return w.slp;
    }
    voiceTick(t) {
      const w = this.v[t], sr = this.sr;
      const snap = this.P(this.tp(t, 4)), tone = this.P(this.tp(t, 3)), r = w.ratio, dt = 1.0 / sr;
      let y = 0.0;
      switch (w.model) {
        case 0: {
          const f = 46.0 * r * (1.0 + tone * 5.0 * w.pe);
          w.ph[0] += f * dt; if (w.ph[0] >= 1.0) w.ph[0] -= 1.0;
          y = Math.sin(2.0 * kPi * w.ph[0]) * w.amp + snap * 0.6 * this.noise() * w.ck;
          break; }
        case 1: {
          for (let i = 0; i < 2; i++) { w.ph[i] += (i ? 330.0 : 185.0) * r * dt; if (w.ph[i] >= 1.0) w.ph[i] -= 1.0; }
          const body = (0.62 * Math.sin(2.0 * kPi * w.ph[0]) + 0.38 * Math.sin(2.0 * kPi * w.ph[1])) * w.amp * w.amp;
          w.f1.run(this.noise());
          y = body * (1.0 - 0.45 * snap) + w.f1.hp * w.amp * (0.25 + snap) * 0.9;
          break; }
        case 2: case 3: {
          let m = 0.0;
          for (let i = 0; i < 6; i++) { w.ph[i] += kMetal[i] * r * dt; if (w.ph[i] >= 1.0) w.ph[i] -= 1.0; m += w.ph[i] < 0.5 ? 1.0 : -1.0; }
          const x = m / 6.0 * (1.0 - 0.5 * snap) + this.noise() * (0.25 + 0.6 * snap);
          w.f1.run(x); w.f2.run(w.f1.bp);
          y = w.f2.hp * w.amp * 1.6;
          break; }
        case 4: {
          w.f1.run(this.noise());
          let env = 0.0;
          if (w.t < 0.03) { const ph = w.t % 0.0105; env = Math.exp(-ph / 0.0028) * (0.7 + 0.3 * snap); }
          if (w.t >= 0.02) env = Math.max(env, w.amp * 0.85);
          y = w.f1.bp * env * 2.2;
          break; }
        case 5: {
          const f = 105.0 * r * (1.0 + tone * 1.6 * w.pe);
          w.ph[0] += f * dt; if (w.ph[0] >= 1.0) w.ph[0] -= 1.0;
          y = Math.sin(2.0 * kPi * w.ph[0]) * w.amp + snap * 0.35 * this.noise() * w.ck;
          break; }
        case 6: {
          w.ph[0] += 1700.0 * r * dt; if (w.ph[0] >= 1.0) w.ph[0] -= 1.0;
          w.f1.run(this.noise());
          y = Math.sin(2.0 * kPi * w.ph[0]) * w.amp * w.amp * (0.4 + 0.6 * tone) + w.f1.bp * w.ck * (0.4 + snap) * 1.5;
          break; }
        case 8: {
          const sp = this.smp[t], n = sp ? sp.d.length : 0;
          if (w.sl >= 0) { y = this.sliceTick(w, sp, r) * w.amp; break; }   // NEW (0.9): a slice (pitch, gate, reverse, stutter, attack)
          if (n < 2 || w.spos >= n - 1) { w.active = false; w.out = 0.0; return 0.0; }
          const i = Math.trunc(w.spos), fr = w.spos - i;
          const x = sp.d[i] + (sp.d[i + 1] - sp.d[i]) * fr;
          w.spos += sp.rate / sr * r;
          w.slp += (x - w.slp) * w.slpA;
          y = w.slp * w.amp;
          break; }
        case 9: {   // FM: carrier ph[0], modulator ph[1] (feedback), modulator 2 / ring ph[2]
          w.ph[0] += w.fcInc; if (w.ph[0] >= 1.0) w.ph[0] -= 1.0;
          w.ph[1] += w.m1Inc; if (w.ph[1] >= 1.0) w.ph[1] -= 1.0;
          w.ph[2] += w.m2Inc; if (w.ph[2] >= 1.0) w.ph[2] -= 1.0;
          const I = w.fmI * w.ie, fb = (w.m1y + w.m1y2) * 0.5 * w.fmFb, m2 = Math.sin(2.0 * kPi * w.ph[2]);
          let m1, c;
          switch (w.fmAlgo) {
            case 1: m1 = Math.sin(2.0 * kPi * w.ph[1] + fb + 0.7 * I * m2); c = Math.sin(2.0 * kPi * w.ph[0] + I * m1); break;   // stack: M2→M1→C
            case 2: m1 = Math.sin(2.0 * kPi * w.ph[1] + fb); c = Math.sin(2.0 * kPi * w.ph[0] + 0.7 * I * (m1 + m2)); break;   // parallel
            case 3: m1 = Math.sin(2.0 * kPi * w.ph[1] + fb); c = Math.sin(2.0 * kPi * w.ph[0] + I * m1) * m2; break;           // ring metal
            default: m1 = Math.sin(2.0 * kPi * w.ph[1] + fb); c = Math.sin(2.0 * kPi * w.ph[0] + I * m1); break;              // classic M→C
          }
          w.m1y2 = w.m1y; w.m1y = m1; w.ie *= w.ieK;
          if (w.fmFold > 0.0) c = Math.sin(c * (1.0 + w.fmFold * 7.0) * kPi * 0.5);   // sine wavefolder
          y = c * w.amp + (w.fmN * w.amp * w.amp + snap * 0.5 * w.ck) * this.noise();
          break; }
        default: {
          for (let i = 0; i < 2; i++) { w.ph[i] += (i ? 845.0 : 587.0) * r * dt; if (w.ph[i] >= 1.0) w.ph[i] -= 1.0; }
          const x = (w.ph[0] < 0.5 ? 0.5 : -0.5) + (w.ph[1] < 0.5 ? 0.5 : -0.5) + snap * 0.3 * this.noise() * w.ck;
          w.f1.run(x);
          y = w.f1.bp * w.amp * 1.4;
          break; }
      }
      w.t += dt; w.amp *= w.ampK; w.pe *= w.peK; w.ck *= w.ckK;
      if (w.choke < 1.0) { w.amp *= w.choke; }
      if (w.amp < 1e-5 && w.t > 0.04) { w.active = false; w.out = 0.0; return 0.0; }
      const rate = this.cRate[t];
      if (rate < Math.min(sr * 0.999, 47999.0)) {   // top of the range is off at any sample rate
        w.holdPh += rate / sr; if (w.holdPh >= 1.0) { w.holdPh -= 1.0; w.hold = y; } y = w.hold; }
      if (this.cBits[t] < 16) { const q = this.cBitsQ[t]; y = lround(clampd(y, -1.0, 1.0) * q) / q; }
      if (w.cq > 0.0) { const q = w.cq; y = lround(clampd(y, -1.0, 1.0) * q) / q; }   // the step's own crush
      if (w.sf > 0.0) { const f = w.sf; y += (Math.sin(y * (1.0 + 8.0 * f) * kPi * 0.5) - y) * f; }   // the step's own wavefolder
      w.out = y;
      return y;
    }
    stepBeats(t) { return DIVB[Math.min(Math.max(this.trkDiv[this.cur * kT + t], 0), ND - 1)]; }
    stepTime(t, k) { const sb = this.stepBeats(t); return this.patStart + k * sb + ((k & 1) ? this.P(SWING) * sb * 0.5 : 0.0); }
    resetTracks() { for (let t = 0; t < kT; t++) { this.nextIdx[t] = 0; this.nextBeat[t] = this.stepTime(t, 0); this.skipIdx[t] = -1; this.ratLeft[t] = 0; if (this.cHum > 0.0 || this.hOff[t] !== 0.0) this.humSet(t); } }
    /** HUMANISE: the offset (beats) of track t's next step. Triangular, so most hits stay close; at most 42 % of a step
        (steps never swap or merge, the last step still lands inside its pattern) and the first step of a pattern only lags. */
    humSet(t) {
      const h = this.cHum; if (h <= 0.0) { this.hOff[t] = 0.0; return; }
      const mx = Math.min(0.18 * Math.pow(h, 2.2), 0.42 * this.stepBeats(t));   // 25 % ≈ 4 ms · 50 % ≈ 20 ms · 75 % ≈ 1/32 · 100 % ≈ 90 ms (at 120 BPM)
      let o = ((xs(this.hrng) + xs(this.hrng)) / 4294967296.0 - 1.0) * mx;
      if (this.nextIdx[t] === 0 && o < 0.0) o = -o;
      this.hOff[t] = o;
    }
    /** HUMANISE 50–100 %: now and then a quiet ghost on a free step next to a written hit (never written to the pattern,
        never recorded); above 75 % some ghosts become a quick double or triple. */
    ghost(t, s, len) {
      const h = this.cHum, cur = this.cur, q = (h - 0.5) * 2.0;
      if (len < 2 || xs(this.hrng) / 4294967296.0 >= q * Math.sqrt(q) * 0.3) return;
      const a = (s + len - 1) % len, b = (s + 1) % len;
      const n = this.S(cur, t, a, 0) >= 0.5 ? a : this.S(cur, t, b, 0) >= 0.5 ? b : -1;
      if (n < 0) return;
      const vel = this.S(cur, t, n, 1) * (0.22 + 0.18 * (xs(this.hrng) / 4294967296.0));
      const pan = this.S(cur, t, n, 2), pitch = this.S(cur, t, n, 3), cr = this.S(cur, t, n, 5), sd = this.S(cur, t, n, 6), sv = this.S(cur, t, n, 7), fr = this.S(cur, t, n, 9), fo = this.S(cur, t, n, 15);
      const nx = this.nx; for (let j = 0; j < 9; j++) nx[j] = this.S(cur, t, n, 16 + j);
      this.trigger(t, vel, pan, pitch, cr, sd, sv, fr, fo, nx);
      if (h > 0.75 && this.ratLeft[t] === 0 && xs(this.hrng) / 4294967296.0 < (h - 0.75) * 1.2) {
        const r = 1 + (xs(this.hrng) & 1);
        this.ratLeft[t] = r; this.ratDt[t] = this.stepBeats(t) / (r + 1); this.ratNext[t] = this.beat + this.ratDt[t]; this.ratVel[t] = vel; this.ratPan[t] = pan; this.ratPitch[t] = pitch;
        this.ratFx[t * 3] = cr; this.ratFx[t * 3 + 1] = sd; this.ratFx[t * 3 + 2] = sv; this.ratFm[t] = fr; this.ratFold[t] = fo; for (let j = 0; j < 9; j++) this.ratNx[t * 9 + j] = nx[j];
      }
    }
    chainIndexOf(p) { for (let i = 0; i < this.chainN; i++) if (this.chain[i] === p) return i; return 0; }
    nextPattern() {
      const n = this.chainN;
      if (this.jumpReq) { this.jumpReq = 0; this.cur = Math.min(Math.max(this.want, 0), kP - 1); this.chainPos = this.chainIndexOf(this.cur); return; }
      if (this.chainOn && n > 0) { this.chainPos = (this.chainPos + 1) % n; this.cur = Math.min(Math.max(this.chain[this.chainPos], 0), kP - 1); }
    }
    fire(t, k) {
      const cur = this.cur;
      const len = Math.min(Math.max(this.trkLen[cur * kT + t], 1), kS);
      const s = k % len;
      if (k === this.skipIdx[t]) { this.skipIdx[t] = -1; return; }
      if (this.S(cur, t, s, 0) < 0.5) { if (this.cHum > 0.5) this.ghost(t, s, len); return; }
      const vel = this.S(cur, t, s, 1), pan = this.S(cur, t, s, 2), pitch = this.S(cur, t, s, 3);
      const rat = Math.min(Math.max(lround(this.S(cur, t, s, 4)), 1), 4);
      const prob = this.S(cur, t, s, 8);
      if (prob < 0.999 && xs(this.prng) / 4294967296.0 >= prob) { this.ratLeft[t] = 0; return; }   // probability: this time it doesn't play
      const cr = this.S(cur, t, s, 5), sd = this.S(cur, t, s, 6), sv = this.S(cur, t, s, 7), fr = this.S(cur, t, s, 9), fo = this.S(cur, t, s, 15);
      const nx = this.nx; for (let j = 0; j < 9; j++) { nx[j] = this.S(cur, t, s, 16 + j); this.ratNx[t * 9 + j] = nx[j]; }
      this.trigger(t, vel, pan, pitch, cr, sd, sv, fr, fo, nx); this.ratFm[t] = fr; this.ratFold[t] = fo;
      if (this.S(cur, t, s, 10) > 0.5) {   // ring step: master × slaves for this step's length
        this.rOn = true; this.rMaster = lround(this.S(cur, t, s, 11)); this.rMask = lround(this.S(cur, t, s, 12));
        this.rAmt = this.S(cur, t, s, 13); this.rHz = this.S(cur, t, s, 14); this.rEnd = this.beat + this.stepBeats(t); this.rPh = 0.0;
      }
      if (rat > 1) { this.ratLeft[t] = rat - 1; this.ratDt[t] = this.stepBeats(t) / rat; this.ratNext[t] = this.beat + this.ratDt[t]; this.ratVel[t] = vel; this.ratPan[t] = pan; this.ratPitch[t] = pitch; this.ratFx[t * 3] = cr; this.ratFx[t * 3 + 1] = sd; this.ratFx[t * 3 + 2] = sv; }
      else this.ratLeft[t] = 0;
    }
    sequence() {
      const req = this.playReq; this.playReq = -1;
      if (req === 1 && !this.running && !this.waiting) {
        this.waiting = true;
        const fl = Math.floor(this.beat);
        this.startAt = this.beat - fl < 0.05 ? fl : fl + 1.0;
        if (this.chainOn && this.chainN > 0) { this.chainPos = 0; this.cur = Math.min(Math.max(this.chain[0], 0), kP - 1); }
        else this.cur = Math.min(Math.max(this.want, 0), kP - 1);
        this.jumpReq = 0;
      } else if (req === 0) { this.running = this.waiting = false; this.ratLeft.fill(0); }
      if (!this.running && !this.waiting) { this.cur = Math.min(Math.max(this.want, 0), kP - 1); return; }
      if (this.waiting) { if (this.beat < this.startAt) return; this.waiting = false; this.running = true; this.patStart = this.startAt; this.resetTracks(); }
      let patLen = 4.0 * Math.min(Math.max(this.patBars[this.cur], 1), 4);
      if (this.beat < this.patStart - 0.5 || this.beat > this.patStart + patLen + 4.0) { this.patStart = Math.floor(this.beat); this.resetTracks(); }
      if (this.beat >= this.patStart + patLen) { this.patStart += patLen; this.nextPattern(); this.resetTracks(); patLen = 4.0 * Math.min(Math.max(this.patBars[this.cur], 1), 4); }
      for (let t = 0; t < this.nTr; t++) {
        let guard = 0;
        while (this.beat >= this.nextBeat[t] + this.hOff[t] && this.nextBeat[t] < this.patStart + patLen && guard++ < 8) { this.fire(t, this.nextIdx[t]); ++this.nextIdx[t]; this.nextBeat[t] = this.stepTime(t, this.nextIdx[t]); if (this.cHum > 0.0 || this.hOff[t] !== 0.0) this.humSet(t); }
        if (this.ratLeft[t] > 0 && this.beat >= this.ratNext[t]) { this.trigger(t, this.ratVel[t] * 0.85, this.ratPan[t], this.ratPitch[t], this.ratFx[t * 3], this.ratFx[t * 3 + 1], this.ratFx[t * 3 + 2], this.ratFm[t], this.ratFold[t], this.ratNx.subarray(t * 9, t * 9 + 9)); --this.ratLeft[t]; this.ratNext[t] += this.ratDt[t]; }
      }
    }
    control() {
      const a = 1.0 - Math.exp(-kCR / (0.01 * this.sr)), sm = this.sm, tg = this.target;
      for (let i = 0; i < N; i++) { const t = tg[i]; if (PSM[i]) sm[i] += (t - sm[i]) * a; else sm[i] = t; }
      this.modSources();                                   // reads its own parameters (a wired one: last tick's value)
      this.mv.set(sm);
      if (this.nMod > 0) this.applyWires();
      this.cAnySolo = false;
      for (let t = 0; t < kT; t++) {
        this.cMute[t] = this.Pi(this.tp(t, 12)) === 1 ? 1 : 0; this.cSolo[t] = this.Pi(this.tp(t, 13)) === 1 ? 1 : 0; this.cAnySolo = this.cAnySolo || this.cSolo[t] === 1;
        this.cBits[t] = this.Pi(this.tp(t, 8)); this.cBitsQ[t] = Math.pow(2, this.cBits[t] - 1); this.cRate[t] = this.P(this.tp(t, 9));
      }
      this.cPP = this.Pi(DLYPP) === 1; this.cDiv = Math.min(Math.max(this.Pi(DLYDIV), 0), ND - 1);
      this.cDsec = clampd(DIVB[this.cDiv] * 60.0 / this.cBpm, 0.01, 3.0);
      this.cDlyGlide = 1.0 - Math.exp(-1.0 / (0.05 * this.sr));
      this.cLpA = 1.0 - Math.exp(-2.0 * kPi * Math.min(800.0 * Math.pow(2, this.P(DLYTONE) * 4.3), this.sr * 0.45) / this.sr);
      for (let t = 0; t < kT; t++) if (this.v[t].active) { const w = this.v[t]; w.bph += this.P(this.tp(t, 14)) * kCR / this.sr; if (w.bph >= 1.0) w.bph -= 1.0; w.swE *= w.swK; this.voiceCoefs(t); }
      { const h = this.P(HUMAN); this.cHum = h > 1e-4 ? (h < 1.0 ? h : 1.0) : 0.0; }
      if (this.tmSr !== this.sr) { const sr = this.sr; this.tmSr = sr;   // TEMPER coefficients (sample-rate independent)
        this.tmA = 1.0 - Math.exp(-1.0 / (0.005 * sr)); this.tmFa = 1.0 - Math.exp(-1.0 / (0.0005 * sr)); this.tmSa = 1.0 - Math.exp(-1.0 / (0.012 * sr));
        this.tmR = 1.0 - Math.exp(-1.0 / (0.08 * sr)); this.tmLa = 1.0 - Math.exp(-2.0 * kPi * Math.min(5000.0, 0.45 * sr) / sr); }
      this.glitchControl(); this.slicerControl(); this.eqControl(); if (this.cRevType === 3) this.expControl();
      this.metalControl();
    }
    // ---- NEW (0.9) METALISE: a vintage 16-bit sampler's character, progressive with the amount — transient-dependent
    // saturation, pre-emphasis, sample-rate reduction (linear → sample-and-hold), quantisation with converter curvature,
    // de-emphasis, two short metallic resonances and a soft clip. At 0 it is bypassed: the dry path is untouched.
    metalParams(m, a) {
      const sr = this.sr; m.a = a;
      m.st = Math.pow(2, -2.2 * a) * Math.min(1.0, 48000.0 / sr); m.q = Math.pow(2, 15 - 9 * a); m.zm = clampd((a - 0.2) / 0.5, 0.0, 1.0);
      m.k = 0.65 * a; m.fb = 0.25 + 0.5 * a; m.L1 = Math.min(255, Math.max(2, Math.round(0.00113 * sr))); m.L2 = Math.min(255, Math.max(3, Math.round(0.00171 * sr)));
      m.cv = 0.08 * a; m.cm = 0.45 * a;
    }
    metalTick(m, x) {
      const a = m.a, ax = x < 0 ? -x : x;
      m.ef += (ax - m.ef) * 0.02; m.es += (ax - m.es) * 0.0008;
      const tr = m.ef > 1e-9 ? clampd((m.ef - 1.6 * m.es) / m.ef, 0.0, 1.0) : 0.0;
      const drive = 1.0 + a * (2.0 + 3.0 * tr * a);
      let y = x + a * (Math.tanh(drive * x) / Math.sqrt(drive) - x);
      const e = y - m.k * m.pe; m.pe = y;                       // pre-emphasis: the HF roughness survives the converter
      m.ph += m.st;
      if (m.ph >= 1.0) { m.ph -= 1.0; let v = Math.round(e * m.q) / m.q; v += m.cv * v * (v < 0 ? -v : v); m.h1 = m.h0; m.h0 = v; }
      const lin = m.h1 + (m.h0 - m.h1) * m.ph; let d = lin + (m.h0 - lin) * m.zm;   // interpolation → sample-and-hold
      d = d + m.k * m.de * 0.98; m.de = d;                      // de-emphasis
      const c = m.c1, c2 = m.c2, p = m.cp, r1 = c[(p - m.L1) & 255], r2 = c2[(p - m.L2) & 255];
      c[p] = d + m.fb * r1; c2[p] = d - m.fb * r2; m.cp = (p + 1) & 255;
      d += m.cm * (r1 - r2) * 0.5;                             // metallic resonances (1.13 ms, 1.71 ms)
      const ad = d < 0 ? -d : d;
      if (ad > 0.9) d = (d < 0 ? -1 : 1) * (0.9 + 0.1 * Math.tanh((ad - 0.9) * 10.0));
      return ftz(d);
    }
    metalReset(m) { m.ef = m.es = m.pe = m.de = m.h0 = m.h1 = 0.0; m.ph = 1.0; m.c1.fill(0); m.c2.fill(0); m.cp = 0; }
    // ---- NEW (0.9) RESAMPLE: the track through a sampler model's converter — anti-alias filter, emphasis, rate
    // reduction with sub-sample timing, quantisation, converter curve and noise, reconstruction (hold / linear /
    // drop-sample), output filter. 0 = unaffected; 25 / 50 / 75 / 100 % step up the rate and bit reduction.
    // Transient modes: PRESERVE keeps attacks dry, ROUND softens them, CRUSH crushes them harder, REBUILD lets each
    // attack through and fades the resampled sound back in over 8 ms. No lookahead.
    rsParams(s, a, mode, sens, model) {
      const sr = this.sr, M = SMODELS[Math.min(Math.max(model, 0), SMODELS.length - 1)];
      const u = Math.min(1.0, 2.0 * a); let R = sr * Math.pow(Math.min(M[1] / sr, 1.0), u); if (a > 0.5) R *= Math.pow(2, -(a - 0.5) * 2.0);
      s.a = a; s.mode = mode; s.st = Math.min(1.0, R / sr); s.R = R; s.interp = M[2];
      const bits = 24 + (M[0] - 24) * u - 4.0 * Math.max(0.0, 2.0 * a - 1.0); s.bits = bits; s.q = Math.pow(2, bits - 1);
      s.em = M[4] * u; s.cv = M[5] * u; s.nz = M[6] * u; s.sat = 0.35 * a; s.wm = Math.min(1.0, 2.0 * a);
      s.thr = 1.2 + 1.6 * (1.0 - sens);
      const fc = Math.min(0.45 * sr, R * M[3]), w0 = 2.0 * kPi * fc / sr, al = Math.sin(w0) / (2.0 * 0.7071), cw = Math.cos(w0), a0 = 1.0 + al;
      s.b0 = (1.0 - cw) * 0.5 / a0; s.b1 = (1.0 - cw) / a0; s.b2 = s.b0; s.a1 = -2.0 * cw / a0; s.a2 = (1.0 - al) / a0;
      s.lpA = 1.0 - Math.exp(-2.0 * kPi * Math.min(0.45 * sr, 0.45 * R) / sr);
    }
    rsTick(s, x, t) {
      const ax = x < 0 ? -x : x;
      s.ef += (ax - s.ef) * 0.02; s.es += (ax - s.es) * 0.0008;
      const tr = s.ef > 1e-9 ? clampd((s.ef - s.thr * s.es) / s.ef, 0.0, 1.0) : 0.0;
      let v = s.sat > 0 ? x + s.sat * (Math.tanh(2.0 * x) * 0.5 - x) : x;
      const e = v - s.em * s.pe; s.pe = v; v = e;
      if (s.interp !== 2) { const y = s.b0 * v + s.b1 * s.d0x + s.b2 * s.d1x - s.a1 * s.o1 - s.a2 * s.o2; s.d1x = s.d0x; s.d0x = v; s.o2 = s.o1; s.o1 = ftz(y); v = s.o1; }
      const st = s.mode === 2 ? s.st * (1.0 - 0.5 * tr) : s.st;
      s.ph += st;
      if (s.ph >= 1.0) {
        s.ph -= 1.0; const fr = st > 0 ? s.ph / st : 0.0;          // where between the last two input samples the converter clocked
        let h = v + (s.prev - v) * clampd(fr, 0.0, 1.0);
        const q = s.mode === 2 && tr > 0 ? s.q / Math.pow(2, 3.0 * tr) : s.q;
        h = Math.round(h * q) / q; h += s.cv * h * (h < 0 ? -h : h);
        if (s.nz > 0) { let z = this.rsQ[t]; z ^= z << 13; z >>>= 0; z ^= z >>> 17; z ^= z << 5; z >>>= 0; this.rsQ[t] = z; h += s.nz * (z / 4294967296.0 * 2.0 - 1.0); }
        s.h1 = s.h0; s.h0 = h;
      }
      s.prev = v;
      let y = s.interp === 1 ? s.h1 + (s.h0 - s.h1) * s.ph : s.h0;
      const la = s.mode === 1 ? s.lpA * (1.0 - 0.7 * tr) : s.lpA;
      s.lp += (y - s.lp) * la; y = s.lp;
      y = y + s.em * s.de * 0.98; s.de = y;
      let wm = s.wm;
      if (s.mode === 0) wm *= 1.0 - tr;
      else if (s.mode === 3) { if (tr > 0.5 && !s.was) s.tm = 0; s.was = tr > 0.5 ? 1 : 0; const n = 0.008 * this.sr; if (s.tm < n) { wm *= s.tm / n; s.tm++; } }
      return ftz(x + (y - x) * wm);
    }
    rsReset(s) { s.ef = s.es = s.ph = s.prev = s.d0x = s.d1x = s.o1 = s.o2 = s.pe = s.de = s.lp = s.h0 = s.h1 = 0.0; s.tm = 1e9; s.was = 0; }
    metalControl() {
      const ka = 1.0 - Math.exp(-kCR / (0.002 * this.sr));      // ~2 ms: per-step Metalise changes without clicks
      for (let t = 0; t < kT; t++) {
        if (this.mtOn[t]) {
          const tg = this.mtSrc[t] >= 0 ? this.mtSrc[t] : clampd(this.P(this.tp(t, K_METAL)), 0.0, 1.0);
          let a = this.mtS[t] + (tg - this.mtS[t]) * ka; if (Math.abs(tg - a) < 1e-5) a = tg; this.mtS[t] = a;
          if (a === 0.0 && tg === 0.0) { this.mtOn[t] = 0; this.metalReset(this.mt[t]); } else this.metalParams(this.mt[t], a);
        } else if (this.P(this.tp(t, K_METAL)) > 1e-5 && this.v[t].active) this.mtOn[t] = 1;
        const ra = clampd(this.P(this.tp(t, K_RSMP)), 0.0, 1.0);
        if (ra > 1e-5) { this.rsParams(this.rs[t], ra, Math.min(Math.max(this.Pi(this.tp(t, K_RSMODE)), 0), 3), clampd(this.P(this.tp(t, K_RSSENS)), 0.0, 1.0), this.Pi(this.tp(t, K_SMODEL))); this.rsOn[t] = 1; }
        else if (this.rsOn[t]) { this.rsOn[t] = 0; this.rsReset(this.rs[t]); }
      }
      const g = clampd(this.P(GL_METAL), 0.0, 1.0);
      if (g > 1e-5) { this.metalParams(this.mt[kT], g); this.metalParams(this.mt[kT + 1], g); this.cGm = true; }
      else if (this.cGm) { this.cGm = false; this.metalReset(this.mt[kT]); this.metalReset(this.mt[kT + 1]); }
    }
    // ---- per-track EQ: RBJ biquads; a band with 0 dB gain is off (and costs nothing)
    eqControl() {
      const sr = this.sr;
      for (let t = 0; t < kT; t++) for (let b = 0; b < 4; b++) {
        const j = t * 4 + b, g = this.P(this.tp(t, K_EQ[b][1]));
        if (g === 0.0) { this.eqOn[j] = 0; continue; }
        if (!this.eqOn[j]) { this.eqZ[j * 2] = this.eqZ[j * 2 + 1] = 0.0; this.eqOn[j] = 1; }
        const f = Math.min(this.P(this.tp(t, K_EQ[b][0])), sr * 0.45), A = Math.pow(10.0, g / 40.0), w0 = 2.0 * kPi * f / sr, cs = Math.cos(w0), sn = Math.sin(w0);
        let b0, b1, b2, a0, a1, a2;
        if (b === 0 || b === 3) {   // shelves, slope 1
          const al = sn / 2.0 * Math.SQRT2, sA = 2.0 * Math.sqrt(A) * al, s = b === 0 ? 1.0 : -1.0;
          b0 = A * ((A + 1.0) - s * (A - 1.0) * cs + sA); b1 = s * 2.0 * A * ((A - 1.0) - s * (A + 1.0) * cs); b2 = A * ((A + 1.0) - s * (A - 1.0) * cs - sA);
          a0 = (A + 1.0) + s * (A - 1.0) * cs + sA; a1 = -s * 2.0 * ((A - 1.0) + s * (A + 1.0) * cs); a2 = (A + 1.0) + s * (A - 1.0) * cs - sA;
        } else {   // peaks, Q 1
          const al = sn / 2.0;
          b0 = 1.0 + al * A; b1 = -2.0 * cs; b2 = 1.0 - al * A; a0 = 1.0 + al / A; a1 = -2.0 * cs; a2 = 1.0 - al / A;
        }
        const c = this.eqC, k = j * 5; c[k] = b0 / a0; c[k + 1] = b1 / a0; c[k + 2] = b2 / a0; c[k + 3] = a1 / a0; c[k + 4] = a2 / a0;
      }
    }
    eq(t, x) {
      for (let b = 0; b < 4; b++) {
        const j = t * 4 + b; if (!this.eqOn[j]) continue;
        const c = this.eqC, k = j * 5, z = this.eqZ, zi = j * 2;
        const y = c[k] * x + z[zi]; z[zi] = ftz(c[k + 1] * x - c[k + 3] * y + z[zi + 1]); z[zi + 1] = ftz(c[k + 2] * x - c[k + 4] * y); x = y;
      }
      return x;
    }
    // ---- tape wow and flutter (a modulated short delay) and vinyl dust (crackle + hiss), on the master
    tape(o) {
      const sr = this.sr, wow = this.P(TP_WOW), fl = this.P(TP_FL), dust = this.P(TP_DUST), N = this.tbLen;
      const w0 = this.tw; this.tb[0][w0] = o[0]; this.tb[1][w0] = o[1]; this.tw = w0 + 1 === N ? 0 : w0 + 1;
      if (wow > 1e-7 || fl > 1e-7) {
        this.wowPh += 0.55 / sr; if (this.wowPh >= 1.0) this.wowPh -= 1.0;
        this.flPh += 6.8 / sr; if (this.flPh >= 1.0) this.flPh -= 1.0;
        this.fl2Ph += 11.3 / sr; if (this.fl2Ph >= 1.0) this.fl2Ph -= 1.0;
        this.wD = clampd(this.wD * 0.99995 + (xs(this.tprng) / 4294967296.0 - 0.5) * 0.0006, -0.5, 0.5);   // slow drift: no two wows alike
        const wv = clampd(Math.sin(2.0 * kPi * this.wowPh) * 0.7 + this.wD, -1.0, 1.0), fv = Math.sin(2.0 * kPi * this.flPh) * 0.7 + Math.sin(2.0 * kPi * this.fl2Ph) * 0.3;
        const D = wow * 0.004 * sr * (1.0 + wv) + fl * 0.0006 * sr * (1.0 + fv);   // samples behind, ≥ 0 (0 = straight through)
        let rp = w0 - D; if (rp < 0) rp += N; const i0 = Math.floor(rp), fr = rp - i0, i1 = i0 + 1 === N ? 0 : i0 + 1;
        o[0] = this.tb[0][i0] + (this.tb[0][i1] - this.tb[0][i0]) * fr; o[1] = this.tb[1][i0] + (this.tb[1][i1] - this.tb[1][i0]) * fr;
      }
      if (dust > 1e-6) {
        if (xs(this.tprng) / 4294967296.0 < dust * dust * 180.0 / sr) {   // a crackle: up to ~180 a second
          const a = (xs(this.tprng) / 2147483648.0 - 1.0) * dust * 0.45;
          this.popL += a * (0.55 + 0.45 * (xs(this.tprng) / 4294967296.0)); this.popR += a * (0.55 + 0.45 * (xs(this.tprng) / 4294967296.0));
        }
        this.popL = ftz(this.popL * this.popK); this.popR = ftz(this.popR * this.popK);
        const hl = (xs(this.tprng) / 2147483648.0 - 1.0) * dust * 0.012, hr = (xs(this.tprng) / 2147483648.0 - 1.0) * dust * 0.012;
        this.hissL += (hl - this.hissL) * 0.35; this.hissR += (hr - this.hissR) * 0.35;   // warm hiss
        o[0] += this.popL + this.hissL; o[1] += this.popR + this.hissR;
      }
    }
    srcP(id) { return this.wired[id] ? this.mv[id] : this.sm[id]; }
    // ---- modulation sources: LFO 1–3, envelope follower, chaos (control rate)
    modSources() {
      const sr = this.sr;
      for (let i = 0; i < 3; i++) {
        const L = LF[i], shape = lround(this.srcP(L[1]));
        let ph = this.lfoPh[i], wrapped = false;
        if (lround(this.srcP(L[4])) === 1) { const per = LDIV[Math.min(Math.max(lround(this.srcP(L[5])), 0), 6)], np = (this.beat / per) % 1; const q = np < 0 ? np + 1 : np; wrapped = q < ph; ph = q; }
        else { ph += this.srcP(L[0]) * kCR / sr; if (ph >= 1.0) { ph -= Math.floor(ph); wrapped = true; } }
        this.lfoPh[i] = ph;
        if (wrapped || this.lfoHold[i] === 0.0) this.lfoHold[i] = xs(this.lrng) / 2147483648.0 - 1.0;
        let v;
        if (shape === 5) { const x = ph * LPTS, j = Math.min(Math.floor(x), LPTS - 1), fr = x - j, T = this.lfoTab, o = i * LPTS; v = T[o + j] + (T[o + (j + 1) % LPTS] - T[o + j]) * fr; }   // 0.9.1: drawn
        else v = shape === 0 ? Math.sin(2.0 * kPi * ph) : shape === 1 ? 1.0 - 4.0 * Math.abs(ph - 0.5) : shape === 2 ? 2.0 * ph - 1.0 : shape === 3 ? (ph < 0.5 ? 1.0 : -1.0) : this.lfoHold[i];
        this.lfoV[i] = v; this.srcV[i] = v;
      }
      { // envelope follower (peak since the last tick → attack / release)
        const pk = this.envPk; this.envPk = 0.0;
        const k = pk > this.envV ? 1.0 - Math.exp(-kCR / (clampd(this.srcP(ENV_ATT), 0.0005, 0.2) * sr)) : 1.0 - Math.exp(-kCR / (clampd(this.srcP(ENV_REL), 0.01, 2.0) * sr));
        this.envV = ftz(this.envV + (pk - this.envV) * k);
        this.srcV[3] = clampd(this.envV * this.srcP(ENV_GAIN), 0.0, 1.0);
      }
      { // chaos
        const mode = lround(this.srcP(CH_MODE)), rate = clampd(this.srcP(CH_RATE), 0.02, 20.0), dt = rate * kCR / sr;
        if (mode === 0) {   // Lorenz attractor, two Euler steps per tick
          for (let s = 0; s < 2; s++) { const h = dt * 0.5, x = this.chX, y = this.chY, z = this.chZ;
            this.chX = x + h * 10.0 * (y - x); this.chY = y + h * (x * (28.0 - z) - y); this.chZ = z + h * (x * y - 8.0 / 3.0 * z); }
          this.chOut = clampd(this.chX / 20.0, -1.0, 1.0);
        } else if (mode === 1) {   // logistic map at the rate: chaotic steps
          this.chPh += dt; if (this.chPh >= 1.0) { this.chPh -= Math.floor(this.chPh); this.chL = 3.99 * this.chL * (1.0 - this.chL); if (this.chL <= 0.0 || this.chL >= 1.0) this.chL = 0.5; }
          this.chOut = 2.0 * this.chL - 1.0;
        } else {   // drift: a bounded random walk
          this.chOut += (xs(this.chrng) / 4294967296.0 - 0.5) * dt * 4.0;
          if (this.chOut > 1.0) this.chOut = 2.0 - this.chOut; else if (this.chOut < -1.0) this.chOut = -2.0 - this.chOut;
        }
        this.srcV[4] = this.chOut;
      }
    }
    applyWires() {
      const off = this.modOff, sm = this.sm, mv = this.mv;
      for (let n = 0; n < this.nMod; n++) off[this.modList[n]] = 0.0;
      for (let w = 0; w < NWIRE; w++) { const d = this.wDst[w]; if (d >= 0) off[d] += this.wAmt[w] * this.srcV[this.wSrc[w]]; }
      for (let n = 0; n < this.nMod; n++) { const d = this.modList[n]; const v = denormP(d, normP(d, sm[d]) + off[d]); mv[d] = PSM[d] ? v : Math.round(v); }
    }
    slicerControl() {
      this.cTape = this.P(TP_WOW) > 1e-7 || this.P(TP_FL) > 1e-7 || this.P(TP_DUST) > 1e-6;
      this.cRevType = Math.min(Math.max(this.Pi(REVTYPE), 0), 3); this.cInDrums = this.Pi(IN_DRUMS) === 1;
      { const ps = this.patSl[this.cur]; this.cSlOn = ps >= 0 ? ps === 1 : this.Pi(SL_ON) === 1; } this.cSlMix = clampd(this.P(SL_MIX), 0.0, 1.0);   // 0.9: a pattern can override SLICER
      this.cSlDiv = Math.min(Math.max(this.Pi(SL_DIV), 0), 3); this.cSlBars = Math.min(Math.max(this.Pi(SL_BARS), 0), 1);
      this.cSlDen = clampd(this.P(SL_DEN), 0.0, 1.0); this.cSlEvo = clampd(this.P(SL_EVO), 0.0, 1.0); this.cSlSeed = this.Pi(SL_SEED);
      this.cSlSpeed = clampd(this.P(SL_SPEED), 0.25, 2.0); this.cSlStut = Math.min(Math.max(this.Pi(SL_STUT), 0), 4);
      this.cSlTape = clampd(this.P(SL_TAPE), 0.1, 1.0); this.cSlPitch = this.Pi(SL_PITCH); this.cSlHold = Math.min(Math.max(this.Pi(SL_HOLD), 0), 6);
    }
    publish(live) {
      const tel = this.tel;
      tel[0] = this.running ? 1 : (this.waiting ? 0.5 : 0); tel[1] = this.cur; tel[2] = this.chainPos; tel[3] = clampd(this.outEnv * 3.0, 0.0, 1.0);
      for (let t = 0; t < kT; t++) {
        const len = Math.min(Math.max(this.trkLen[this.cur * kT + t], 1), kS);
        tel[4 + t] = live && this.running && this.nextIdx[t] > 0 ? (this.nextIdx[t] - 1) % len : -1;
        tel[4 + kT + t] = this.hits[t];
        tel[4 + 2 * kT + t] = this.v[t].active ? clampd(this.v[t].amp * this.v[t].vel, 0.0, 1.0) : 0;
      }
      for (let i = 0; i < 3; i++) tel[4 + 3 * kT + i] = this.cGlOn ? this.lfoV[i] : 0;
      for (let i = 0; i < NSRC; i++) tel[4 + 3 * kT + 3 + i] = this.srcV[i];
      tel[4 + 3 * kT + 3 + NSRC] = this.cSlOn ? this.sIdx : -1; tel[4 + 3 * kT + 4 + NSRC] = this.cSlOn ? this.sAct : 0;
      const mb = 4 + 3 * kT + 5 + NSRC;   // modulated dials: where each one is now (0…1 of its travel), for the moving ring on the dial
      for (let n = 0; n < NWIRE; n++) { const d = n < this.nMod ? this.modList[n] : -1; tel[mb + 2 * n] = d; tel[mb + 2 * n + 1] = d >= 0 ? clampd(normP(d, this.mv[d]), 0.0, 1.0) : 0; }
    }
    render(L, R, frames, inL, inR) {   // inL / inR (NEW 0.8): an insert input — the AUv3 effect's source, or an audio input
      const en = this.enabledFlag !== 0;
      if (en !== this.wasEnabled) { if (!en) { for (const w of this.v) w.active = false; this.running = this.waiting = false; this.clearFx(); this.publish(false); } this.wasEnabled = en; }
      if (!en) return;
      if (this.beatSerial !== this.beatSeen) { this.beatSeen = this.beatSerial; const d = this.hostBeat - this.beat; if (Math.abs(d) > 0.25) this.beat += d; else this.beat += d * 0.1; }
      const bpm = clampd(this.tempo, 20.0, 400.0), dB = bpm / 60.0 / this.sr;
      this.envT = lround(this.P(ENV_SRC)) - 1;   // −1 = master
      this.cBpm = bpm; this.cDsec = clampd(DIVB[this.cDiv] * 60.0 / bpm, 0.01, 3.0);   // tempo is read per block, the division per control tick
      const o = this.o2;
      for (let f = 0; f < frames; f++) {
        if (this.crCount === 0) this.control();
        this.crCount = (this.crCount + 1) % kCR;
        this.sequence();
        this.beat += dB;
        let any = false; for (const w of this.v) if (w.active) { any = true; break; }
        if (!any) for (let t = 0; t < kT; t++) if (this.fxTail[t] > 0) { any = true; break; }
        if (!any && !inL && this.rvType !== 3 && !this.cGlOn && this.gMixS === 0.0 && !this.cSlOn && this.sMixS === 0.0 && !this.cTape && this.quiet > Math.trunc(this.dlyT) + Math.trunc(this.sr * 0.5)) continue;
        const solo = this.cAnySolo;
        let l = 0.0, r = 0.0, sl = 0.0, sr2 = 0.0, rl = 0.0, rr = 0.0;
        const yv = this.yr, act = this.act;
        for (let t = 0; t < kT; t++) {
          const va = this.v[t].active;
          if (!va && this.fxTail[t] <= 0) { act[t] = 0; yv[t] = 0.0; continue; }
          let y = va ? this.voiceTick(t) : 0.0;
          if (this.mtOn[t]) y = this.metalTick(this.mt[t], y);   // NEW (0.9): METALISE, then RESAMPLE
          if (this.rsOn[t]) y = this.rsTick(this.rs[t], y, t);
          if (this.psOn[t]) y = this.pshift(t, y);
          if (this.spOn[t]) y = this.spectral(t, y);
          if (va) this.fxTail[t] = (this.psOn[t] ? this.psWin + 16 : 0) + (this.spOn[t] ? 2 * SPN : 0) + (this.mtOn[t] || this.rsOn[t] ? 1024 : 0);
          else { this.fxTail[t]--; if (this.spOn[t] && this.spTail[t] > this.fxTail[t]) { this.fxTail[t] = this.spTail[t]; this.spTail[t] = 0; } }
          act[t] = 1; yv[t] = this.eq(t, y);
        }
        if (this.rOn || this.rS !== 0.0) this.ring(yv);
        const envT = this.envT;
        for (let t = 0; t < kT; t++) {
          if (!act[t]) continue;
          let y = yv[t];
          if (this.cMute[t] === 1 || (solo && this.cSolo[t] !== 1)) continue;
          y *= this.P(this.tp(t, 5)) * this.v[t].vel * this.v[t].vel;
          if (t === envT) { const a = Math.abs(y); if (a > this.envPk) this.envPk = a; }
          const yl = y * this.v[t].gl, yr = y * this.v[t].gr;
          l += yl; r += yr;
          const ds = Math.min(1.0, this.P(this.tp(t, 10)) + this.v[t].sdly), rs = Math.min(1.0, this.P(this.tp(t, 11)) + this.v[t].srev);   // track send + the step's
          sl += yl * ds; sr2 += yr * ds; rl += yl * rs; rr += yr * rs;
        }
        if (!this.cInDrums) { l = r = sl = sr2 = rl = rr = 0.0; }
        if (inL) {   // the insert input joins the mix here: through the sends, then glitch, Slicer, tape
          const xl = inL[f], xr = inR ? inR[f] : xl, g = this.P(IN_LEVEL), dg = g * this.P(IN_DLY), rg = g * this.P(IN_REV);
          l += xl * g; r += xr * g; sl += xl * dg; sr2 += xr * dg; rl += xl * rg; rr += xr * rg;
        }
        if (this.fxZero > this.dlyLen && this.rvType !== 3 && sl === 0.0 && sr2 === 0.0 && rl === 0.0 && rr === 0.0) { this.dlyT += (this.cDsec * this.sr - this.dlyT) * this.cDlyGlide; if (this.dlyT < 1.0) this.dlyT = this.cDsec * this.sr; }   // effects hold only zeros: skip them
        else { o[0] = l; o[1] = r; this.fx(o, sl, sr2, rl, rr, bpm); l = o[0]; r = o[1]; }
        { const gw = this.gw; this.gb[0][gw] = l; this.gb[1][gw] = r; this.gw = gw + 1 === this.gbLen ? 0 : gw + 1; this.gAbs++; }
        if (this.cGlOn || this.gMixS !== 0.0) { o[0] = l; o[1] = r; this.glitch(o, bpm); l = o[0]; r = o[1]; }
        { const sw = this.sw; this.sb[0][sw] = l; this.sb[1][sw] = r; this.sw = sw + 1 === this.sbLen ? 0 : sw + 1; this.sAbs++; }
        if (this.cSlOn || this.sMixS !== 0.0) { o[0] = l; o[1] = r; this.slicer(o, bpm); l = o[0]; r = o[1]; }
        if (this.cTape) { o[0] = l; o[1] = r; this.tape(o); l = o[0]; r = o[1]; }
        if (envT < 0) { const a = Math.max(Math.abs(l), Math.abs(r)); if (a > this.envPk) this.envPk = a; }
        { const p = this.P(TEMPER), tg = p > 1e-4 || p < -1e-4 ? p : 0.0;   // TEMPER: 0 = bypassed (not a sample touched)
          let tm = this.tmS;
          if (tm !== tg) { tm += (tg - tm) * this.tmA; if (Math.abs(tg - tm) < 1e-5) tm = tg; this.tmS = tm; }
          if (tm !== 0.0) { if (!this.tmLive) { this.tmLive = true; this.tmLp[0] = l; this.tmLp[1] = r; this.tmF = this.tmSl = Math.max(Math.abs(l), Math.abs(r)); }
            this.temper(o, l, r, tm); l = o[0]; r = o[1]; }
          else this.tmLive = false; }
        const lv = this.P(LEVEL);
        for (let c = 0; c < 2; c++) {
          let x = c === 0 ? l : r;
          x *= lv;
          const y = ftz(x - this.dcX[c] + 0.9995 * this.dcY[c]); this.dcX[c] = x; this.dcY[c] = y;
          const av = Math.abs(y);
          o[c] = av <= 0.8 ? y : (y < 0 ? -1.0 : 1.0) * (0.8 + 0.2 * Math.tanh((av - 0.8) / 0.2));
        }
        const e = Math.max(Math.abs(o[0]), Math.abs(o[1]));
        this.outEnv = e > this.outEnv ? e : this.outEnv * 0.9997;
        if (e < 1e-5) ++this.quiet; else this.quiet = 0;
        L[f] = Math.fround(L[f] + Math.fround(o[0])); R[f] = Math.fround(R[f] + Math.fround(o[1]));
      }
      this.publish(true);
    }
    /** TEMPER (t −1 warm … +1 cold): one light stereo-linked stage. A transient detector (fast vs slow envelope) rounds
        attacks when warm and sharpens them when cold; a 5 kHz split softens or lifts the top; warm adds the asymmetric
        tanh colour (even harmonics, what Warmth was), cold a hard knee and, past 75 %, a faint metallic edge. */
    temper(o, l, r, t) {
      const a = t < 0.0 ? -t : t, m = Math.max(Math.abs(l), Math.abs(r));
      this.tmF += (m - this.tmF) * (m > this.tmF ? this.tmFa : this.tmR);
      this.tmSl += (m - this.tmSl) * (m > this.tmSl ? this.tmSa : this.tmR);
      let tr = this.tmF / (this.tmSl + 1e-4) - 1.0; tr = tr < 0.0 ? 0.0 : tr > 2.0 ? 2.0 : tr;
      const g = 1.0 + (t > 0.0 ? 0.35 : -0.3) * a * a * tr;   // grows with the square: gentle near the centre
      for (let c = 0; c < 2; c++) {
        let x = (c === 0 ? l : r) * g;
        const lp = this.tmLp[c] = ftz(this.tmLp[c] + (x - this.tmLp[c]) * this.tmLa), h = x - lp;
        if (t < 0.0) {
          x -= a * 0.4 * h;
          const d = 1.0 + 2.5 * a, b = 0.12 * a; x += a * ((Math.tanh(d * x + b) - Math.tanh(b)) / Math.sqrt(d) - x);   // Warmth's curve, gentler drive
        } else {
          x += a * 0.6 * h;
          const ax = x < 0.0 ? -x : x; if (ax > 0.85) { const e = ax - 0.85, y = 0.85 + e / (1.0 + 2.0 * a * e); x = x < 0.0 ? -y : y; }
          if (a > 0.75) x += (a - 0.75) * 3.6 * h * (h < 0.0 ? -h : h);
        }
        o[c] = x;
      }
    }
    // ---- glitch: 3 LFOs (control rate) modulate mix / size / speed
    glitchControl() {   // LFO n → its own glitch target (Mix / Size / Speed); wires go through applyWires
      const mod = [0.0, 0.0, 0.0];
      this.cGlOn = this.Pi(GL_ON) === 1;   // (0.9.1: the switch can be wired — an LFO turns it on above the middle)
      { const ch = clampd(this.P(GL_CH), 0.0, 1.0);   // NEW (0.9.1): while ON, Metalise plays each division with this chance
        if (ch > 0.0 && this.cGlOn) { const per = GL_CHB[Math.min(Math.max(this.Pi(GL_CHD), 0), 3)], k = Math.floor(this.beat / per);
          if (k !== this.glChK) { this.glChK = k; this.glChOn = ch >= 1.0 || xs(this.glrng) / 4294967296.0 < ch; }
          if (!this.glChOn) this.cGlOn = false; }
        else this.glChK = -1e9; }
      for (let i = 0; i < 3; i++) { const L = LF[i], dest = Math.min(Math.max(this.Pi(L[3]), 0), 2); mod[dest] += this.P(L[2]) * this.lfoV[i]; }
      this.cGlMode = Math.min(Math.max(this.Pi(GL_MODE), 0), 2);
      this.cGlMix = clampd(this.P(GL_MIX) + mod[0], 0.0, 1.0);
      this.cGlSize = clampd(this.P(GL_SIZE) + mod[1], 0.0, 1.0);
      this.cGlSpeed = clampd(this.P(GL_SPEED) + mod[2], 0.0, 1.0);
    }
    gRead(c, pos) {   // history at absolute sample position pos (fractional), linear interpolation
      const N = this.gbLen, b = this.gb[c], i = Math.floor(pos), fr = pos - i;
      let a = i % N; if (a < 0) a += N; const n = a + 1 === N ? 0 : a + 1;
      return b[a] + (b[n] - b[a]) * fr;
    }
    glitch(o, bpm) {
      const sr = this.sr, N = this.gbLen, mode = this.cGlMode;
      this.gMixS += ((this.cGlOn ? this.cGlMix : 0.0) - this.gMixS) * 0.002;   // ~10 ms: on/off and LFO steps without clicks
      if (!this.cGlOn && this.gMixS < 1e-5) { this.gMixS = 0.0; this.gModeNow = -1; return; }
      if (mode !== this.gModeNow) { this.gModeNow = mode; this.gCap = -1; this.gi = 0; this.gG = 0; this.gSrc = this.gAbs - 2 * Math.round(sr * 0.01); }
      const beatLen = 60.0 / bpm * sr;
      let wl, wr;
      if (mode === 2) {   // Metal stretch: cyclic time-stretch — fixed-length grains replayed from a slowly advancing source.
        // The grain period rings as a pitch (1/grain Hz): the metallic sampler-stretch sound of 90s jungle.
        if (this.gi >= this.gG) {
          const G = Math.max(32, Math.round(sr * 0.003 * Math.pow(20.0, this.cGlSize)));   // 3–60 ms
          this.gSrc += (0.25 + 0.75 * this.cGlSpeed) * this.gG; this.gG = G; this.gi = 0;
          const lag = this.gAbs - this.gSrc;
          if (lag < G + 1 || lag > Math.min(beatLen, N * 0.45)) this.gSrc = this.gAbs - 2 * G;   // caught up / too far behind: jump
        }
        const g = this.gi++, G = this.gG, f = Math.min(1.0, g / 24.0, (G - g) / 24.0);
        wl = Math.round(this.gRead(0, this.gSrc + g) * f * 2048.0) / 2048.0;   // 12-bit, like the samplers of the day
        wr = Math.round(this.gRead(1, this.gSrc + g) * f * 2048.0) / 2048.0;
      } else {
        const sb = GL_SLICE[Math.min(4, Math.floor(this.cGlSize * 5.0))];
        const L = Math.min(N - 8, Math.max(64, Math.round(sb * beatLen))), rate = Math.pow(2.0, (this.cGlSpeed - 0.5) * 2.0);
        const per = mode === 0 ? Math.max(sb, 1.0) : sb, cap = Math.floor(this.beat / per);
        if (cap !== this.gCap) { this.gCap = cap; this.gLen = L; this.gPos = 0.0; this.gStart = mode === 0 ? this.gAbs - L : this.gAbs; }
        const p = this.gPos, f = Math.min(1.0, p / 64.0, Math.max(0.0, this.gLen - p) / 64.0);
        if (mode === 0) {   // stutter: repeat the slice that just played, re-captured each beat
          wl = this.gRead(0, this.gStart + p) * f; wr = this.gRead(1, this.gStart + p) * f;
          this.gPos += rate; if (this.gPos >= this.gLen) this.gPos -= this.gLen;
        } else {            // reverse: each slice plays the previous one backwards
          wl = this.gRead(0, this.gStart - 1 - p) * f; wr = this.gRead(1, this.gStart - 1 - p) * f;
          this.gPos = Math.min(this.gPos + rate, this.gLen);
        }
      }
      const m = this.gMixS;
      if (this.cGm) { wl = this.metalTick(this.mt[kT], wl); wr = this.metalTick(this.mt[kT + 1], wr); }   // NEW (0.9): Metalise character
      o[0] += (wl - o[0]) * m; o[1] += (wr - o[1]) * m;
    }
    // ---- per-step ring modulation: slaves × (the master track's waveform, level-normalised, or a sine)
    ring(yr) {
      const on = this.rOn && this.beat < this.rEnd; if (!on) this.rOn = false;
      this.rS += ((on ? this.rAmt : 0.0) - this.rS) * this.ringK; if (!on && this.rS < 1e-5) { this.rS = 0.0; return; }
      let c;
      if (this.rMaster >= RINGOSC) { this.rPh += this.rHz / this.sr; if (this.rPh >= 1.0) this.rPh -= 1.0; c = Math.sin(2.0 * kPi * this.rPh); }
      else { const m = yr[this.rMaster], a = Math.abs(m); this.rEnv = a > this.rEnv ? a : this.rEnv * this.rEnvK; c = this.rEnv > 0.003 ? clampd(m / this.rEnv, -1.5, 1.5) : 0.0; }
      const g = this.rS, mask = this.rMask;
      for (let t = 0; t < kT; t++) if ((mask >> t) & 1) yr[t] += (yr[t] * c - yr[t]) * g;
    }
    // ---- Slicer
    sRead(c, pos) {
      const N2 = this.sbLen, b = this.sb[c], i = Math.floor(pos), fr = pos - i;
      let a = i % N2; if (a < 0) a += N2; const n = a + 1 === N2 ? 0 : a + 1;
      return b[a] + (b[n] - b[a]) * fr;
    }
    srnd() { return xs(this.slrng) / 4294967296.0; }
    slicer(o, bpm) {
      const sr = this.sr;
      this.sMixS += ((this.cSlOn ? this.cSlMix : 0.0) - this.sMixS) * 0.002;
      if (!this.cSlOn && this.sMixS < 1e-5) { this.sMixS = 0.0; this.sCyc = -1; this.sIdx = -1; this.sHold = 0; this.dclN = 0; this.sLastP = -1.0; return; }
      const sb = SLDIVB[this.cSlDiv], cycB = Math.min((this.cSlBars + 1) * 4.0, NSLOT * sb), n = Math.round(cycB / sb);
      const cyc = Math.floor(this.beat / cycB), i = Math.min(n - 1, Math.floor((this.beat - cyc * cycB) / sb));
      const L = Math.max(64.0, Math.round(sb * 60.0 / bpm * sr));
      if (cyc !== this.sCyc) {
        const next = this.sCyc >= 0 && cyc === this.sCyc + 1;
        for (let k = 0; k < NSLOT; k++) { this.prevSt[k] = next ? this.curSt[k] : -1; this.curSt[k] = -1; }
        this.sCyc = cyc; this.sIdx = -1;
        this.slrng[0] = ((this.cSlSeed + 1) * 2654435761 + cyc * 40503) >>> 0 || 1;   // the same seed gives the same variations
      }
      let fresh = false;
      if (i !== this.sIdx) {   // a new slice: its action
        this.sIdx = i; this.curSt[i] = this.sAbs - 1; this.sStart = this.sAbs - 1; this.sL = L; fresh = true;
        let a = this.slAct[i], src = this.slSrc[i];
        const r1 = this.srnd(), r2 = this.srnd(), r3 = this.srnd(), r4 = this.srnd();
        if (a !== 0 && r1 >= this.cSlDen) a = 0;
        if (r2 < this.cSlEvo) { a = 1 + Math.floor(r3 * 11); src = Math.floor(r4 * n); }
        this.sAct = a; this.sSrc = src;
      }
      if (this.cSlHold !== this.sHold) {   // momentary hold: starts now, over everything; release → through to the next slice
        this.sHold = this.cSlHold; this.sStart = this.sAbs - 1; this.sL = L;
        this.sAct = this.sHold > 0 ? SLHOLD[this.sHold] : 0;
      } else if (fresh && this.sHold > 0) this.sAct = SLHOLD[this.sHold];
      const a = this.sAct;
      const oo = this.sAbs - this.sStart, Ls = this.sL;
      const prev = i > 0 ? this.curSt[i - 1] : this.prevSt[n - 1];
      let pos = -1.0, gain = 1.0, echo = false;
      switch (a) {
        case 1: if (prev >= 0) pos = prev + oo % Ls; break;                                              // repeat the previous slice
        case 2: { const seg = Ls / SLSTUT[this.cSlStut]; pos = this.sStart + oo % seg; break; }           // stutter
        case 3: { const base = this.prevSt[i] >= 0 ? this.prevSt[i] : prev; if (base >= 0) pos = base + (Ls - 1.0 - oo % Ls); break; }   // reverse (last cycle's slice, in place)
        case 4: { const T = Ls * this.cSlTape; if (oo < T) { pos = this.sStart + oo - oo * oo / (2.0 * T); gain = Math.min(1.0, (T - oo) / 64.0); } else gain = 0.0, pos = this.sStart; break; }   // tape stop
        case 5: { const T = Ls * this.cSlTape; pos = oo < T ? this.sStart + oo * oo / (2.0 * T) : this.sStart + T * 0.5 + (oo - T); break; }   // tape start
        case 6: case 7: { const rr = a === 6 ? Math.pow(2.0, this.cSlPitch / 12.0) : this.cSlSpeed;     // pitch / speed
          if (rr <= 1.0) pos = this.sStart + oo * rr; else if (prev >= 0) pos = prev + (oo * rr) % Ls; break; }
        case 8: gain = 0.0; pos = this.sStart; break;                                                      // gate
        case 9: { const j = Math.min(this.sSrc, n - 1); if (j !== i) { const base = j < i ? this.curSt[j] : this.prevSt[j]; if (base >= 0) pos = base + oo % Ls; } break; }   // permute
        case 10: if (prev >= 0) pos = prev + Ls * 0.5 + Ls * 0.45 * Math.sin(4.0 * kPi * oo / Ls); break;   // scratch
        case 11: if (prev >= 0) { pos = prev + oo % Ls; echo = true; } break;                               // echo: + the previous slice
      }
      if (a === 0 || pos < 0 || pos > this.sAbs - 1.0 || pos < this.sAbs - this.sbLen + 2.0) pos = -1.0;   // through (or not recorded yet / any more)
      let yl = o[0], yr = o[1];
      if (pos >= 0) {
        let wl = this.sRead(0, pos) * gain, wr = this.sRead(1, pos) * gain;
        if (echo) { wl = o[0] + 0.6 * wl; wr = o[1] + 0.6 * wr; }
        yl += (wl - yl) * this.sMixS; yr += (wr - yr) * this.sMixS;
      }
      // declick: wherever the read position jumps (a new slice, a stutter re-trigger, a loop, wet ↔ through), the jump in
      // the output is spread over 2 ms — from the sound that was playing, so a gate or a stop never lets a hit through
      const lp = this.sLastP, lg = this.sLastG; this.sLastP = pos; this.sLastG = gain;
      if ((pos < 0) !== (lp < 0) || (pos >= 0 && (fresh || Math.abs(pos - lp) > 8.0))) {
        let ql = o[0], qr = o[1];   // what the old read would have played now
        if (lp >= 0 && lp + 1.0 <= this.sAbs - 1.0) { const m = this.sMixS, g = lg; ql += (this.sRead(0, lp + 1.0) * g - ql) * m; qr += (this.sRead(1, lp + 1.0) * g - qr) * m; }
        const k0 = this.dclN / 96.0;   // a declick still running carries on from where it was
        this.dclL = ql + this.dclL * k0 - yl; this.dclR = qr + this.dclR * k0 - yr; this.dclN = 96;
      }
      if (this.dclN > 0) { const k = this.dclN / 96.0; yl += this.dclL * k; yr += this.dclR * k; this.dclN--; }
      o[0] = yl; o[1] = yr;
    }
    // ---- NEW (0.8): per-step pitch shifter and spectral processor, on the track's own sound (any engine)
    stepFx(t, nx) {
      const ps = nx && nx[0] !== 0 && nx[1] > 0, sp = nx && nx[2] > 0 && nx[4] > 0;
      if (ps) { if (!this.psOn[t]) { this.psBuf.fill(0, t * PSN, (t + 1) * PSN); this.psPh[t] = 0.0; } this.psOn[t] = 1; this.psSt[t] = Math.pow(2.0, nx[0] / 12.0); this.psMix[t] = nx[1]; }
      else this.psOn[t] = 0;
      if (sp) {
        if (!this.spOn[t]) { const b = t * SPN; this.spIn.fill(0, b, b + SPN); this.spDry.fill(0, b, b + SPN); this.spOut.fill(0, b, b + SPN); this.spMag.fill(0, t * SPK, (t + 1) * SPK); this.spCnt[t] = 0; }
        this.spOn[t] = 1; this.spA[t] = nx[2]; this.spC[t] = nx[3]; this.spMix[t] = nx[4]; this.spFirst[t] = 6;
      } else this.spOn[t] = 0;
      if (!ps && !sp) this.fxTail[t] = 0;
    }
    pshift(t, x) {   // two taps sweeping through a 30 ms window, crossfaded with sin²: classic granular shift, ±24 semitones
      const b = t * PSN, W = this.psWin; let w = this.psW[t];
      this.psBuf[b + w] = x; w = (w + 1) & (PSN - 1); this.psW[t] = w;
      let ph = this.psPh[t] + (1.0 - this.psSt[t]) / W; ph -= Math.floor(ph); this.psPh[t] = ph;
      const p2 = ph >= 0.5 ? ph - 0.5 : ph + 0.5;
      const s1 = Math.sin(kPi * ph), s2 = Math.sin(kPi * p2);
      const wet = s1 * s1 * this.psRead(b, w, ph * W) + s2 * s2 * this.psRead(b, w, p2 * W);
      return x + (wet - x) * this.psMix[t];
    }
    psRead(b, w, d) { const B = this.psBuf; let rp = w - 1 - d; if (rp < 0) rp += PSN; const i0 = Math.floor(rp), fr = rp - i0, i1 = (i0 + 1) & (PSN - 1); return B[b + i0] + (B[b + i1] - B[b + i0]) * fr; }
    spectral(t, x) {   // STFT 256 / hop 64 (Hann, 75 % overlap); dry and wet both delayed 256 samples (5 ms) so they line up
      const b = t * SPN; let pos = this.spPos[t];
      this.spIn[b + pos] = x; const dry = this.spDry[b + pos]; this.spDry[b + pos] = x;
      const out = this.spOut[b + pos]; this.spOut[b + pos] = 0.0;
      pos = pos + 1 === SPN ? 0 : pos + 1; this.spPos[t] = pos;
      if (++this.spCnt[t] >= SPH) { this.spCnt[t] = 0; this.spFrame(t, pos); }
      return dry + (out - dry) * this.spMix[t];
    }
    /* Colour (0…1) runs through six manipulations — SMEAR · SHIFT · HARMONIC · ROBOT · WHISPER · FREEZE — and where it sits inside
       each one sets that manipulation's own control; Spectral (0…1) is how far it goes:
         SMEAR     time smear (Spectral) + frequency blur width (Colour)          SHIFT    bins move down ← Colour → up, by Spectral
         HARMONIC  a comb on a fundamental (Colour: 280 Hz → 2.9 kHz), depth       ROBOT    phases flattened + a spectral tilt (Colour)
         WHISPER   phases scattered + a spectral gate (Colour: threshold)          FREEZE   holds the loudest frame, sustain from Colour */
    spFrame(t, pos) {
      const re = this.spRe, im = this.spIm, b = t * SPN, a = this.spA[t], c = this.spC[t];
      for (let i = 0; i < SPN; i++) { const j = pos + i < SPN ? pos + i : pos + i - SPN; re[i] = this.spIn[b + j] * SP_WIN[i]; im[i] = 0.0; }
      fft(re, im, false);
      const z = Math.min(5, Math.floor(c * 6.0)), f = c * 6.0 - z, M = this.spMag, P2 = this.spPh, mb = t * SPK, m = this.spM;
      let mx = 0.0, en = 0.0;
      for (let k = 0; k < SPK; k++) { m[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]); if (m[k] > mx) mx = m[k]; en += m[k] * m[k]; }
      if (z === 0) {   // SMEAR
        const keep = 0.97 * a, T = this.spT;
        for (let k = 0; k < SPK; k++) { M[mb + k] = ftz(M[mb + k] + (m[k] - M[mb + k]) * (1.0 - keep)); T[k] = M[mb + k]; }
        const wd = Math.round(f * 6.0 * a);
        for (let k = 0; k < SPK; k++) {
          let s = 0.0, n = 0; for (let q = k - wd; q <= k + wd; q++) if (q >= 0 && q < SPK) { s += T[q]; n++; }
          const g = (s / n) / (m[k] + 1e-12); re[k] *= g; im[k] *= g;
        }
      } else if (z === 1) {   // SHIFT
        const sh = Math.round((f * 2.0 - 1.0) * a * 40.0), T = this.spT, U = m;
        for (let k = 0; k < SPK; k++) { T[k] = re[k]; U[k] = im[k]; }
        for (let k = 0; k < SPK; k++) { const q = k - sh; if (q >= 0 && q < SPK) { re[k] = T[q]; im[k] = U[q]; } else { re[k] = 0.0; im[k] = 0.0; } }
      } else if (z === 2) {   // HARMONIC
        const F = 1.5 + f * 14.0, ex = 1.0 + a * 8.0;
        for (let k = 0; k < SPK; k++) { const g = (1.0 - a) + a * Math.pow(Math.abs(Math.cos(kPi * k / F)), ex); re[k] *= g; im[k] *= g; }
      } else if (z === 3) {   // ROBOT
        const ex = (f - 0.5) * 3.0 * a;
        for (let k = 0; k < SPK; k++) { const g = Math.pow((k + 1) / SPK, ex); re[k] = (re[k] * (1.0 - a) + m[k] * a) * g; im[k] = im[k] * (1.0 - a) * g; }
      } else if (z === 4) {   // WHISPER
        const thr = f * f * a * 0.25 * mx;
        for (let k = 0; k < SPK; k++) {
          if (m[k] < thr) { re[k] = 0.0; im[k] = 0.0; continue; }
          const th = a * kPi * (xs(this.sprng) / 2147483648.0 - 1.0), cs = Math.cos(th), sn = Math.sin(th), r0 = re[k];
          re[k] = r0 * cs - im[k] * sn; im[k] = r0 * sn + im[k] * cs;
        }
      } else {   // FREEZE
        let me = 0.0; for (let k = 0; k < SPK; k++) me += M[mb + k] * M[mb + k];
        if (this.spFirst[t] > 0 && en > me) for (let k = 0; k < SPK; k++) { M[mb + k] = m[k]; P2[mb + k] = Math.atan2(im[k], re[k]); }   // catch the loudest of the first frames
        else { const dec = Math.exp(-SPH / (this.sr * (0.15 + f * 6.0))); for (let k = 0; k < SPK; k++) { M[mb + k] = ftz(M[mb + k] * dec); P2[mb + k] += 2.0 * kPi * k * SPH / SPN; if (P2[mb + k] > 1e6) P2[mb + k] -= 2.0 * kPi * Math.floor(P2[mb + k] / (2.0 * kPi)); } }
        for (let k = 0; k < SPK; k++) { const ph = P2[mb + k]; re[k] = re[k] * (1.0 - a) + M[mb + k] * Math.cos(ph) * a; im[k] = im[k] * (1.0 - a) + M[mb + k] * Math.sin(ph) * a; }
      }
      if (this.spFirst[t] > 0) this.spFirst[t]--;
      im[0] = 0.0; im[SPN / 2] = 0.0;
      let oe = 0.0;
      for (let k = 1; k < SPN / 2; k++) { re[SPN - k] = re[k]; im[SPN - k] = -im[k]; }
      for (let k = 0; k < SPK; k++) oe += re[k] * re[k] + im[k] * im[k];
      fft(re, im, true);
      const g = 1.0 / (SPN * 1.5);
      for (let i = 0; i < SPN; i++) { const j = pos + i < SPN ? pos + i : pos + i - SPN; this.spOut[b + j] += re[i] * SP_WIN[i] * g; }
      this.spTail[t] = oe > 1e-12 ? 3 * SPN : 0;
    }
    // ---- NEW (0.8): reverb types
    rvClear() {
      for (const b of this.rvC) if (b) b.fill(0); for (const b of this.rvA) if (b) b.fill(0); this.rvF.fill(0); this.rvCP.fill(0); this.rvAP.fill(0);
      this.spgAp.fill(0); this.spgLp.fill(0); if (this.spgBuf[0]) { this.spgBuf[0].fill(0); this.spgBuf[1].fill(0); } this.spgPos = 0;
      this.gtEnv = 0.0; this.gtHold = 0; this.gtG = 0.0;
      if (this.fdnBuf) this.fdnBuf.fill(0); this.fdnPos = 0; this.fdnLp.fill(0); this.fdnPh.fill(0); this.xpLast.fill(0);
      for (const b of this.xpAp) if (b) b.fill(0); this.xpApP.fill(0);
    }
    room(o, inp, rfb, damp, gain) {   // Vektur Pulse's reverb (8 combs + 4 allpasses per side)
      const F = this.rvF; let nz = false;
      for (let c = 0; c < 2; c++) {
        let acc = 0.0;
        for (let k = 0; k < 8; k++) {
          const j = c * 8 + k, b = this.rvC[j]; let p = this.rvCP[j];
          const y = b[p];
          F[j] = ftz(y * (1.0 - damp) + F[j] * damp);
          b[p] = inp + F[j] * rfb;
          nz = nz || y !== 0.0 || b[p] !== 0.0;
          if (++p >= this.rvCL[j]) p = 0; this.rvCP[j] = p;
          acc += y;
        }
        for (let k = 0; k < 4; k++) {
          const j = c * 4 + k, b = this.rvA[j]; let p = this.rvAP[j];
          const bo = b[p];
          b[p] = ftz(acc + bo * 0.5);
          nz = nz || bo !== 0.0 || b[p] !== 0.0;
          acc = bo - acc;
          if (++p >= this.rvAL[j]) p = 0; this.rvAP[j] = p;
        }
        o[c] += acc * 3.0 * gain;
      }
      if (!nz) for (let j = 0; j < 16; j++) if (F[j] !== 0.0) { nz = true; break; }
      return nz;
    }
    spring(o, inp) {   // two dispersive loops (16 first-order allpasses each, a chirpy "boing"), damped, ~45 / 51 ms
      const size = this.P(REVSIZE), damp = this.P(REVDAMP), fb = 0.45 + 0.45 * size, lpk = 1.0 - damp * 0.7; let nz = false;
      for (let c = 0; c < 2; c++) {
        const buf = this.spgBuf[c], L = buf.length, p = this.spgPos % L, d = buf[p];
        this.spgLp[c] = ftz(this.spgLp[c] + (d - this.spgLp[c]) * lpk);
        let x = inp * 4.0 + fb * this.spgLp[c]; const a = c ? -0.62 : -0.56;
        for (let s = 0; s < 16; s++) { const j = c * 16 + s, y = a * x + this.spgAp[j]; this.spgAp[j] = ftz(x - a * y); x = y; }
        buf[p] = x; o[c] += d * 1.4;
        nz = nz || d !== 0.0 || x !== 0.0;
      }
      this.spgPos = this.spgPos + 1 >= 0x3fffffff ? 0 : this.spgPos + 1;
      return nz;
    }
    gate(o, inp, lvl) {   // the 80s gated reverb: a dense room, cut off after Size's hold (60–560 ms)
      const size = this.P(REVSIZE);
      if (lvl > 0.02) this.gtHold = lround((0.06 + 0.5 * size) * this.sr);
      const tg = this.gtHold > 0 ? 1.0 : 0.0; if (this.gtHold > 0) this.gtHold--;
      this.gtG += (tg - this.gtG) * (tg > this.gtG ? 0.2 : 0.004);
      return this.room(o, inp * 1.4, 0.7 + 0.28 * 0.93, this.P(REVDAMP) * 0.4, this.gtG) || this.gtG > 1e-6;
    }
    expControl() {   // Expanse coefficients — inputs change only at control rate, so this is identical to per-sample
      const sr = this.sr, s = this.P(REVSIZE), fz = clampd((s - 0.95) / 0.05, 0.0, 1.0), wash = clampd((s - 0.9) / 0.05, 0.0, 1.0);
      const rt = s >= 0.9 ? 12.0 + wash * 48.0 : 1.5 + s / 0.9 * 10.5, scale = 1.0 + 1.2 * s;
      this.xpFz = fz; this.xpScale = scale; this.xpDepth = (4.0 + wash * 14.0) * sr / 48000.0; this.xpDk = this.P(REVDAMP) * 0.5 * (1.0 - fz);
      for (let i = 0; i < 8; i++) { const d = this.fdnLen[i] * scale; let g = Math.pow(10.0, -3.0 * d / (rt * sr)); g += (1.0 - g) * fz; this.xpG[i] = g; }
    }
    expanse(o, inp) {   // 8-line feedback delay network, up to 12 s; 90–95 %: up to 60 s washes; 95–100 %: freeze
      const sr = this.sr, fz = this.xpFz, scale = this.xpScale, depth = this.xpDepth, dk = this.xpDk, G = this.xpG;
      const M = this.fdnMax, B = this.fdnBuf, pos = this.fdnPos, y = this.xpLast;
      let x = inp * 2.0 * (1.0 - fz);
      for (let i = 0; i < 4; i++) { const ab = this.xpAp[i], p = this.xpApP[i], bo = ab[p]; ab[p] = ftz(x + bo * 0.6); x = bo - x * 0.6; this.xpApP[i] = p + 1 >= this.xpApL[i] ? 0 : p + 1; }
      let sum = 0.0;
      for (let i = 0; i < 8; i++) {
        this.fdnPh[i] += FDN_RATE[i] / sr; if (this.fdnPh[i] >= 1.0) this.fdnPh[i] -= 1.0;
        const d = this.fdnLen[i] * scale + depth * (1.0 + Math.sin(2.0 * kPi * this.fdnPh[i]));
        let rp = pos - d; if (rp < 0) rp += M; const i0 = Math.floor(rp), fr = rp - i0, i1 = i0 + 1 === M ? 0 : i0 + 1, bb = i * M;
        const v = B[bb + i0] + (B[bb + i1] - B[bb + i0]) * fr;
        this.fdnLp[i] = ftz(v * (1.0 - dk) + this.fdnLp[i] * dk); y[i] = this.fdnLp[i]; sum += y[i];
      }
      let nz = false;
      for (let i = 0; i < 8; i++) {
        B[i * M + pos] = ftz((i & 1 ? -x : x) * 0.5 + (y[i] - sum * 0.25) * G[i]);
        nz = nz || y[i] !== 0.0;
      }
      this.fdnPos = pos + 1 === M ? 0 : pos + 1;
      o[0] += (y[0] + y[2] + y[4] + y[6]) * 0.7; o[1] += (y[1] + y[3] + y[5] + y[7]) * 0.7;
      return nz || x !== 0.0;
    }
    fx(o, sl, sr2, rl, rr, bpm) {
      const sr = this.sr;
      const dsec = this.cDsec;
      this.dlyT += (dsec * sr - this.dlyT) * this.cDlyGlide;
      if (this.dlyT < 1.0) this.dlyT = dsec * sr;
      let rp = this.dlyPos - this.dlyT; if (rp < 0.0) rp += this.dlyLen;
      const i0 = Math.trunc(rp), fr = rp - i0, i1 = (i0 + 1) % this.dlyLen;
      const lpA = this.cLpA, fb = this.P(DLYFB);
      const dl = this.dly, lp = this.dlyLp;
      for (let c = 0; c < 2; c++) { const d = dl[c][i0] + (dl[c][i1] - dl[c][i0]) * fr; lp[c] = ftz(lp[c] + (d - lp[c]) * lpA); }
      if (this.cPP) { dl[0][this.dlyPos] = (sl + sr2) * 0.5 + lp[1] * fb; dl[1][this.dlyPos] = lp[0] * fb; }
      else { dl[0][this.dlyPos] = sl + lp[0] * fb; dl[1][this.dlyPos] = sr2 + lp[1] * fb; }
      let nz = dl[0][this.dlyPos] !== 0.0 || dl[1][this.dlyPos] !== 0.0 || lp[0] !== 0.0 || lp[1] !== 0.0;
      this.dlyPos = (this.dlyPos + 1) % this.dlyLen;
      o[0] += lp[0]; o[1] += lp[1];
      const inp = (rl + rr) * 0.5 * 0.015, rt = this.cRevType;
      if (rt !== this.rvType) { if (this.rvType >= 0) this.rvClear(); this.rvType = rt; }   // a new type starts clean
      if (rt === 0) nz = this.room(o, inp, 0.7 + this.P(REVSIZE) * 0.28, this.P(REVDAMP) * 0.4, 1.0) || nz;
      else if (rt === 1) nz = this.spring(o, inp) || nz;
      else if (rt === 2) nz = this.gate(o, inp, Math.abs(rl) + Math.abs(rr)) || nz;
      else nz = this.expanse(o, inp) || nz;
      // zero-run bookkeeping for the skip in render() (see Drums.h)
      this.fxZero = nz ? 0 : this.fxZero + 1;
    }
  }
  return Drums;
}
