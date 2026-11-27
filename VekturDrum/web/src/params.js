/* Vektur Drum — parameter table.
   DRUM_PARAMS_PULSE is Vektur VJ's table (tools/drumspec.py), verbatim: tracks 1–6 keep its exact defaults, and its
   per-track order (0–14) stays first, so Vektur Pulse kits load unchanged. The table below extends it to 9 tracks,
   adds the per-track engine, choke group, pitch sweep and FM parameters (template indices 15–27), and the global
   glitch with 3 LFOs. Rows: [key, name, section, kind, min, max, default, scale, unit, choices]. */
const DRUM_NAME = "Vektur Drum";
const DRUM_PARAMS_PULSE = [["t1.model", "Model", "Track 1", "enum", 0, 7, 0, "lin", "", ["Kick", "Snare", "Closed hat", "Open hat", "Clap", "Tom", "Rim", "Bell"]], ["t1.tune", "Tune", "Track 1", "cont", -24, 24, 0, "lin", "st", []], ["t1.decay", "Decay", "Track 1", "cont", 0.01, 3, 0.55, "log", "s", []], ["t1.tone", "Tone", "Track 1", "cont", 0, 1, 0.5, "lin", "", []], ["t1.snap", "Snap", "Track 1", "cont", 0, 1, 0.35, "lin", "", []], ["t1.level", "Level", "Track 1", "cont", 0, 1, 0.9, "lin", "", []], ["t1.pan", "Pan", "Track 1", "cont", -1, 1, 0, "lin", "", []], ["t1.bend", "Bend", "Track 1", "cont", -12, 12, 0, "lin", "st", []], ["t1.bits", "Bits", "Track 1", "int", 2, 16, 16, "lin", "", []], ["t1.rate", "Rate", "Track 1", "cont", 500, 48000, 48000, "log", "Hz", []], ["t1.dly", "Delay", "Track 1", "cont", 0, 1, 0, "lin", "", []], ["t1.rev", "Reverb", "Track 1", "cont", 0, 1, 0, "lin", "", []], ["t1.mute", "Mute", "Track 1", "bool", 0, 1, 0, "lin", "", []], ["t1.solo", "Solo", "Track 1", "bool", 0, 1, 0, "lin", "", []], ["t1.brate", "Bend rate", "Track 1", "cont", 0, 20, 0, "log", "Hz", []], ["t2.model", "Model", "Track 2", "enum", 0, 7, 1, "lin", "", ["Kick", "Snare", "Closed hat", "Open hat", "Clap", "Tom", "Rim", "Bell"]], ["t2.tune", "Tune", "Track 2", "cont", -24, 24, 0, "lin", "st", []], ["t2.decay", "Decay", "Track 2", "cont", 0.01, 3, 0.22, "log", "s", []], ["t2.tone", "Tone", "Track 2", "cont", 0, 1, 0.55, "lin", "", []], ["t2.snap", "Snap", "Track 2", "cont", 0, 1, 0.6, "lin", "", []], ["t2.level", "Level", "Track 2", "cont", 0, 1, 0.75, "lin", "", []], ["t2.pan", "Pan", "Track 2", "cont", -1, 1, 0, "lin", "", []], ["t2.bend", "Bend", "Track 2", "cont", -12, 12, 0, "lin", "st", []], ["t2.bits", "Bits", "Track 2", "int", 2, 16, 16, "lin", "", []], ["t2.rate", "Rate", "Track 2", "cont", 500, 48000, 48000, "log", "Hz", []], ["t2.dly", "Delay", "Track 2", "cont", 0, 1, 0, "lin", "", []], ["t2.rev", "Reverb", "Track 2", "cont", 0, 1, 0, "lin", "", []], ["t2.mute", "Mute", "Track 2", "bool", 0, 1, 0, "lin", "", []], ["t2.solo", "Solo", "Track 2", "bool", 0, 1, 0, "lin", "", []], ["t2.brate", "Bend rate", "Track 2", "cont", 0, 20, 0, "log", "Hz", []], ["t3.model", "Model", "Track 3", "enum", 0, 7, 2, "lin", "", ["Kick", "Snare", "Closed hat", "Open hat", "Clap", "Tom", "Rim", "Bell"]], ["t3.tune", "Tune", "Track 3", "cont", -24, 24, 0, "lin", "st", []], ["t3.decay", "Decay", "Track 3", "cont", 0.01, 3, 0.05, "log", "s", []], ["t3.tone", "Tone", "Track 3", "cont", 0, 1, 0.6, "lin", "", []], ["t3.snap", "Snap", "Track 3", "cont", 0, 1, 0.3, "lin", "", []], ["t3.level", "Level", "Track 3", "cont", 0, 1, 0.55, "lin", "", []], ["t3.pan", "Pan", "Track 3", "cont", -1, 1, 0.1, "lin", "", []], ["t3.bend", "Bend", "Track 3", "cont", -12, 12, 0, "lin", "st", []], ["t3.bits", "Bits", "Track 3", "int", 2, 16, 16, "lin", "", []], ["t3.rate", "Rate", "Track 3", "cont", 500, 48000, 48000, "log", "Hz", []], ["t3.dly", "Delay", "Track 3", "cont", 0, 1, 0, "lin", "", []], ["t3.rev", "Reverb", "Track 3", "cont", 0, 1, 0, "lin", "", []], ["t3.mute", "Mute", "Track 3", "bool", 0, 1, 0, "lin", "", []], ["t3.solo", "Solo", "Track 3", "bool", 0, 1, 0, "lin", "", []], ["t3.brate", "Bend rate", "Track 3", "cont", 0, 20, 0, "log", "Hz", []], ["t4.model", "Model", "Track 4", "enum", 0, 7, 3, "lin", "", ["Kick", "Snare", "Closed hat", "Open hat", "Clap", "Tom", "Rim", "Bell"]], ["t4.tune", "Tune", "Track 4", "cont", -24, 24, 0, "lin", "st", []], ["t4.decay", "Decay", "Track 4", "cont", 0.01, 3, 0.45, "log", "s", []], ["t4.tone", "Tone", "Track 4", "cont", 0, 1, 0.6, "lin", "", []], ["t4.snap", "Snap", "Track 4", "cont", 0, 1, 0.3, "lin", "", []], ["t4.level", "Level", "Track 4", "cont", 0, 1, 0.5, "lin", "", []], ["t4.pan", "Pan", "Track 4", "cont", -1, 1, 0.1, "lin", "", []], ["t4.bend", "Bend", "Track 4", "cont", -12, 12, 0, "lin", "st", []], ["t4.bits", "Bits", "Track 4", "int", 2, 16, 16, "lin", "", []], ["t4.rate", "Rate", "Track 4", "cont", 500, 48000, 48000, "log", "Hz", []], ["t4.dly", "Delay", "Track 4", "cont", 0, 1, 0, "lin", "", []], ["t4.rev", "Reverb", "Track 4", "cont", 0, 1, 0, "lin", "", []], ["t4.mute", "Mute", "Track 4", "bool", 0, 1, 0, "lin", "", []], ["t4.solo", "Solo", "Track 4", "bool", 0, 1, 0, "lin", "", []], ["t4.brate", "Bend rate", "Track 4", "cont", 0, 20, 0, "log", "Hz", []], ["t5.model", "Model", "Track 5", "enum", 0, 7, 4, "lin", "", ["Kick", "Snare", "Closed hat", "Open hat", "Clap", "Tom", "Rim", "Bell"]], ["t5.tune", "Tune", "Track 5", "cont", -24, 24, 0, "lin", "st", []], ["t5.decay", "Decay", "Track 5", "cont", 0.01, 3, 0.3, "log", "s", []], ["t5.tone", "Tone", "Track 5", "cont", 0, 1, 0.5, "lin", "", []], ["t5.snap", "Snap", "Track 5", "cont", 0, 1, 0.6, "lin", "", []], ["t5.level", "Level", "Track 5", "cont", 0, 1, 0.65, "lin", "", []], ["t5.pan", "Pan", "Track 5", "cont", -1, 1, -0.1, "lin", "", []], ["t5.bend", "Bend", "Track 5", "cont", -12, 12, 0, "lin", "st", []], ["t5.bits", "Bits", "Track 5", "int", 2, 16, 16, "lin", "", []], ["t5.rate", "Rate", "Track 5", "cont", 500, 48000, 48000, "log", "Hz", []], ["t5.dly", "Delay", "Track 5", "cont", 0, 1, 0, "lin", "", []], ["t5.rev", "Reverb", "Track 5", "cont", 0, 1, 0, "lin", "", []], ["t5.mute", "Mute", "Track 5", "bool", 0, 1, 0, "lin", "", []], ["t5.solo", "Solo", "Track 5", "bool", 0, 1, 0, "lin", "", []], ["t5.brate", "Bend rate", "Track 5", "cont", 0, 20, 0, "log", "Hz", []], ["t6.model", "Model", "Track 6", "enum", 0, 7, 5, "lin", "", ["Kick", "Snare", "Closed hat", "Open hat", "Clap", "Tom", "Rim", "Bell"]], ["t6.tune", "Tune", "Track 6", "cont", -24, 24, 0, "lin", "st", []], ["t6.decay", "Decay", "Track 6", "cont", 0.01, 3, 0.45, "log", "s", []], ["t6.tone", "Tone", "Track 6", "cont", 0, 1, 0.4, "lin", "", []], ["t6.snap", "Snap", "Track 6", "cont", 0, 1, 0.3, "lin", "", []], ["t6.level", "Level", "Track 6", "cont", 0, 1, 0.7, "lin", "", []], ["t6.pan", "Pan", "Track 6", "cont", -1, 1, -0.15, "lin", "", []], ["t6.bend", "Bend", "Track 6", "cont", -12, 12, 0, "lin", "st", []], ["t6.bits", "Bits", "Track 6", "int", 2, 16, 16, "lin", "", []], ["t6.rate", "Rate", "Track 6", "cont", 500, 48000, 48000, "log", "Hz", []], ["t6.dly", "Delay", "Track 6", "cont", 0, 1, 0, "lin", "", []], ["t6.rev", "Reverb", "Track 6", "cont", 0, 1, 0, "lin", "", []], ["t6.mute", "Mute", "Track 6", "bool", 0, 1, 0, "lin", "", []], ["t6.solo", "Solo", "Track 6", "bool", 0, 1, 0, "lin", "", []], ["t6.brate", "Bend rate", "Track 6", "cont", 0, 20, 0, "log", "Hz", []], ["dr.ch", "MIDI channel", "Master", "int", 0, 16, 10, "lin", "", []], ["dr.swing", "Swing", "Master", "cont", 0, 0.75, 0, "lin", "", []], ["dr.temper", "Temper", "Master", "cont", -1, 1, 0, "lin", "", []], ["dr.level", "Level", "Master", "cont", 0, 1, 0.8, "lin", "", []], ["dr.choke", "Hat choke", "Master", "bool", 0, 1, 1, "lin", "", []], ["dr.dlydiv", "Time", "Delay", "enum", 0, 9, 4, "lin", "", ["1/4", "1/4T", "1/8", "1/8T", "1/8.", "1/16", "1/16T", "1/16.", "1/32", "1/32T"]], ["dr.dlyfb", "Feedback", "Delay", "cont", 0, 0.9, 0.4, "lin", "", []], ["dr.dlytone", "Tone", "Delay", "cont", 0, 1, 0.5, "lin", "", []], ["dr.dlypp", "Ping-pong", "Delay", "bool", 0, 1, 1, "lin", "", []], ["dr.revsize", "Size", "Reverb", "cont", 0, 1, 0.6, "lin", "", []], ["dr.revdamp", "Damping", "Reverb", "cont", 0, 1, 0.4, "lin", "", []]];
const DRUM_DIVS = ["1/4", "1/4T", "1/8", "1/8T", "1/8.", "1/16", "1/16T", "1/16.", "1/32", "1/32T"];
const DRUM_DIV_BEATS = [1.0, 0.6666666666666666, 0.5, 0.3333333333333333, 0.75, 0.25, 0.16666666666666666, 0.375, 0.125, 0.08333333333333333];
const DRUM_DEF_DIV = 5;
const DRUM_TRACKS = 12;                                       // storage and maximum; the project picks 6–12 (0.9: was 9)
const DRUM_NOTES = [36, 38, 42, 46, 39, 45, 37, 56, 49, 50, 51, 54];   // GM: … tracks 7–9 side stick, cowbell, crash · 10–12 high tom, ride, tambourine
const DRUM_MODELS = ["Kick", "Snare", "Closed hat", "Open hat", "Clap", "Tom", "Rim", "Bell"];
const DRUM_ENGINES = ["Drum synth", "Sample", "FM"];
const FM_ALGOS = ["Classic", "Stack", "Parallel", "Ring metal"];
const CHOKE_GROUPS = ["None", "A", "B", "C", "D"];
const GLITCH_MODES = ["Stutter", "Reverse", "Metal stretch"];
const REV_TYPES = ["Room", "Spring", "Gate", "Expanse"];   // NEW (0.8): Expanse 90–95 % = endless washes, 95–100 % = freeze
const SPEC_ZONES = ["Smear", "Shift", "Harmonic", "Robot", "Whisper", "Freeze"];   // NEW (0.8): the per-step spectral Colour dial
const LFO_SHAPES = ["Sine", "Triangle", "Saw", "Square", "S&H", "Draw"];   // 0.9.1: Draw = the LFO's own 16-point shape
const LFO_DESTS = ["Metal mix", "Metal grain", "Metal stretch"];   // (0.8) the LFOs' own targets: Metalise (the old glitch)
const LFO_DIVS = ["4 bars", "2 bars", "1 bar", "1/2", "1/4", "1/8", "1/16"];
const SL_DIVS = ["1/32", "1/16", "1/8", "1/4"], SL_DIV_BEATS = [0.125, 0.25, 0.5, 1];
const SL_STUTTER = ["×2", "×3", "×4", "×6", "×8"], SL_STUTTER_N = [2, 3, 4, 6, 8];
const SL_HOLD = ["Off", "Stutter", "Reverse", "Tape stop", "Pitch", "Gate", "Scratch"];
/* Slicer actions (the program): what each slice of the cycle plays. */
const SL_ACTIONS = ["Thru", "Repeat", "Stutter", "Reverse", "Tape stop", "Tape start", "Pitch", "Speed", "Gate", "Permute", "Scratch", "Echo"];
const SL_SHORT = ["·", "RPT", "STT", "REV", "STOP", "STRT", "PTCH", "SPD", "GATE", "PERM", "SCR", "ECHO"];
const SL_SLOTS = 32;
const MOD_SOURCES = ["LFO 1", "LFO 2", "LFO 3", "Env follower", "Chaos"];
const MOD_WIRES = 32;
const ENV_SRCS = ["Master", ...Array.from({ length: 12 }, (_, i) => "Track " + (i + 1))];
const CHAOS_MODES = ["Lorenz", "Logistic", "Drift"];
const RING_OSC = 12;   // ring master 0–11 = tracks 1–12, 12 = the ring's own sine oscillator (0.9: was 9 — older steps are migrated)
const RS_MODES = ["Preserve", "Round", "Crush", "Rebuild"];   // NEW (0.9): RESAMPLE transient handling
const TS_MODES = ["Rate", "Stretch", "Tempo lock"];   // NEW (0.9): sample tune — Rate: pitch and length · Stretch: pitch only, length × Stretch · Tempo lock: stretched to the master tempo from the sample's BPM
/** NEW (0.9): vintage sampler models (generic: bit depth / rate / converter character) — RESAMPLE takes a track towards one.
    [name, bits, rate Hz, interpolation 0 hold · 1 linear · 2 drop-sample, input filter (× rate), emphasis, converter curve, noise]. */
const SAMPLER_MODELS = [
  ["12-bit 26k", 12, 26040, 0, 0.42, 0.55, 0.35, 0.0006],
  ["12-bit 40k", 12, 40000, 1, 0.45, 0.35, 0.25, 0.0004],
  ["16-bit 44k", 16, 44100, 1, 0.47, 0.15, 0.08, 0.00005],
  ["16-bit 32k", 16, 32000, 1, 0.44, 0.25, 0.12, 0.0001],
  ["8-bit 22k", 8, 22050, 2, 0.4, 0.6, 0.5, 0.002],
  ["8-bit 11k", 8, 11025, 0, 0.38, 0.7, 0.6, 0.003],
];
const SAMPLER_MODEL_NAMES = SAMPLER_MODELS.map(m => m[0]);
const LFO_DIV_BEATS = [16, 8, 4, 2, 1, 0.5, 0.25];
const GL_CHDIVS = ["1/16", "1/8", "1/4", "1 bar"], GL_CHDIV_BEATS = [0.25, 0.5, 1, 4];   // NEW (0.9.1): Metalise chance division

const DRUM_PARAMS = (() => {
  const pulseTrack = t => DRUM_PARAMS_PULSE.filter(p => p[0].startsWith(`t${t}.`));
  const tmpl = pulseTrack(1).map(p => p[0].slice(3));             // the 15 Pulse keys, in order
  // tracks 7–9 (new): rim, an FM metal percussion, an FM tom with a downward sweep
  const base7_9 = {   // (0.9: tracks 7–12)
    7: { model: 6, decay: 0.08, tone: 0.55, snap: 0.5, level: 0.5, pan: 0.2 },
    8: { model: 7, decay: 0.28, tone: 0.5, snap: 0.3, level: 0.42, pan: -0.25 },
    9: { model: 5, decay: 0.4, tone: 0.5, snap: 0.3, level: 0.55, pan: 0.25 },
    10: { model: 5, tune: 7, decay: 0.3, tone: 0.55, snap: 0.3, level: 0.5, pan: -0.3 },     // NEW (0.9): a high tom
    11: { model: 3, tune: -5, decay: 0.9, tone: 0.45, snap: 0.2, level: 0.32, pan: 0.35 },   // ride (FM below)
    12: { model: 2, tune: 3, decay: 0.09, tone: 0.75, snap: 0.6, level: 0.35, pan: -0.35 },  // tambourine-like shake
  };
  const extra = {   // per-track additions (template 15–27): defaults, with per-track overrides
    engine: ["Engine", "enum", 0, 2, 0, "lin", "", DRUM_ENGINES],
    choke: ["Choke", "enum", 0, 4, 0, "lin", "", CHOKE_GROUPS],
    sweep: ["Sweep", "cont", -48, 48, 0, "lin", "st", []],
    swtime: ["Sweep time", "cont", 0.005, 2, 0.08, "log", "s", []],
    fmalgo: ["Algorithm", "enum", 0, 3, 0, "lin", "", FM_ALGOS],
    fmfreq: ["Freq", "cont", 20, 5000, 55, "log", "Hz", []],
    fmratio: ["Ratio", "cont", 0.25, 16, 1, "log", "", []],
    fmratio2: ["Ratio 2", "cont", 0.25, 16, 2.76, "log", "", []],
    fmindex: ["Index", "cont", 0, 20, 3, "log", "", []],
    fmidec: ["Mod decay", "cont", 0.005, 2, 0.08, "log", "s", []],
    fmfb: ["Feedback", "cont", 0, 1, 0, "lin", "", []],
    fmfold: ["Fold", "cont", 0, 1, 0, "lin", "", []],
    fmnoise: ["Noise", "cont", 0, 1, 0, "lin", "", []],
    // NEW: 4-band EQ (low shelf · peak · peak · high shelf); gain 0 dB = the band is off
    eq1f: ["EQ1 freq", "cont", 20, 500, 90, "log", "Hz", []], eq1g: ["EQ1 gain", "cont", -18, 18, 0, "lin", "dB", []],
    eq2f: ["EQ2 freq", "cont", 80, 5000, 400, "log", "Hz", []], eq2g: ["EQ2 gain", "cont", -18, 18, 0, "lin", "dB", []],
    eq3f: ["EQ3 freq", "cont", 400, 12000, 2500, "log", "Hz", []], eq3g: ["EQ3 gain", "cont", -18, 18, 0, "lin", "dB", []],
    eq4f: ["EQ4 freq", "cont", 1500, 18000, 8000, "log", "Hz", []], eq4g: ["EQ4 gain", "cont", -18, 18, 0, "lin", "dB", []],
    // NEW (0.9): vintage-sampler processing per track — METALISE, RESAMPLE (+ its transient handling) — and the sample engine's slices and stretch
    metal: ["Metalise", "cont", 0, 1, 0, "lin", "", []],
    rsmp: ["Resample", "cont", 0, 1, 0, "lin", "", []],
    rsmode: ["Transient mode", "enum", 0, 3, 0, "lin", "", RS_MODES],
    rssens: ["Transient sens", "cont", 0, 1, 0.5, "lin", "", []],
    smodel: ["Sampler", "enum", 0, 5, 0, "lin", "", SAMPLER_MODEL_NAMES],
    slice: ["Slice", "int", 1, 32, 1, "lin", "", []],
    tsmode: ["Tune mode", "enum", 0, 2, 0, "lin", "", TS_MODES],
    stretch: ["Stretch", "cont", 0.5, 2, 1, "log", "×", []],
    long: ["Long", "bool", 0, 1, 0, "lin", "", []],   // NEW (0.9.1): Decay × 20 — sounds and drones up to 60 s
  };
  const over = {
    3: { choke: 1 }, 4: { choke: 1 },                                            // Pulse's hat choke, as group A
    8: { engine: 2, fmalgo: 3, fmfreq: 420, fmratio: 1.41, fmratio2: 2.76, fmindex: 2.5, fmidec: 0.09, fmfold: 0.15 },
    9: { engine: 2, fmalgo: 0, fmfreq: 95, fmratio: 1.5, fmindex: 4, fmidec: 0.05, sweep: 12, swtime: 0.06 },
    11: { engine: 2, fmalgo: 3, fmfreq: 3300, fmratio: 1.41, fmratio2: 2.6, fmindex: 3.5, fmidec: 0.25, fmnoise: 0.25 },
  };
  const rows = [];
  for (let t = 1; t <= DRUM_TRACKS; t++) {
    const src = t <= 6 ? pulseTrack(t) : pulseTrack(1).map(p => {
      const k = p[0].slice(3), r = p.slice(); r[0] = `t${t}.${k}`; r[2] = `Track ${t}`;
      if (base7_9[t][k] != null) r[6] = base7_9[t][k]; else if (k === 'model') r[6] = 0; return r; });
    if (src.map(p => p[0].replace(/^t\d+\./, '')).join() !== tmpl.join()) throw new Error('track template mismatch');
    rows.push(...src);
    for (const [k, d] of Object.entries(extra)) {
      const r = [`t${t}.${k}`, d[0], `Track ${t}`, ...d.slice(1)];
      if (over[t] && over[t][k] != null) r[6] = over[t][k];
      rows.push(r);
    }
  }
  rows.push(...DRUM_PARAMS_PULSE.filter(p => p[0].startsWith('dr.')));          // Pulse master block, unchanged
  rows.push(["gl.on", "Metalise", "Metalise", "bool", 0, 1, 0, "lin", "", []],   // (0.8) the glitch became Metalise (Slicer window); keys unchanged
    ["gl.mode", "Mode", "Metalise", "enum", 0, 2, 2, "lin", "", GLITCH_MODES],
    ["gl.mix", "Mix", "Metalise", "cont", 0, 1, 0.5, "lin", "", []],
    ["gl.size", "Grain", "Metalise", "cont", 0, 1, 0.35, "lin", "", []],
    ["gl.speed", "Stretch", "Metalise", "cont", 0, 1, 0.5, "lin", "", []],
    ["gl.metal", "Character", "Metalise", "cont", 0, 1, 0, "lin", "", []],   // NEW (0.9): the vintage-sampler character on the Metalise output
    ["gl.chance", "Chance", "Metalise", "cont", 0, 1, 0, "lin", "", []],     // NEW (0.9.1): while ON, Metalise plays each division with this chance (0 = always)
    ["gl.chdiv", "Chance every", "Metalise", "enum", 0, 3, 1, "lin", "", GL_CHDIVS]);
  const lfoDef = [[0.25, 0, 1], [1, 1, 2], [4, 4, 0]];                          // rate, shape, destination
  lfoDef.forEach(([rate, shape, dest], i) => {
    const n = i + 1, s = `LFO ${n}`;
    rows.push([`lfo${n}.rate`, "Rate", s, "cont", 0.02, 20, rate, "log", "Hz", []],
      [`lfo${n}.shape`, "Shape", s, "enum", 0, 5, shape, "lin", "", LFO_SHAPES],
      [`lfo${n}.depth`, "Depth", s, "cont", -1, 1, 0, "lin", "", []],
      [`lfo${n}.dest`, "Dest", s, "enum", 0, 2, dest, "lin", "", LFO_DESTS],
      [`lfo${n}.sync`, "Sync", s, "bool", 0, 1, 0, "lin", "", []],
      [`lfo${n}.div`, "Division", s, "enum", 0, 6, 2, "lin", "", LFO_DIVS]);
  });
  // Slicer (global, after the glitch): rearranges the whole output in beat-synced slices — its program is song data
  rows.push(["sl.on", "Slicer", "Slicer", "bool", 0, 1, 0, "lin", "", []],
    ["sl.mix", "Mix", "Slicer", "cont", 0, 1, 1, "lin", "", []],
    ["sl.div", "Slice", "Slicer", "enum", 0, 3, 1, "lin", "", SL_DIVS],
    ["sl.bars", "Cycle", "Slicer", "enum", 0, 1, 0, "lin", "", ["1 bar", "2 bars"]],
    ["sl.density", "Density", "Slicer", "cont", 0, 1, 1, "lin", "", []],
    ["sl.evolve", "Evolve", "Slicer", "cont", 0, 1, 0, "lin", "", []],
    ["sl.seed", "Seed", "Slicer", "int", 0, 99, 1, "lin", "", []],
    ["sl.speed", "Speed", "Slicer", "cont", 0.25, 2, 0.5, "log", "×", []],
    ["sl.stutter", "Stutter", "Slicer", "enum", 0, 4, 2, "lin", "", SL_STUTTER],
    ["sl.tape", "Tape time", "Slicer", "cont", 0.1, 1, 0.8, "lin", "", []],
    ["sl.pitch", "Pitch", "Slicer", "int", -24, 24, -12, "lin", "st", []],
    ["sl.hold", "Hold", "Slicer", "enum", 0, 6, 0, "lin", "", SL_HOLD]);
  // modulation sources besides the LFOs
  rows.push(["env.src", "Input", "Env follower", "enum", 0, 9, 0, "lin", "", ENV_SRCS],
    ["env.att", "Attack", "Env follower", "cont", 0.0005, 0.2, 0.005, "log", "s", []],
    ["env.rel", "Release", "Env follower", "cont", 0.01, 2, 0.15, "log", "s", []],
    ["env.gain", "Gain", "Env follower", "cont", 0.25, 8, 2, "log", "×", []],
    ["ch.mode", "Mode", "Chaos", "enum", 0, 2, 0, "lin", "", CHAOS_MODES],
    ["ch.rate", "Rate", "Chaos", "cont", 0.02, 20, 0.5, "log", "Hz", []]);
  // NEW: global tape and vinyl (after the Slicer); 0 = off
  rows.push(["tp.wow", "Wow", "Tape", "cont", 0, 1, 0, "lin", "", []],
    ["tp.flutter", "Flutter", "Tape", "cont", 0, 1, 0, "lin", "", []],
    ["tp.dust", "Dust", "Tape", "cont", 0, 1, 0, "lin", "", []]);
  // NEW (0.8): reverb type; the insert input (AUv3 effect / an audio input in the web app)
  rows.push(["dr.revtype", "Type", "Reverb", "enum", 0, 3, 0, "lin", "", REV_TYPES],
    ["in.level", "Input", "Input", "cont", 0, 1, 1, "lin", "", []],
    ["in.dly", "Input delay", "Input", "cont", 0, 1, 0, "lin", "", []],
    ["in.rev", "Input reverb", "Input", "cont", 0, 1, 0, "lin", "", []],
    ["in.drums", "Drums", "Input", "bool", 0, 1, 1, "lin", "", []]);
  // NEW (0.8): HUMANISE — timing offsets, then ghost notes and small embellishments; 0 = the sequencer exactly as written
  rows.push(["dr.human", "Humanise", "Master", "cont", 0, 1, 0, "lin", "", []]);
  return rows;
})();
