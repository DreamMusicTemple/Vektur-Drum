/* ============================================================ VEKTUR PULSE — drum machine: state, engine sync, panel (web build)
   The sound runs inside Vektur Spectra's AudioWorklet (web/drums-dsp.js, one node, one audio callback). This file
   keeps the set's drum data (S.drums), sends changes to the worklet, routes MIDI and pads, applies recorded steps,
   and draws the hardware-style panel. The panel updates from the existing frame loop only when something changed
   (a step moved, a pad lit) — nothing animates on its own, and nothing runs while the drums are off. */
const DRM = { glOpen: true, trk: 0, step: -1, edit: false, clip: null, tel: null, lastTel: null, els: null, sent: null, armedRec: false };
const DP_ID = {}; DRUM_PARAMS.forEach((p, i) => { DP_ID[p[0]] = i; });
const DRUM_SHORT = ['KICK', 'SNARE', 'C.HAT', 'O.HAT', 'CLAP', 'TOM', 'RIM', 'BELL'];

function drumEmptyPattern() { return { bars: 1, sl: -1, tr: Array.from({ length: DRUM_TRACKS }, () => ({ len: 16, div: DRUM_DEF_DIV, s: new Array(16).fill(null) })) }; }
function drumStarterPattern() {   // pattern 1 of a new set: a simple groove, so PLAY makes sound straight away
  const p = drumEmptyPattern();
  [0, 4, 8, 12].forEach(k => { p.tr[0].s[k] = [.95, 0, 0, 1]; });
  [4, 12].forEach(k => { p.tr[1].s[k] = [.85, 0, 0, 1]; });
  for (let k = 0; k < 16; k += 2) p.tr[2].s[k] = [k % 4 ? .45 : .7, 0, 0, 1];
  p.tr[3].s[14] = [.6, 0, 0, 1]; p.tr[2].s[15] = [.5, 0, 0, 3];
  return p;
}
function drumState() {
  if (!S.drums) S.drums = { on: false, ntr: DRUM_TRACKS, p: {}, pats: [drumStarterPattern(), ...new Array(7).fill(0).map(drumEmptyPattern)], chain: [], chainOn: false, sel: 0 };
  if (!(S.drums.ntr >= 6 && S.drums.ntr <= DRUM_TRACKS)) S.drums.ntr = DRUM_TRACKS;
  return S.drums;
}
/* NEW song-level data (saved with the set, kits and the state file):
   slice: the Slicer program, 32 × [action, permute source]; wires: the modulation matrix, ≤ 32 × {s: source, k: param key, a: −1…1}. */
function drumSliceProg() { const d = drumState(); if (!Array.isArray(d.slice) || d.slice.length !== SL_SLOTS) d.slice = drumSliceClean(d.slice); return d.slice; }
function drumSliceClean(a) { return Array.from({ length: SL_SLOTS }, (_, i) => { const s = Array.isArray(a) ? a[i] : null;
  return Array.isArray(s) ? [clamp(Math.round(+s[0]) || 0, 0, SL_ACTIONS.length - 1), clamp(Math.round(+s[1]), 0, SL_SLOTS - 1) || 0] : [0, i]; }); }
/** NEW (0.9.1): each LFO's drawn shape (its DRAW waveform), 3 × 16 points −1…1; default a sine. */
const LFO_PTS = 16;
function drumLfoDefault() { return Array.from({ length: LFO_PTS }, (_, j) => Math.round(Math.sin(2 * Math.PI * j / LFO_PTS) * 1000) / 1000); }
function drumLfoClean(a) { return [0, 1, 2].map(i => { const r = Array.isArray(a) && Array.isArray(a[i]) ? a[i] : null;
  return r ? Array.from({ length: LFO_PTS }, (_, j) => { const v = +r[j]; return isFinite(v) ? Math.round(clamp(v, -1, 1) * 1000) / 1000 : 0; }) : drumLfoDefault(); }); }
function drumLfoPts() { const d = drumState(); if (!Array.isArray(d.lfo) || d.lfo.length !== 3) d.lfo = drumLfoClean(d.lfo); return d.lfo; }
function drumPushLfoPts() { drumLfoPts().forEach((p, i) => drumPost(['D', i, p.slice()])); }
function drumWires() { const d = drumState(); if (!Array.isArray(d.wires)) d.wires = []; return d.wires; }
function drumWiresClean(a) { return (Array.isArray(a) ? a : []).map(w => w && w.k === 'dr.warmth' ? Object.assign({}, w, { k: 'dr.temper', a: -0.5 * (+w.a || 0) }) : w).filter(w => w && DP_ID[w.k] != null && drumModDest(DRUM_PARAMS[DP_ID[w.k]])).slice(0, MOD_WIRES)
  .map(w => ({ s: clamp(Math.round(+w.s) || 0, 0, MOD_SOURCES.length - 1), k: w.k, a: isFinite(+w.a) ? clamp(+w.a, -1, 1) : 0.5 })); }
/** A dial can be a modulation destination: every continuous parameter, plus the stepped ones with a range (not switches). */
function drumModDest(q) { return !!q && (q[3] === 'cont' || (q[3] === 'int' && q[0] !== 'dr.ch') || q[0] === 'gl.on'); }   // 0.9.1: the Metalise switch too (on above the middle)
function drumPushSlicer() { drumSliceProg().forEach((s, i) => drumPost(['L', i, s[0], s[1]])); }
function drumPushWires() { const w = drumWires(); for (let i = 0; i < MOD_WIRES; i++) { const x = w[i]; drumPost(['W', i, x ? x.s : 0, x ? DP_ID[x.k] : -1, x ? x.a : 0]); } }
function drumWiredKeys() { return new Set(drumWires().map(w => w.k)); }
function drumNtr() { return drumState().ntr; }
function drumSetTracks(n) { const d = drumState(); d.ntr = clamp(n | 0, 6, DRUM_TRACKS); if (DRM.trk >= d.ntr) { DRM.trk = 0; DRM.step = -1; } drumPost(['n', d.ntr]); dirty(); renderDrums(); }
function drumEngine(t) { return Math.round(drumVal(`t${t + 1}.engine`)); }
function drumVal(k) { const v = drumState().p[k]; return v != null ? v : DRUM_PARAMS[DP_ID[k]][6]; }
const DRUM_TAP = { ops: null };   // NEW (0.8): while set, drum messages are collected (the offline export replays them into its own engine)
function drumPost(a) { if (DRUM_TAP.ops) { DRUM_TAP.ops.push(a); return; } if (SYN.node) SYN.node.port.postMessage({ dr: a }); }
function drumSet(k, v, quiet) {
  const q = DRUM_PARAMS[DP_ID[k]]; if (!q) return;
  v = clamp(+v, q[4], q[5]); if (q[3] !== 'cont') v = Math.round(v);
  drumState().p[k] = v; drumPost(['p', DP_ID[k], v]);
  if (!quiet) dirty();
}
function drumNorm(q, v) { return synthNorm(q, v); }
function drumDenorm(q, t) { return synthDenorm(q, t); }
function drumSetNorm(k, t) { const q = DRUM_PARAMS[DP_ID[k]]; if (q) drumSet(k, drumDenorm(q, t)); }
function drumFmt(q, v) { return q[8] === 'st' ? (v > 0 ? '+' : '') + v.toFixed(Math.abs(v) < 10 ? 1 : 0) : synthFmt(q, v); }

// ---- engine sync (whole patterns go in one message)
/* A step is [velocity, pan, pitch, ratchet] plus, once any is set, [crush, delay, reverb, probability, FM ratio]
   (crush/sends/probability 0…1, defaults 0, 0, 0, 1; FM ratio 0.25…16, 0 = the track's ratio),
   NEW then [ring on, ring master (0–8 = track 1–9, 9 = sine oscillator), slave mask (bit t = track t+1), ring amount, osc Hz, fold 0…1,
   pitch shift −24…24 st, shift mix, spectral 0…1, spectral colour, spectral mix,
   NEW (0.9) Metalise (−1 = the track's / slice's, else 0…1), slice (0 = the track's, k = slice k), reverse chance, stutter chance].
   (0.9: the ring master's sine oscillator moved from 9 to RING_OSC = 12 with the 12 tracks; older steps are migrated.) */
const DRUM_STEP_DEF = [.8, 0, 0, 1, 0, 0, 0, 1, 0, 0, RING_OSC, 0, 1, 220, 0, 0, 1, 0, 0, 1, -1, 0, 0, 0];
const DRUM_STEP_N = DRUM_STEP_DEF.length;
function drumStepVal(s, i) { return s && s[i] != null ? s[i] : DRUM_STEP_DEF[i]; }
function drumStepFull(s, n = 9) { while (s.length < n) s.push(DRUM_STEP_DEF[s.length]); return s; }
function drumStepMsg(p, t, k, s) { return ['s', p, t, k, s ? 1 : 0, ...DRUM_STEP_DEF.map((_, i) => drumStepVal(s, i))]; }
function drumPatternArray(pt) {
  const a = new Float32Array(2 + DRUM_TRACKS * (2 + 16 * (1 + DRUM_STEP_N))); a[0] = pt.bars; a[1] = pt.sl === 0 || pt.sl === 1 ? pt.sl : -1; let i = 2;   // 0.9: [1] = the pattern's Slicer
  pt.tr.forEach(tr => { a[i++] = tr.len; a[i++] = tr.div; for (let k = 0; k < 16; k++) { const s = tr.s[k]; a[i++] = s ? 1 : 0; for (let f = 0; f < DRUM_STEP_N; f++) a[i++] = drumStepVal(s, f); } });
  return a;
}
function drumPushPattern(p) { drumPost(['P', p, drumPatternArray(drumState().pats[p])]); }
function drumPushChain() { const d = drumState(); drumPost(['c', d.chainOn ? 1 : 0, d.chain.slice(0, 16)]); }
function drumPushAll() {
  if (!SYN.node) return;
  const d = drumState();
  drumPost(['ps', Float32Array.from(DRUM_PARAMS, q => drumVal(q[0]))]);
  for (let p = 0; p < 8; p++) drumPushPattern(p);
  drumPushSlicer(); drumPushWires(); drumPushLfoPts();
  drumPushChain(); drumPost(['n', d.ntr]); drumPost(['y', d.sel]); drumPost(['r', DRM.armedRec ? 1 : 0]); drumPost(['e', d.on ? 1 : 0]);
  if (typeof drumSamplesPush === 'function') drumSamplesPush(true);
  DRM.sent = S.drums;
  const r = $('#railDrums'); if (r) r.classList.toggle('live', !!d.on);
}
async function drumsSetOn(on) {
  const d = drumState(); d.on = !!on; dirty();
  if (on && !(await synthStart())) { d.on = false; renderDrums(); return; }
  drumPushAll(); drumPost(['e', on ? 1 : 0]);
  if (!on) { drumPost(['z', 0]); DRM.tel = null; }
  const r = $('#railDrums'); if (r) r.classList.toggle('live', !!on);
  renderDrums();
}
function drumTrackNote(t) { return DRUM_NOTES[t]; }
function drumStatusCh() { const ch = Math.round(drumVal('dr.ch')); return ch ? ch - 1 : 9; }
function drumHit(t, vel) { if (!drumState().on || !SYN.node) return; synthMidi(0x90 | drumStatusCh(), drumTrackNote(t), clamp(Math.round(vel), 1, 127)); drumFlashPad(t); }
/** MIDI in: notes on the drum channel play the drums (and record while REC is armed). */
function drumsTakeMidi(st, d1, d2) {
  const d = S.drums; if (!d || !d.on || !SYN.node || st >= 0xF0) return false;
  const t = st & 0xF0, ch = Math.round(drumVal('dr.ch'));
  if (!(t === 0x80 || t === 0x90) || (ch && (st & 0x0F) !== ch - 1)) return false;
  synthMidi(st, d1, d2); return true;
}

// ---- recorded steps come back from the audio thread (already playing there): copy them into the set
function drumApplyRecorded(list) {
  const d = drumState();
  list.forEach(([p, t, s, vel, sl]) => { const v = [vel, 0, 0, 1]; if (sl > 0) { drumStepFull(v, DRUM_STEP_N); v[21] = sl; } d.pats[p].tr[t].s[s] = v; if (DRM.els) paintStep(t, s); });   // 0.9: Break Lab pads record their slice
  dirty();
}

// ---- once per frame (from synthTick): the clock, telemetry → LEDs, Visual link signals
function drumsTick() {
  const d = S.drums;
  if (SYN.node && d !== DRM.sent && d) { drumPushAll(); if (drumsOpen()) renderDrums(); }
  if (!d || !d.on) return;
  const tel = SYN.dtel; if (!tel || tel === DRM.lastTel) return;
  DRM.lastTel = tel; DRM.tel = tel;
  if (drumsOpen()) paintDrumLive(tel);
}

/* ============================================================ panel */
(function drumCSS() {
  const css = `#drumModal.codelab{align-items:flex-end;background:transparent;pointer-events:none}
#drumModal.codelab .sheet{pointer-events:auto;width:min(80rem,99.5vw);max-height:84dvh;height:auto;border-radius:.7rem .7rem 0 0;padding:0;overflow:auto;background:none;border:0;box-shadow:0 -10px 34px rgba(0,0,0,.6)}
#drumModal.codelab.expanded{background:rgba(0,0,0,.55);align-items:center}#drumModal.codelab.expanded .sheet{max-height:97dvh;border-radius:.7rem}
/* chassis: graphite with a brushed-aluminium top strip, light from above */
.dm{--led:#ffb23d;--ledlo:#3a2a12;--red:#ff4d3d;--cyan:#3dd6ff;--ice:#bfe9ff;--print:#9a9ea6;color:#e4e1d8;
 background:linear-gradient(180deg,#2a2c30 0,#1c1d20 .5rem,#18191b 100%);border:1px solid #000;border-radius:.7rem .7rem 0 0;
 box-shadow:inset 0 1px 0 rgba(255,255,255,.14),inset 0 -2px 0 rgba(0,0,0,.6);padding:.55rem .65rem .7rem;font-family:inherit;min-width:min(100%,46rem)}
.dmtop{display:flex;align-items:center;gap:.6rem;margin:-.55rem -.65rem .5rem;padding:.35rem .65rem;border-radius:.7rem .7rem 0 0;
 background:repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px),linear-gradient(180deg,#7d8086,#55585d 55%,#45484c);
 box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 1px 0 #000}
.dmbrand{white-space:nowrap;font-weight:800;letter-spacing:.32em;font-size:.82rem;color:#1a1b1d;text-shadow:0 1px 0 rgba(255,255,255,.35)}
.dmbrand small{font-weight:600;letter-spacing:.18em;font-size:.55rem;margin-left:.5rem;color:#2c2e31}
.dmpre{font-size:.68rem;font-weight:700;letter-spacing:.08em;color:#2c2e31;max-width:12rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:.4rem}
.dmtop .sp{flex:1}.dmtop{flex-wrap:wrap;row-gap:.3rem}
.dmrow{display:flex;gap:.5rem;flex-wrap:wrap;align-items:stretch;margin-bottom:.5rem}
/* recessed panel sections with small printed labels */
.dmsec{position:relative;background:linear-gradient(var(--zt,transparent),var(--zt,transparent)),linear-gradient(180deg,#111214,#16171a);border-radius:.45rem;padding:1.05rem .5rem .45rem;
 box-shadow:inset 0 2px 4px rgba(0,0,0,.75),inset 0 -1px 0 rgba(255,255,255,.05),0 1px 0 rgba(255,255,255,.06)}
.dmsec>h5{position:absolute;left:.55rem;top:.3rem;margin:0;font-size:.72rem;letter-spacing:.18em;color:var(--print);font-weight:800;line-height:1;padding-left:.45rem;border-left:3px solid var(--led);filter:brightness(1.35)}
.dmsec>h5 em{font-style:normal;color:var(--led);margin-left:.5rem;letter-spacing:.12em;font-size:.62rem;font-weight:700}
.dmgrow{flex:1}
.dmknobs{display:flex;flex-wrap:wrap;gap:.15rem .1rem;align-items:flex-start}
/* raised hardware buttons with an LED */
.hb{position:relative;min-width:2.6rem;height:2.4rem;padding:0 .55rem;border:1px solid #050506;border-radius:.32rem;color:#d9d6cd;font-family:inherit;font-weight:700;font-size:.62rem;line-height:1;letter-spacing:.14em;
 background:linear-gradient(180deg,#45484d,#2b2d31 55%,#232528);box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 .15rem .2rem rgba(0,0,0,.7);cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.hb:active,.hb.down{transform:translateY(1px);background:linear-gradient(180deg,#26282b,#2f3135);box-shadow:inset 0 .12rem .25rem rgba(0,0,0,.8),0 0 0 rgba(0,0,0,0)}
.hb .led{position:absolute;top:.28rem;right:.3rem;width:.36rem;height:.36rem;border-radius:50%;background:var(--ledlo);box-shadow:inset 0 1px 1px rgba(0,0,0,.6)}
.hb.on .led{background:var(--led);box-shadow:0 0 4px var(--led)}
.hb.rec.on .led{background:var(--red);box-shadow:0 0 4px var(--red)}
.hb.cy.on .led{background:var(--cyan);box-shadow:0 0 4px var(--cyan)}
.hb.wide{min-width:3.6rem}.hb.sm{height:1.9rem;min-width:1.9rem;padding:0 .35rem;font-size:.58rem}
/* OLED */
.oled{background:#030506;border-radius:.3rem;padding:.3rem .5rem;min-width:13rem;font:600 .74rem/1.35 ui-monospace,Menlo,monospace;color:var(--cyan);
 box-shadow:inset 0 2px 5px rgba(0,0,0,.95),0 1px 0 rgba(255,255,255,.07);border:1px solid #000;white-space:pre}
.oled b{color:var(--ice);font-weight:700}.oled i{font-style:normal;color:var(--led)}
.oled select{background:#030506;color:var(--cyan);border:1px solid #1d2a30;border-radius:.2rem;font:inherit;height:1.6rem}
/* pattern buttons */
.dmpats{display:grid;grid-template-columns:repeat(8,2.5rem);gap:.3rem}
.dmpats .hb{min-width:0;padding:0;font-size:.8rem;letter-spacing:0}
.dmpats .hb.sel{outline:2px solid var(--cyan);outline-offset:1px}
.dmpats .hb.has::after{content:'';position:absolute;left:.3rem;top:.3rem;width:.22rem;height:.22rem;border-radius:50%;background:#6b6f76}
.dmchain{display:flex;gap:.25rem;align-items:center;flex-wrap:wrap;margin-top:.35rem;font:600 .66rem ui-monospace,Menlo,monospace;color:var(--print)}
.dmchain span{padding:.1rem .3rem;border-radius:.2rem;background:#090a0b;color:#cfcac0;box-shadow:inset 0 1px 2px rgba(0,0,0,.8)}
.dmchain span.now{color:#120d05;background:var(--led)}
.dmrowlbl{font:700 .6rem system-ui;letter-spacing:.16em;color:var(--print);margin-right:.15rem}.dmsep{width:1px;align-self:stretch;background:#3a3d43;margin:0 .2rem}
.dmchain span.dmchstrip{display:flex;flex-wrap:wrap;gap:.22rem;align-items:center;padding:.18rem .3rem;border-radius:.35rem;background:#07080a;box-shadow:inset 0 1px 3px rgba(0,0,0,.9);min-height:1.75rem;flex:1;min-width:7rem}
.dmchain span.dmchip,.dmchip{position:relative;display:inline-flex;align-items:center;gap:.15rem;padding:.12rem .2rem .12rem .45rem;border-radius:.3rem;background:var(--pcol,#3a3d44);color:#0b0c0e;font:800 .78rem ui-monospace,Menlo,monospace;box-shadow:0 1px 2px #000a;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;transition:margin .1s}
.dmchip .dmchx{font-style:normal;font-weight:700;font-size:.72rem;line-height:1;padding:0 .2rem;border-radius:.2rem;opacity:.55;cursor:pointer}.dmchip .dmchx:hover{opacity:1;background:#0003}
.dmchip.drag{z-index:5;cursor:grabbing;box-shadow:0 4px 12px #000c;transition:none}.dmchip.gap{outline:2px dashed var(--led);outline-offset:1px}
.dmchain span.dmchip.now{background:var(--led);box-shadow:0 0 0 2px #fff8,0 0 10px var(--led)}
.dmchip.pc0{--pcol:#ff9f43}.dmchip.pc1{--pcol:#4fd1ff}.dmchip.pc2{--pcol:#a3e85b}.dmchip.pc3{--pcol:#ff6fb1}.dmchip.pc4{--pcol:#b99cff}.dmchip.pc5{--pcol:#ffd84a}.dmchip.pc6{--pcol:#5ef0c8}.dmchip.pc7{--pcol:#ff7a6b}
.dmghost{position:fixed;z-index:90;pointer-events:none;opacity:.9}
.dmchain span.dmchempty{background:none;box-shadow:none;color:#6f747c;font:500 .62rem system-ui}.dmchain .dmchclr{font:600 .55rem system-ui;letter-spacing:.1em;text-transform:uppercase;color:#7d828a;font-style:normal;cursor:pointer;margin-left:auto;padding:.1rem .25rem}.dmchain .dmchclr:hover{color:var(--led)}
/* sequencer: track rows of illuminated step buttons */
.dmseq{overflow-x:auto}
.dmtrk{display:grid;grid-template-columns:5.2rem 1.9rem 1.9rem minmax(0,1fr) 5.4rem 4.2rem;gap:.35rem;align-items:center;margin:.22rem 0;min-width:44rem}
/* bend: a small, quiet pair at the end of SOUND, set off by a hairline */
.dmbend{display:flex;gap:.05rem;align-items:flex-start;margin-left:.35rem;padding-left:.45rem;border-left:1px solid #26282c}
.dmbend .kcell{width:3.4rem}.dmbend .knob{width:2.15rem;height:2.15rem}.dmbend .klbl{font-size:.5rem;color:#7d8189}.dmbend .kval{font-size:.55rem;min-width:2.3rem}
.dmhdr{display:grid;grid-template-columns:5.2rem 1.9rem 1.9rem minmax(0,1fr) 5.4rem 4.2rem;gap:.35rem;min-width:44rem;font-size:.5rem;letter-spacing:.18em;color:#9a9ea6;font-weight:700;margin-top:.1rem}
.dmhdr span:nth-child(4){display:grid;grid-template-columns:repeat(4,1fr)}
.dmdiv select{width:100%;font-size:.68rem}
.dmname{height:2.4rem;justify-content:flex-start;text-align:left;padding:0 .45rem;font-size:.58rem;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:.08rem}
.dmname small{font-size:.5rem;color:var(--print);letter-spacing:.1em}
.dmname.sel{outline:2px solid var(--cyan);outline-offset:1px}
.dmsteps{display:grid;grid-template-columns:repeat(16,minmax(1.55rem,1fr));gap:.18rem}
.dmsteps .st:nth-child(4n+1){margin-left:.12rem}
.st{position:relative;height:2.4rem;border-radius:.25rem;border:1px solid #050506;cursor:pointer;touch-action:manipulation;
 background:linear-gradient(180deg,#34363b,#232528);box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 .12rem .18rem rgba(0,0,0,.7)}
.st::before{content:'';position:absolute;left:22%;right:22%;top:.3rem;height:.32rem;border-radius:.16rem;background:#1b1611;box-shadow:inset 0 1px 1px rgba(0,0,0,.7)}
.st.on::before{background:var(--led);box-shadow:0 0 5px rgba(255,178,61,.7)}
.st.acc::before{background:#ff7a2e;box-shadow:0 0 6px rgba(255,110,40,.8)}
.st.ph{background:linear-gradient(180deg,#54575d,#3a3c41)}
.st.ph::before{background:#fff3df;box-shadow:0 0 6px rgba(255,240,210,.8)}
.st.sel{outline:2px solid var(--cyan);outline-offset:0}
.st.off{opacity:.25;pointer-events:none}
.st.mute::before{filter:saturate(.2) brightness(.6)}
.st em{position:absolute;bottom:.22rem;left:0;right:0;text-align:center;font:600 .5rem ui-monospace,Menlo,monospace;color:#8b8f96;font-style:normal}
.st.down{transform:translateY(1px);box-shadow:inset 0 .12rem .25rem rgba(0,0,0,.8)}
.dmlen{display:flex;align-items:center;gap:.15rem}.dmlen .oled{min-width:0;padding:.15rem .3rem;text-align:center;width:1.9rem}
.dmdiv select{width:100%}
/* rubber performance pads */
.dmpads{display:grid;grid-template-columns:repeat(3,5.4rem);gap:.45rem}
.pad{position:relative;aspect-ratio:1/1;border-radius:.55rem;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer;
 background:radial-gradient(120% 90% at 50% 0%,#3b3d40 0,#26282a 45%,#1d1e20 100%);border:1px solid #070708;
 box-shadow:inset 0 2px 1px rgba(255,255,255,.12),inset 0 -.35rem .5rem rgba(0,0,0,.5),0 .3rem .35rem rgba(0,0,0,.75),0 .05rem 0 #000}
.pad b{position:absolute;left:.45rem;top:.4rem;font-weight:700;font-size:.62rem;line-height:1;color:#8f939a;letter-spacing:.08em}
.pad span{position:absolute;left:0;right:0;bottom:.45rem;text-align:center;font-weight:700;font-size:.62rem;line-height:1;letter-spacing:.16em;color:#bdb9b0}
.pad span.smp{left:.35rem;right:.35rem;white-space:nowrap;overflow:hidden;letter-spacing:.06em}   /* 0.9.1: abbreviated sample names, room either side */
.dmlogo{height:1.9rem;width:1.9rem;border-radius:50%;object-fit:contain;flex:none;margin-right:.45rem;box-shadow:0 0 6px rgba(0,0,0,.45)}
.dmundo{min-width:1.9rem;font-size:.95rem!important;padding:0 .35rem!important;line-height:1}
.dmlong{align-self:center;margin:0 .15rem}
.pad i{position:absolute;left:30%;right:30%;top:.45rem;height:.22rem;border-radius:.11rem;background:#2b2015}
.pad.hit i{background:var(--led);box-shadow:0 0 6px var(--led)}
.pad.hit{background:radial-gradient(120% 90% at 50% 0%,#46484b 0,#2c2e30 45%,#202123 100%)}
.pad.down{transform:translateY(2px) scale(.985);box-shadow:inset 0 .2rem .45rem rgba(0,0,0,.7),0 .1rem .1rem rgba(0,0,0,.6)}
.pad.sel{outline:2px solid var(--cyan);outline-offset:2px}
.dmmodels{display:grid;grid-template-columns:repeat(4,1fr);gap:.22rem;margin-bottom:.35rem}
.dmmodels .hb{height:1.9rem;min-width:0;padding:0 .2rem;font-size:.54rem;letter-spacing:.08em}
.dmrat{display:flex;gap:.2rem;margin-top:.3rem}
.dmsteps .st .sfx{position:absolute;right:.22rem;top:.62rem;width:.22rem;height:.22rem;border-radius:50%;background:var(--cyan)}
.dmsmp{display:flex;flex-wrap:wrap;gap:.3rem .4rem;align-items:center;margin:.3rem 0}.dmsmp .hb{flex-shrink:0;white-space:nowrap;min-width:5.6rem}.dmsmp .dmnote{margin:0;flex:1 1 12rem;min-width:0;font-size:.62rem}.dmrat .hb{min-width:2.2rem}
.dmnote{font-size:.6rem;color:var(--print);margin-top:.35rem;max-width:17.2rem;line-height:1.35}
.dmrat .klbl{font-size:.58rem;letter-spacing:.14em;color:#9a9ea6;align-self:center;margin-right:.2rem}
@media (max-width:700px){.dmpads{grid-template-columns:repeat(3,1fr)}.oled{min-width:0}.dmpats{grid-template-columns:repeat(8,1fr)}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();
function drumModal() { let m = $('#drumModal'); if (!m) { m = el('div', 'modal codelab'); m.id = 'drumModal'; m.appendChild(el('div', 'sheet')); document.body.appendChild(m); } return m; }
function drumsOpen() { const m = $('#drumModal'); return !!(m && m.classList.contains('open')); }
function openDrums() { drumModal().classList.add('open'); renderDrums(); }
function closeDrums() { const m = $('#drumModal'); if (m) m.classList.remove('open'); DRM.els = null; }
function toggleDrums() { if (drumsOpen()) closeDrums(); else openDrums(); }

function hbtn(label, cls, onclick, led) {
  const b = el('button', 'hb' + (cls ? ' ' + cls : ''), label); if (led) b.appendChild(el('i', 'led'));
  b.onclick = onclick; return b;
}
function sec(title, extra) { const s = el('div', 'dmsec'); const h = el('h5', null, title); if (extra) h.appendChild(el('em', null, extra)); s.appendChild(h); return s; }
function dKnob(host, key, label, o = {}) {
  const q = DRUM_PARAMS[DP_ID[key]];
  const r = dKnobRaw(host, key, label, o, q);
  if (r && r.row && drumModDest(q)) { r.row.dataset.modKey = key; if (drumWiredKeys().has(key)) r.row.classList.add('wired'); }   // NEW: a drop target for modulation sources
  return r;
}
function dKnobRaw(host, key, label, o, q) {
  return slider(host, Object.assign({ knob: true, label: label || q[1], min: 0, max: 1, def: drumNorm(q, q[6]), path: 'drums:' + key,
    bipolar: q[4] < 0 && q[5] > 0, center: q[4] < 0 && q[5] > 0 ? drumNorm(q, 0) : undefined, get: () => drumNorm(q, drumVal(key)), set: t => { drumSet(key, drumDenorm(q, t), true); paintOled(); },
    fmt: t => drumFmt(q, drumDenorm(q, t)), step: q[3] === 'int' ? 1 / (q[5] - q[4]) : undefined }, o));
}
/** The model's short name — or, when the track plays an imported sample, the sample's name. */
function drumTrackName(t) {
  const e = drumEngine(t);
  if (e === 1) { const sn = drumSampleName(t); return sn ? drumAbbrev(sn, 10) : 'NO SAMPLE'; }   // (0.9.1) abbreviated, not cut
  if (e === 2) return 'FM ' + FM_SHORT[Math.round(drumVal(`t${t + 1}.fmalgo`))];
  return DRUM_SHORT[Math.round(drumVal(`t${t + 1}.model`))] || 'T' + (t + 1);
}
/** NEW (0.9.1): a pad's label — a sample's name abbreviated to fit (words shortened to their consonants, then initials and
    numbers), so it sits on the pad with room either side. Synth and FM names are already short. */
function drumAbbrev(name, max) {   // (0.9.1) "Amen Brother Break 136bpm.wav" → AMEN BRT · "Funky_Drummer_Snare_02" → FNK 02
  const s = String(name || '').replace(/\.(wav|wave|flac|aif|aiff|mp3|ogg|m4a)$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
  let words = s.split(/[^A-Z0-9]+/).filter(Boolean); if (!words.length) return '';
  const full = words.join(' '); if (full.length <= max) return full;
  words = words.filter(w => !/^\d+BPM$|^BPM$/.test(w)); if (!words.length) return full.slice(0, max);   // the tempo tag goes first
  let num = words.length > 1 && /^\d+$/.test(words[words.length - 1]) ? words.pop() : '';            // a take number tells samples apart
  if (num && max - num.length - 1 < 3) num = '';
  const budget = max - (num ? num.length + 1 : 0), rest = words.join(' ');
  const short = w => /^\d+$/.test(w) || w.length <= 3 ? w : (w[0] + w.slice(1).replace(/[AEIOUY]/g, '')).replace(/(.)\1+/g, '$1').slice(0, 4);
  let out = '';
  if (rest.length <= budget) out = rest;
  else for (const w of words) {
    const part = out ? short(w) : w.length <= budget ? w : short(w), cand = (out ? out + ' ' : '') + part;
    if (cand.length <= budget) { out = cand; continue; }
    const room = budget - out.length - (out ? 1 : 0); if (room >= 2) out += (out ? ' ' : '') + part.slice(0, room); break;
  }
  return ((out || words[0].slice(0, budget)) + (num ? ' ' + num : '')).slice(0, max);
}
function drumPadName(t, max) { if (drumEngine(t) === 1) { const sn = drumSampleName(t); return sn ? drumAbbrev(sn, max) : 'NO SAMPLE'; } return drumTrackName(t); }
/** TEMPER's readout: WARM 40 % · NEUTRAL · COLD 70 %. HUMANISE's: 35 % (+ GHOSTS above 50 %). */
function drumTemperFmt(v) { const p = Math.round(Math.abs(v) * 100); return p === 0 ? 'NEUTRAL' : (v < 0 ? 'WARM ' : 'COLD ') + p + '%'; }
function drumHumanFmt(h) { const p = Math.round(h * 100); return p === 0 ? 'OFF' : p > 50 ? p + '% +GHOSTS' : p + '%'; }
const FM_SHORT = ['CLASSIC', 'STACK', 'PARALLEL', 'METAL'];

function renderDrums() {
  const m = drumModal(); if (!m.classList.contains('open')) return;
  const sh = m.querySelector('.sheet'); sh.innerHTML = '';
  const d = drumState(), pat = d.pats[d.sel];
  const root = el('div', 'dm'); sh.appendChild(root);
  DRM.els = { steps: [], pads: [], names: [], pats: [], lastStep: new Array(DRUM_TRACKS).fill(-2), lastHit: new Array(DRUM_TRACKS).fill(false), lastPat: -1, lfo: [] };
  // ---- top strip
  const top = el('div', 'dmtop');
  { const lg = el('img', 'dmlogo'); lg.src = DMT_LOGO_96; lg.alt = 'DMT Cymatics'; top.appendChild(lg); }   // NEW (0.9.1): the DMT Cymatics logo
  top.appendChild(el('span', 'dmbrand', DRUM_NAME.toUpperCase())); top.lastChild.appendChild(el('small', null, 'HYBRID DRUM MACHINE'));
  { const tc = el('span', 'dmtc'); tc.appendChild(el('b', null, 'TRACKS'));
    for (let n = 6; n <= DRUM_TRACKS; n++) { const b = hbtn(String(n), 'sm' + (n === d.ntr ? ' on' : ''), () => drumSetTracks(n), true); b.setAttribute('aria-label', n + ' tracks'); tc.appendChild(b); }
    top.appendChild(tc); }
  top.appendChild(el('span', 'sp'));
  if (d.preset) top.appendChild(el('span', 'dmpre', d.preset));
  { const u = hbtn('↶', 'sm dmundo', () => undoStep(-1)); u.title = 'Undo'; u.setAttribute('aria-label', 'Undo'); u.disabled = !undoCan(-1); top.appendChild(u); DRM.els.undo = u;   // NEW (0.9.1)
    const r = hbtn('↷', 'sm dmundo', () => undoStep(1)); r.title = 'Redo'; r.setAttribute('aria-label', 'Redo'); r.disabled = !undoCan(1); top.appendChild(r); DRM.els.redo = r; }
  const pw = hbtn(d.on ? 'ON' : 'OFF', 'sm' + (d.on ? ' on' : ''), () => drumsSetOn(!d.on), true); pw.setAttribute('aria-pressed', d.on); top.appendChild(pw);
  const pre = hbtn('PRESETS', 'sm', () => openPresets('drums')); pre.title = 'Factory kits with grooves and your own (saved with the set); export and import';
  top.appendChild(pre);
  { const b = hbtn('SLICER', 'sm' + (drumVal('sl.on') || (drumVal('gl.on') && Math.round(drumVal('gl.mode')) === 2) ? ' on' : ''), () => openSlicer(), true); b.title = 'NEW: the Slicer — repeats, stutters, reverses, tape stops, pitch and permutations of everything'; top.appendChild(b); }
  { const b = hbtn('MOD', 'sm' + (drumWires().length ? ' on' : ''), () => (modOpen() ? closeMod() : openMod()), true); b.title = 'NEW: modulation matrix — drag LFOs, the envelope follower or chaos onto any dial'; top.appendChild(b); }
  { const b = hbtn('BREAK LAB', 'sm cy' + (drumSx().some(x => x.slices.length) ? ' on' : ''), () => openBreakLab(DRM.trk), true); b.title = 'NEW (0.9): the sample editor — transients, slices, per-slice pitch / gate / reverse / stretch / stutter, slice pads, variations, resampling'; top.appendChild(b); }
  { const b = hbtn('GENERATE', 'sm', () => openSongGen()); b.title = 'NEW (0.9): generate a whole song — DnB, Jungle, Dub Techno, TripHop, Hip Hop, Trance, House'; top.appendChild(b); }
  { const ex = hbtn('EXPORT', 'sm', () => openExport()); ex.title = 'NEW: export the master or stems as WAV, FLAC or MP3 (the chain when CHAIN is on, else the selected pattern)'; top.appendChild(ex); }
  { const st = hbtn('SETTINGS', 'sm', () => openSettings()); st.title = 'Audio, power, MIDI, the parameter & CC list, the manual and About'; top.appendChild(st); }
  const exp = hbtn(m.classList.contains('expanded') ? 'DOCK' : 'EXPAND', 'sm', () => { m.classList.toggle('expanded'); renderDrums(); });
  /* Vektur Drum: the panel is the whole app — no DOCK / EXPAND / CLOSE (extract_drums.py patch) */
  root.appendChild(top);
  // ---- transport · display · pattern · master
  const r1 = el('div', 'dmrow dmr1');
  const tr = sec('TRANSPORT'); const trb = el('div', 'dmknobs'); trb.style.gap = '.3rem';
  const play = hbtn('PLAY', 'wide', () => { if (!d.on) { drumsSetOn(true).then(() => drumPost(['z', 1])); return; } drumPost(['z', 1]); }, true);
  const stop = hbtn('STOP', 'wide', () => drumPost(['z', 0]));
  const rec = hbtn('REC', 'wide rec' + (DRM.armedRec ? ' on' : ''), () => { DRM.armedRec = !DRM.armedRec; rec.classList.toggle('on', DRM.armedRec); drumPost(['r', DRM.armedRec ? 1 : 0]); }, true);
  play.title = 'Starts on the next beat, in time with the set'; rec.title = 'While playing, pad hits and MIDI notes are written into the pattern (to the nearest step)';
  trb.append(play, stop, rec); tr.appendChild(trb); DRM.els.play = play;
  const disp = sec('DISPLAY'); const ol = el('div', 'oled'); disp.appendChild(ol); DRM.els.oled = ol;
  const pt = sec('PATTERN', d.chainOn ? 'CHAIN' : 'LOOP');
  const pg = el('div', 'dmpats');
  for (let p = 0; p < 8; p++) {
    const b = hbtn(String(p + 1), (p === d.sel ? 'sel' : '') + (drumPatHas(p) ? ' has' : ''), () => { d.sel = p; drumPost(['y', p]); dirty(); renderDrums(); }, true);
    b.setAttribute('aria-label', 'Pattern ' + (p + 1)); pg.appendChild(b); DRM.els.pats.push(b); drumPatDrag(b, p);
  }
  pt.appendChild(pg);
  // pattern edits on their own row, then BARS and the CHAIN together (NEW 0.8: drag chips to reorder, × removes)
  const pe = el('div', 'dmchain dmpatedit'); pe.appendChild(el('b', 'dmrowlbl', 'PATTERN ' + (d.sel + 1)));
  pe.appendChild(hbtn('COPY', 'sm', () => { DRM.clip = JSON.parse(JSON.stringify(pat)); toast('Pattern ' + (d.sel + 1) + ' copied'); }));
  pe.appendChild(hbtn('PASTE', 'sm', () => { if (!DRM.clip) return; d.pats[d.sel] = JSON.parse(JSON.stringify(DRM.clip)); drumPushPattern(d.sel); dirty(); renderDrums(); }));
  pe.appendChild(hbtn('CLEAR', 'sm', () => { d.pats[d.sel] = drumEmptyPattern(); drumPushPattern(d.sel); dirty(); renderDrums(); }));
  { const v = pat.sl === 0 || pat.sl === 1 ? pat.sl : -1, lbl = v < 0 ? 'SLICER: SONG' : v ? 'SLICER: ON' : 'SLICER: OFF';   // NEW (0.9): this pattern's own Slicer
    const b = hbtn(lbl, 'sm cy' + (v >= 0 ? ' on' : ''), () => { pat.sl = v < 0 ? 1 : v === 1 ? 0 : -1; drumPost(['B', d.sel, pat.sl]); dirty(); renderDrums(); }, true);
    b.title = 'This pattern\'s Slicer: SONG follows the SLICER switch · ON slices this pattern · OFF keeps it dry'; pe.appendChild(b); }
  pt.appendChild(pe);
  const bars = el('div', 'dmchain dmbarsrow'); bars.appendChild(el('b', 'dmrowlbl', 'BARS'));
  [1, 2, 4].forEach(n => bars.appendChild(hbtn(String(n), 'sm' + (pat.bars === n ? ' on' : ''), () => { pat.bars = n; drumPushPattern(d.sel); dirty(); renderDrums(); }, true)));
  bars.appendChild(el('i', 'dmsep'));
  { const cb = hbtn('CHAIN', 'sm cy' + (d.chainOn ? ' on' : ''), () => { d.chainOn = !d.chainOn; drumPushChain(); dirty(); renderDrums(); }, true); cb.title = 'Play the chain (lit) or loop the selected pattern'; bars.appendChild(cb); }
  DRM.els.chain = drumChainStrip(bars, d);
  { const ab = hbtn('+ ' + (d.sel + 1), 'sm dmchadd', () => { if (d.chain.length < 16) { d.chain.push(d.sel); drumPushChain(); dirty(); renderDrums(); } }); ab.title = 'Add pattern ' + (d.sel + 1) + ' to the end of the chain (or drag a pattern button onto the chain)'; bars.appendChild(ab); }
  pt.appendChild(bars);
  const ms = sec('MASTER'); const mk = el('div', 'dmknobs');
  hostTempoKnob(mk); dKnob(mk, 'dr.swing', 'Swing'); dKnob(mk, 'dr.temper', 'Temper', { fmt: t => drumTemperFmt(drumDenorm(DRUM_PARAMS[DP_ID['dr.temper']], t)) }); dKnob(mk, 'dr.human', 'Humanise', { fmt: t => drumHumanFmt(t) }); dKnob(mk, 'dr.level', 'Level'); ms.appendChild(mk);
  r1.append(tr, disp, pt, ms); root.appendChild(r1);
  // ---- sequencer
  const sq = sec('SEQUENCER', 'PATTERN ' + (d.sel + 1)); sq.classList.add('dmseq');
  const edit = hbtn('EDIT', 'sm cy' + (DRM.edit ? ' on' : ''), () => { DRM.edit = !DRM.edit; edit.classList.toggle('on', DRM.edit); }, true);
  edit.title = 'On: tapping a step selects it for editing instead of switching it on or off (or hold a step)';
  edit.style.cssText = 'position:absolute;right:.5rem;top:.2rem;height:1.5rem'; sq.appendChild(edit);
  const hdr = el('div', 'dmhdr'); ['TRACK', 'M', 'S', null, 'LENGTH', 'DIV'].forEach(x => {
    if (x) { hdr.appendChild(el('span', null, x)); return; } const g = el('span'); ['1', '5', '9', '13'].forEach(n => g.appendChild(el('span', null, n))); hdr.appendChild(g); });
  sq.appendChild(hdr);
  for (let t = 0; t < d.ntr; t++) {
    const row = el('div', 'dmtrk'), tk = pat.tr[t];
    const nm = hbtn('', 'dmname' + (t === DRM.trk ? ' sel' : ''), () => { if (nm.dataset.lp) { delete nm.dataset.lp; return; } DRM.trk = t; renderDrums(); }, true);
    drumLongPress(nm, t); nm.title = 'Touch and hold (or right-click) to import a WAV or FLAC sample';
    nm.innerHTML = ''; nm.appendChild(document.createTextNode(drumTrackName(t))); nm.appendChild(el('small', null, 'TRACK ' + (t + 1))); nm.appendChild(el('i', 'led'));
    DRM.els.names.push(nm);
    const mu = hbtn('M', 'sm' + (drumVal(`t${t + 1}.mute`) ? ' on' : ''), () => { drumSet(`t${t + 1}.mute`, drumVal(`t${t + 1}.mute`) ? 0 : 1); renderDrums(); }, true);
    const so = hbtn('S', 'sm cy' + (drumVal(`t${t + 1}.solo`) ? ' on' : ''), () => { drumSet(`t${t + 1}.solo`, drumVal(`t${t + 1}.solo`) ? 0 : 1); renderDrums(); }, true);
    mu.setAttribute('aria-label', 'Mute track ' + (t + 1)); so.setAttribute('aria-label', 'Solo track ' + (t + 1));
    const steps = el('div', 'dmsteps'); DRM.els.steps.push([]);
    for (let s = 0; s < 16; s++) { const b = el('button', 'st'); b.setAttribute('aria-label', `Track ${t + 1} step ${s + 1}`); stepEvents(b, t, s); steps.appendChild(b); DRM.els.steps[t].push(b); }
    const ln = el('div', 'dmlen'); const lv = el('div', 'oled', String(tk.len).padStart(2, '0'));
    ln.append(hbtn('−', 'sm', () => { tk.len = Math.max(1, tk.len - 1); drumPushPattern(d.sel); dirty(); renderDrums(); }), lv,
      hbtn('+', 'sm', () => { tk.len = Math.min(16, tk.len + 1); drumPushPattern(d.sel); dirty(); renderDrums(); }));
    ln.title = 'Track length: 1–16 steps';
    const dv = el('div', 'dmdiv'); const sel = el('select'); sel.setAttribute('aria-label', `Track ${t + 1} timing division`);
    DRUM_DIVS.forEach((n, i) => { const o = new Option(n, i); if (i === tk.div) o.selected = true; sel.appendChild(o); });
    sel.onchange = () => { tk.div = +sel.value; drumPushPattern(d.sel); dirty(); };
    const dvw = el('div', 'oled'); dvw.style.padding = '.1rem'; dvw.appendChild(sel); dv.appendChild(dvw);
    row.append(nm, mu, so, steps, ln, dv);
    sq.appendChild(row);
  }
  root.appendChild(sq);
  // ---- performance pads · sound · step · effects
  const r3 = el('div', 'dmrow dmr3');
  const pf = sec('PERFORMANCE'); const pads = el('div', 'dmpads' + (d.ntr > 9 ? ' dmpads12' : ''));   // 0.9: 10–12 tracks → 4 × 3 pads
  { const xb = hbtn('⤢', 'sm dmpadx', () => (padWinOpen() ? closePadWin() : openPadWin())); xb.title = 'Expand the pads into their own window — drag to move, the corner to resize; the pads grow with it'; xb.setAttribute('aria-label', 'Expand the pads'); pf.appendChild(xb); }
  for (let t = 0; t < d.ntr; t++) {
    const p = el('div', 'pad' + (t === DRM.trk ? ' sel' : '')); p.append(el('b', null, String(t + 1)), el('i'), el('span', drumEngine(t) === 1 ? 'smp' : null, drumPadName(t, d.ntr > 9 ? 6 : 8))); p.title = drumEngine(t) === 1 ? (drumSampleName(t) || '') : '';
    p.setAttribute('role', 'button'); p.setAttribute('aria-label', `Pad ${t + 1}, ${drumTrackName(t)}`); p.tabIndex = 0;
    p.addEventListener('pointerdown', e => {
      e.preventDefault(); audioEnsure();
      const r = p.getBoundingClientRect(), vel = 50 + 77 * clamp(1 - (e.clientY - r.top) / r.height, 0, 1);   // higher on the pad = harder
      drumHit(t, vel); p.classList.add('down');
      if (DRM.trk !== t) { DRM.trk = t; renderDrumSound(); DRM.els.pads.forEach((x, i) => x.classList.toggle('sel', i === t)); DRM.els.names.forEach((x, i) => x.classList.toggle('sel', i === t)); }
    });
    const up = () => p.classList.remove('down'); p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up); p.addEventListener('pointerleave', up);
    p.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { drumHit(t, 100); e.preventDefault(); } });
    drumLongPress(p, t);
    pads.appendChild(p); DRM.els.pads.push(p);
  }
  pf.appendChild(pads);
  pf.appendChild(el('div', 'dmnote', 'Higher on a pad plays harder. With REC lit and the pattern playing, hits are written to the nearest step. MIDI notes on channel ' + (Math.round(drumVal('dr.ch')) || 'any') + ' (' + DRUM_NOTES.slice(0, d.ntr).join(', ') + ') play the pads too.'));
  const sd = sec('SOUND'); sd.classList.add('dmgrow'); DRM.els.sound = sd;
  const stp = sec('STEP'); DRM.els.stepSec = stp;
  const fx = sec('EFFECTS'); const fk = el('div', 'dmknobs');
  const dd = el('div', 'kcell'); dd.appendChild(el('span', 'klbl', 'Delay')); const dsel = el('select'); dsel.setAttribute('aria-label', 'Delay time');
  DRUM_DIVS.forEach((n, i) => { const o = new Option(n, i); if (i === Math.round(drumVal('dr.dlydiv'))) o.selected = true; dsel.appendChild(o); });
  dsel.onchange = () => drumSet('dr.dlydiv', +dsel.value); const dol = el('div', 'oled'); dol.style.cssText = 'min-width:0;padding:.1rem'; dol.appendChild(dsel); dd.appendChild(dol); fk.appendChild(dd);
  dKnob(fk, 'dr.dlyfb', 'Feedback'); dKnob(fk, 'dr.dlytone', 'D.Tone');
  { const rd = el('div', 'kcell'); rd.appendChild(el('span', 'klbl', 'Reverb')); const rs = el('select'); rs.setAttribute('aria-label', 'Reverb type');   // NEW (0.8)
    REV_TYPES.forEach((n, i) => { const o = new Option(n, i); if (i === Math.round(drumVal('dr.revtype'))) o.selected = true; rs.appendChild(o); });
    rs.onchange = () => { drumSet('dr.revtype', +rs.value); renderDrums(); }; const ro = el('div', 'oled'); ro.style.cssText = 'min-width:0;padding:.1rem'; ro.appendChild(rs); rd.appendChild(ro); fk.appendChild(rd); }
  dKnob(fk, 'dr.revsize', 'Rev Size', Math.round(drumVal('dr.revtype')) === 3 ? { fmt: x => { const v = Math.round(x * 100); return x >= .95 ? 'FREEZE ' + v + '%' : x >= .9 ? 'WASH ' + v + '%' : v + '%'; } } : Math.round(drumVal('dr.revtype')) === 2 ? { fmt: x => 'HOLD ' + Math.round(60 + 500 * x) + ' ms' } : {});
  dKnob(fk, 'dr.revdamp', 'Damping');
  fx.appendChild(fk);
  const sw = el('div', 'dmchain');
  sw.appendChild(hbtn('PING-PONG', 'sm' + (drumVal('dr.dlypp') ? ' on' : ''), () => { drumSet('dr.dlypp', drumVal('dr.dlypp') ? 0 : 1); renderDrums(); }, true));
  const chs = el('select'); chs.setAttribute('aria-label', 'Drum MIDI channel'); for (let c = 0; c <= 16; c++) { const o = new Option(c ? 'MIDI CH ' + c : 'MIDI ANY', c); if (c === Math.round(drumVal('dr.ch'))) o.selected = true; chs.appendChild(o); }
  chs.onchange = () => { drumSet('dr.ch', +chs.value); }; const cho = el('div', 'oled'); cho.style.cssText = 'min-width:0;padding:.1rem'; cho.appendChild(chs); sw.appendChild(cho);
  fx.appendChild(sw);
  // NEW: tape and vinyl, on the whole mix
  const tp = sec('TAPE', 'WHOLE MIX'); tp.classList.add('dmtape');
  const tk = el('div', 'dmknobs'); dKnob(tk, 'tp.wow', 'Wow', { fmt: x => x <= 0 ? 'OFF' : Math.round(x * 100) + '%' }); dKnob(tk, 'tp.flutter', 'Flutter', { fmt: x => x <= 0 ? 'OFF' : Math.round(x * 100) + '%' });
  dKnob(tk, 'tp.dust', 'Dust', { fmt: x => x <= 0 ? 'OFF' : Math.round(x * 100) + '%' }); tp.appendChild(tk);
  tp.title = 'Wow: slow pitch drift. Flutter: fast tape wobble. Dust: vinyl crackle and hiss.';
  const eqs = sec('EQ'); eqs.classList.add('dmeqsec'); DRM.els.eq = eqs;
  const c1 = el('div', 'dmcol'), c2 = el('div', 'dmcol'), c3 = el('div', 'dmcol z-fxcol'); c1.append(pf); c2.append(stp); c3.append(fx, eqs, tp);   // (0.8) tape joins the effects area · (0.9.1) the track EQ above it
  // NEW (0.8): shaded areas — the effects in a dark grey area of their own, every other kind of section its own grey
  [[tr, 'z-ctl'], [disp, 'z-ctl'], [pt, 'z-ctl'], [ms, 'z-ctl'], [sq, 'z-seq'], [pf, 'z-play'], [sd, 'z-snd'], [stp, 'z-step'], [eqs, 'z-step'], [fx, 'z-fx'], [tp, 'z-fx']].forEach(([x, z]) => x.classList.add(z));
  r3.append(c1, sd, c2, c3); root.appendChild(r3);   // compact: pads over tape, step over EQ, effects over glitch
  DRM.els.fxCol = c3;
  renderGlitch(root);   // (0.8) the LFO row; the glitch itself is METALISE in the Slicer window
  renderDrumSound(); renderDrumStep();
  for (let t = 0; t < d.ntr; t++) for (let s = 0; s < 16; s++) paintStep(t, s);
  paintOled(); if (DRM.tel) paintDrumLive(DRM.tel);
  if (padWinOpen()) renderPadWin();
}
/** NEW (0.8): the chain as coloured chips — drag one sideways to move it, × to remove it, tap to edit that pattern.
    Pattern buttons 1–8 can be dragged onto the strip to insert there. */
function drumChainStrip(host, d) {
  const strip = el('span', 'dmchstrip'); strip.title = 'Drag a chip to move it · × removes it · tap selects that pattern · drag a pattern button here to insert it';
  const chips = d.chain.map((p, i) => {
    const c = el('span', 'dmchip pc' + p); c.appendChild(el('b', null, String(p + 1)));
    const x = el('i', 'dmchx', '×'); x.setAttribute('role', 'button'); x.setAttribute('aria-label', `Remove chain position ${i + 1} (pattern ${p + 1})`);
    x.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); d.chain.splice(i, 1); drumPushChain(); dirty(); renderDrums(); });
    c.appendChild(x);
    c.addEventListener('pointerdown', e => {
      if (e.button > 0) return; e.preventDefault(); c.setPointerCapture(e.pointerId);
      const x0 = e.clientX; let moved = false, at = i;
      c.onpointermove = ev => {
        if (!moved && Math.abs(ev.clientX - x0) < 6) return; moved = true; c.classList.add('drag');
        c.style.transform = `translateX(${ev.clientX - x0}px)`;
        const others = [...strip.querySelectorAll('.dmchip')]; at = i;
        others.forEach((o, j) => { if (j === i) return; const r = o.getBoundingClientRect(), mid = r.left + r.width / 2; if (j < i && ev.clientX < mid) at = Math.min(at, j); if (j > i && ev.clientX > mid) at = Math.max(at, j); });
        others.forEach((o, j) => o.classList.toggle('gap', j === at && j !== i));
      };
      c.onpointerup = c.onpointercancel = () => { c.onpointermove = c.onpointerup = c.onpointercancel = null;
        if (!moved) { d.sel = p; drumPost(['y', p]); dirty(); renderDrums(); return; }
        if (at !== i) { const [m] = d.chain.splice(i, 1); d.chain.splice(at, 0, m); drumPushChain(); dirty(); }
        renderDrums(); };
    });
    strip.appendChild(c); return c;
  });
  if (!d.chain.length) strip.appendChild(el('span', 'dmchempty', 'empty — tap + or drag a pattern here'));
  if (d.chain.length) { const cl = el('i', 'dmchclr', 'clear'); cl.title = 'Empty the chain'; cl.setAttribute('role', 'button');
    cl.onclick = () => { d.chain = []; d.chainOn = false; drumPushChain(); dirty(); renderDrums(); }; strip.appendChild(cl); }
  host.appendChild(strip); return chips;
}
/** Dragging a pattern button (1–8) onto the chain strip inserts it where it is dropped. */
function drumPatDrag(b, p) {
  b.addEventListener('pointerdown', e => {
    const x0 = e.clientX, y0 = e.clientY; let ghost = null;
    const mv = ev => { if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 10) return;
      if (!ghost) { ghost = el('span', 'dmchip pc' + p + ' dmghost'); ghost.appendChild(el('b', null, String(p + 1))); document.body.appendChild(ghost); b.dataset.dragged = '1'; }
      ghost.style.left = ev.clientX - 12 + 'px'; ghost.style.top = ev.clientY - 12 + 'px'; };
    const up = ev => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (!ghost) return; ghost.remove();
      const eat = e2 => { e2.stopPropagation(); e2.preventDefault(); }; addEventListener('click', eat, true); setTimeout(() => removeEventListener('click', eat, true), 80);   // a drag is not a tap
      const strip = document.querySelector('#drumModal .dmchstrip'); const d = drumState(); if (!strip || d.chain.length >= 16) { renderDrums(); return; }
      const r = strip.getBoundingClientRect(); if (ev.clientY < r.top - 14 || ev.clientY > r.bottom + 14 || ev.clientX < r.left - 30 || ev.clientX > r.right + 60) { renderDrums(); return; }
      let at = d.chain.length; [...strip.querySelectorAll('.dmchip')].forEach((o, j) => { const q = o.getBoundingClientRect(); if (ev.clientX < q.left + q.width / 2 && at === d.chain.length) at = j; });
      d.chain.splice(at, 0, p); drumPushChain(); dirty(); toast('Pattern ' + (p + 1) + ' → chain position ' + (at + 1)); renderDrums(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
}
function drumPatHas(p) { return drumState().pats[p].tr.some(tr => tr.s.some(Boolean)); }
function renderDrumSound() {
  const sd = DRM.els && DRM.els.sound; if (!sd) return;
  const t = DRM.trk, k = `t${t + 1}`, eng = drumEngine(t);
  sd.innerHTML = ''; const h = el('h5', null, 'SOUND'); h.appendChild(el('em', null, `TRACK ${t + 1} · ${drumTrackName(t)}`)); sd.appendChild(h);
  // engine: drum synth · sample · FM (per track)
  const eg = el('div', 'dmeng');
  DRUM_ENGINES.forEach((n, i) => { const b = hbtn(['SYNTH', 'SAMPLE', 'FM'][i], 'sm cy' + (eng === i ? ' on' : ''), () => { drumSet(k + '.engine', i); renderDrums(); }, true); b.title = n; eg.appendChild(b); });
  // choke group
  const cg = el('span', 'dmchoke'); cg.appendChild(el('b', null, 'CHOKE'));
  CHOKE_GROUPS.forEach((n, i) => { const b = hbtn(i ? n : '—', 'sm' + (Math.round(drumVal(k + '.choke')) === i ? ' on' : ''), () => { drumSet(k + '.choke', i); renderDrumSound(); }, true);
    b.setAttribute('aria-label', i ? 'Choke group ' + n : 'No choke group'); cg.appendChild(b); });
  cg.title = 'Tracks in the same group cut each other off (closed / open hat)';
  eg.appendChild(cg); sd.appendChild(eg);
  if (eng === 0) {
    const mg = el('div', 'dmmodels');
    DRUM_MODELS.forEach((n, i) => mg.appendChild(hbtn(DRUM_SHORT[i], 'sm' + (Math.round(drumVal(k + '.model')) === i ? ' on' : ''), () => { drumSet(k + '.model', i); renderDrums(); }, true)));
    sd.appendChild(mg);
  } else if (eng === 1) {
    const sr = el('div', 'dmsmp'), name = drumSampleName(t);
    const sb = hbtn(name ? 'SAMPLE ✓' : 'LOAD SAMPLE…', 'sm' + (name ? ' on' : ''), () => drumSampleMenu(t, sb), true); sb.title = 'Import a WAV or FLAC sample for this track (or touch and hold the track name)';
    sr.appendChild(sb);
    sr.appendChild(el('span', 'dmnote', name ? name + ' — tune, decay (full = to the end), tone (low-pass), sweep, crush and sends shape it.' : 'No sample on this track yet: it stays silent until you load one.'));
    sd.appendChild(sr);
  } else {
    const ag = el('div', 'dmmodels');
    FM_ALGOS.forEach((n, i) => { const b = hbtn(FM_SHORT[i], 'sm' + (Math.round(drumVal(k + '.fmalgo')) === i ? ' on' : ''), () => { drumSet(k + '.fmalgo', i); renderDrums(); }, true); b.title = n; ag.appendChild(b); });
    sd.appendChild(ag);
    const fk = el('div', 'dmknobs dmfm');
    [['fmfreq', 'Freq'], ['fmratio', 'Ratio'], ['fmratio2', 'Ratio 2'], ['fmindex', 'Index'], ['fmidec', 'Mod dec'], ['fmfb', 'Feedback'], ['fmfold', 'Fold'], ['fmnoise', 'Noise']]
      .forEach(([x, n]) => dKnob(fk, `${k}.${x}`, n));
    sd.appendChild(fk);
  }
  const kn = el('div', 'dmknobs');
  const common = eng === 0 ? [['tune', 'Tune'], ['decay', 'Decay'], ['tone', 'Tone'], ['snap', 'Snap'], ['level', 'Level'], ['pan', 'Pan'], ['bits', 'Bits'], ['rate', 'Rate'], ['dly', 'Delay'], ['rev', 'Reverb']]
    : eng === 1 ? [['tune', 'Tune'], ['decay', 'Decay'], ['tone', 'Tone'], ['level', 'Level'], ['pan', 'Pan'], ['bits', 'Bits'], ['rate', 'Rate'], ['dly', 'Delay'], ['rev', 'Reverb']]
    : [['tune', 'Tune'], ['decay', 'Decay'], ['tone', 'Bright'], ['snap', 'Click'], ['level', 'Level'], ['pan', 'Pan'], ['bits', 'Bits'], ['rate', 'Rate'], ['dly', 'Delay'], ['rev', 'Reverb']];
  const lng = !!drumVal(`${k}.long`);
  common.forEach(([x, n]) => {
    if (x !== 'decay') { dKnob(kn, `${k}.${x}`, n); return; }
    dKnob(kn, `${k}.decay`, lng ? 'Decay ×20' : n, lng ? { fmt: t2 => { const v = drumDenorm(DRUM_PARAMS[DP_ID[`${k}.decay`]], t2) * 20; return eng === 1 && v >= 59 ? 'FULL' : v >= 10 ? v.toFixed(0) + ' s' : v.toFixed(1) + ' s'; } } : {});
    const lb = hbtn('LONG', 'sm cy dmlong' + (lng ? ' on' : ''), () => { drumSet(`${k}.long`, lng ? 0 : 1); renderDrumSound(); }, true);   // NEW (0.9.1)
    lb.title = 'LONG: Decay × 20 — sounds and drones up to 60 s (a sample plays to its end at full)'; lb.setAttribute('aria-pressed', lng); kn.appendChild(lb);
  });
  const bd = el('div', 'dmbend'); bd.title = 'Sweep: the pitch starts this many semitones away and glides home over the sweep time, on every hit. Bend: a fixed offset, or a wobble at the bend rate.';
  dKnob(bd, `${k}.sweep`, 'Sweep'); dKnob(bd, `${k}.swtime`, 'Sw time'); dKnob(bd, `${k}.bend`, 'Bend'); dKnob(bd, `${k}.brate`, 'Bend rate'); kn.appendChild(bd);
  sd.appendChild(kn);
  renderDrumVintage(sd, t, k, eng);
  renderDrumEq(t);
}
/** NEW (0.9): the track's vintage-sampler character — METALISE, RESAMPLE (sampler model, transient handling) and, on
    sample tracks, the tune mode, stretch, which slice plays, and the way into the BREAK LAB. One compact row. */
function renderDrumVintage(sd, t, k, eng) {
  const row = el('div', 'dmknobs dmvint'); row.appendChild(el('i', 'dmvlbl', 'SAMPLER'));
  const pct = x => x <= 0 ? 'OFF' : Math.round(x * 100) + '%';
  dKnob(row, k + '.metal', 'Metalise', { fmt: pct }); dKnob(row, k + '.rsmp', 'Resample', { fmt: pct });
  const sel = (key, list, label) => { const dd = el('div', 'kcell vsel'); dd.appendChild(el('span', 'klbl', label)); const se = el('select'); se.setAttribute('aria-label', label);
    list.forEach((n, j) => { const o = new Option(n, j); if (j === Math.round(drumVal(key))) o.selected = true; se.appendChild(o); });
    se.onchange = () => drumSet(key, +se.value); const ol = el('div', 'oled'); ol.style.cssText = 'min-width:0;padding:.1rem'; ol.appendChild(se); dd.appendChild(ol); row.appendChild(dd); };
  sel(k + '.smodel', SAMPLER_MODEL_NAMES, 'Model'); sel(k + '.rsmode', RS_MODES, 'Transient'); dKnob(row, k + '.rssens', 'T.Sens', { fmt: x => Math.round(x * 100) + '%' });
  if (eng === 1) {
    sel(k + '.tsmode', TS_MODES, 'Tune mode'); dKnob(row, k + '.stretch', 'Stretch', { fmt: x => drumDenorm(DRUM_PARAMS[DP_ID[k + '.stretch']], x).toFixed(2) + '×' });
    const n = drumSx()[t].slices.length;
    if (n) dKnob(row, k + '.slice', 'Slice', { fmt: x => { const v = Math.round(drumDenorm(DRUM_PARAMS[DP_ID[k + '.slice']], x)); return Math.min(v, n) + '/' + n; } });
    const b = hbtn(n ? 'BREAK LAB · ' + n : 'BREAK LAB…', 'sm cy' + (n ? ' on' : ''), () => openBreakLab(t), true); b.title = 'Detect transients, slice, edit each slice, play slices from steps and pads'; row.appendChild(b);
  }
  row.title = 'Metalise: vintage 16-bit sampler grit (rate and bit reduction, emphasis, sample-and-hold, metallic resonance), stronger as you turn it. Resample: the track through a sampler model\'s converter; Transient chooses how attacks are treated (Preserve · Round · Crush · Rebuild) and T.Sens how readily an attack is detected.';
  sd.appendChild(row);
}
/* NEW: the track's 4-band EQ — low shelf · peak · peak · high shelf. A band at 0 dB is off. Every dial can be modulated. */
function drumEqResponse(t, f) {   // |H| in dB at f Hz, from the same RBJ formulas as the engine (48 kHz)
  const sr = 48000; let db = 0;
  for (let b = 0; b < 4; b++) {
    const g = drumVal(`t${t + 1}.eq${b + 1}g`); if (!g) continue;
    const fc = Math.min(drumVal(`t${t + 1}.eq${b + 1}f`), sr * 0.45), A = Math.pow(10, g / 40), w0 = 2 * Math.PI * fc / sr, cs = Math.cos(w0), sn = Math.sin(w0);
    let b0, b1, b2, a0, a1, a2;
    if (b === 0 || b === 3) { const s = b === 0 ? 1 : -1, sA = 2 * Math.sqrt(A) * sn / 2 * Math.SQRT2;
      b0 = A * ((A + 1) - s * (A - 1) * cs + sA); b1 = s * 2 * A * ((A - 1) - s * (A + 1) * cs); b2 = A * ((A + 1) - s * (A - 1) * cs - sA);
      a0 = (A + 1) + s * (A - 1) * cs + sA; a1 = -s * 2 * ((A - 1) + s * (A + 1) * cs); a2 = (A + 1) + s * (A - 1) * cs - sA;
    } else { const al = sn / 2; b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
    const w = 2 * Math.PI * f / sr, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2), dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
    db += 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  return db;
}
function drumEqCurve(svg, t) {
  const W = 120, H = 36, pts = [];
  for (let i = 0; i <= 60; i++) { const f = 20 * Math.pow(1000, i / 60), db = clamp(drumEqResponse(t, f), -18, 18); pts.push(`${(i / 60 * W).toFixed(1)},${(H / 2 - db / 18 * (H / 2 - 2)).toFixed(1)}`); }
  svg.innerHTML = `<line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#2a2d32"/><polyline fill="none" stroke="#ffb23d" stroke-width="1.5" points="${pts.join(' ')}"/>`;
}
function renderDrumEq(t) {
  const sd = DRM.els && DRM.els.eq; if (!sd) return; sd.innerHTML = '';
  const h5 = el('h5', null, 'EQ'); h5.appendChild(el('em', null, `TRACK ${t + 1}`)); sd.appendChild(h5);
  const box = el('div', 'dmeq'); const hd = el('div', 'dmeqh');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 120 36'); svg.classList.add('dmeqc'); hd.appendChild(svg);
  hd.appendChild(hbtn('FLAT', 'sm', () => { for (let b = 1; b <= 4; b++) drumSet(`t${t + 1}.eq${b}g`, 0); renderDrumSound(); }));
  box.appendChild(hd);
  const kk = el('div', 'dmknobs dmeqk'), redraw = () => drumEqCurve(svg, t);
  ['LO', 'LO-MID', 'HI-MID', 'HI'].forEach((n, b) => { const g = el('div', 'dmeqb'); g.appendChild(el('i', null, n));
    dKnob(g, `t${t + 1}.eq${b + 1}f`, 'Freq', { set: x => { drumSetNorm(`t${t + 1}.eq${b + 1}f`, x); redraw(); } });
    dKnob(g, `t${t + 1}.eq${b + 1}g`, 'Gain', { set: x => { const q = DRUM_PARAMS[DP_ID[`t${t + 1}.eq${b + 1}g`]], v = drumDenorm(q, x); drumSet(`t${t + 1}.eq${b + 1}g`, Math.abs(v) < 0.25 ? 0 : v, true); redraw(); },
      fmt: x => { const v = drumDenorm(DRUM_PARAMS[DP_ID[`t${t + 1}.eq${b + 1}g`]], x); return Math.abs(v) < 0.25 ? 'OFF' : (v > 0 ? '+' : '') + v.toFixed(1) + ' dB'; } });
    kk.appendChild(g); });
  box.appendChild(kk); sd.appendChild(box); redraw();
}
function drumStepData(t, s) { const d = drumState(); return d.pats[d.sel].tr[t].s[s]; }
function renderDrumStep() {
  const sp = DRM.els && DRM.els.stepSec; if (!sp) return;
  sp.innerHTML = ''; const t = DRM.trk, s = DRM.step;
  const h = el('h5', null, 'STEP'); h.appendChild(el('em', null, s >= 0 ? `T${t + 1} · ${String(s + 1).padStart(2, '0')}` : '—')); sp.appendChild(h);
  if (s < 0) { sp.appendChild(el('div', 'dmnote', 'Hold a step (or turn EDIT on and tap one) to set its velocity, pan, pitch, ratchet, crush, delay, reverb and chance — and, on FM tracks, its own FM ratio.')); return; }
  const d = drumState(), pat = d.pats[d.sel];
  const cur = () => pat.tr[t].s[s];
  const ensure = () => { if (!pat.tr[t].s[s]) pat.tr[t].s[s] = [.8, 0, 0, 1]; return pat.tr[t].s[s]; };
  const push = () => { drumPost(drumStepMsg(d.sel, t, s, cur())); paintStep(t, s); };
  const fxSet = (i, v) => { drumStepFull(ensure())[i] = v; push(); };
  const kn = el('div', 'dmknobs');
  slider(kn, { knob: true, label: 'Velocity', min: 0, max: 1, def: .8, get: () => (cur() ? cur()[0] : .8), set: v => { ensure()[0] = v; push(); }, fmt: v => Math.round(v * 127) + '' });
  slider(kn, { knob: true, label: 'Pan', min: -1, max: 1, def: 0, get: () => (cur() ? cur()[1] : 0), set: v => { ensure()[1] = Math.abs(v) < .03 ? 0 : v; push(); }, fmt: v => Math.abs(v) < .03 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100) });
  slider(kn, { knob: true, label: 'Pitch', min: -12, max: 12, def: 0, step: 1, get: () => (cur() ? cur()[2] : 0), set: v => { ensure()[2] = Math.round(v); push(); }, fmt: v => (v > 0 ? '+' : '') + Math.round(v) + ' st' });
  sp.appendChild(kn);
  // the step's own effects and its chance of playing
  const kf = el('div', 'dmknobs');
  slider(kf, { knob: true, label: 'Crush', min: 0, max: 1, def: 0, get: () => drumStepVal(cur(), 4), set: v => fxSet(4, v < .02 ? 0 : v), fmt: v => v <= 0 ? 'OFF' : (16 - Math.round(v * 14)) + ' bit' });
  slider(kf, { knob: true, label: 'Delay', min: 0, max: 1, def: 0, get: () => drumStepVal(cur(), 5), set: v => fxSet(5, v < .01 ? 0 : v), fmt: v => Math.round(v * 100) + '' });
  slider(kf, { knob: true, label: 'Reverb', min: 0, max: 1, def: 0, get: () => drumStepVal(cur(), 6), set: v => fxSet(6, v < .01 ? 0 : v), fmt: v => Math.round(v * 100) + '' });
  slider(kf, { knob: true, label: 'Fold', min: 0, max: 1, def: 0, get: () => drumStepVal(cur(), 14), set: v => { const s = drumStepFull(ensure(), DRUM_STEP_N); s[14] = v < .01 ? 0 : v; push(); }, fmt: v => v <= 0 ? 'OFF' : Math.round(v * 100) + '%' });   // NEW: this step's own wavefolder
  slider(kf, { knob: true, label: 'Chance', min: 0, max: 1, def: 1, get: () => drumStepVal(cur(), 7), set: v => fxSet(7, v > .99 ? 1 : v), fmt: v => Math.round(v * 100) + '%' });
  if (drumEngine(t) === 2) {   // FM tracks: this step's modulator ratio (0 = the track's Ratio)
    const toK = r => r > 0 ? Math.log(r / .25) / Math.log(64) : 0, fromK = x => x < .02 ? 0 : .25 * Math.pow(64, x);
    slider(kf, { knob: true, label: 'FM ratio', min: 0, max: 1, def: 0, get: () => toK(drumStepVal(cur(), 8)), set: x => fxSet(8, Math.round(fromK(x) * 100) / 100), fmt: x => x < .02 ? 'TRACK' : fromK(x).toFixed(2) });
  }
  sp.appendChild(kf);
  // NEW (0.8): this step's pitch shifter and spectral processor (any engine)
  const kx = el('div', 'dmknobs dmstepx'), setX = (i, v) => { const s = drumStepFull(ensure(), DRUM_STEP_N); s[i] = v; push(); };
  const g1 = el('div', 'dmxg'); g1.appendChild(el('i', null, 'PITCH SHIFT'));
  slider(g1, { knob: true, label: 'Shift', min: -24, max: 24, def: 0, bipolar: true, get: () => drumStepVal(cur(), 15), set: v => setX(15, Math.abs(v) < .25 ? 0 : Math.round(v * 2) / 2), fmt: v => Math.abs(v) < .25 ? 'OFF' : (v > 0 ? '+' : '') + v.toFixed(1) + ' st' });
  slider(g1, { knob: true, label: 'Mix', min: 0, max: 1, def: 1, get: () => drumStepVal(cur(), 16), set: v => setX(16, v), fmt: v => Math.round(v * 100) + '%' });
  const g2 = el('div', 'dmxg'); g2.appendChild(el('i', null, 'SPECTRAL'));
  slider(g2, { knob: true, label: 'Spectral', min: 0, max: 1, def: 0, get: () => drumStepVal(cur(), 17), set: v => setX(17, v < .01 ? 0 : v), fmt: v => v <= 0 ? 'OFF' : Math.round(v * 100) + '%' });
  slider(g2, { knob: true, label: 'Colour', min: 0, max: 1, def: 0, get: () => drumStepVal(cur(), 18), set: v => setX(18, v), fmt: v => specColourName(v) });
  slider(g2, { knob: true, label: 'Mix', min: 0, max: 1, def: 1, get: () => drumStepVal(cur(), 19), set: v => setX(19, v), fmt: v => Math.round(v * 100) + '%' });
  const g3 = el('div', 'dmxg'); g3.appendChild(el('i', null, 'SAMPLER'));   // NEW (0.9): this step's Metalise, slice, reverse and stutter chance
  slider(g3, { knob: true, label: 'Metalise', min: -0.02, max: 1, def: -0.02, get: () => Math.max(-0.02, drumStepVal(cur(), 20)), set: v => setX(20, v < 0.005 ? -1 : v), fmt: v => v < 0.005 ? 'TRACK' : Math.round(v * 100) + '%' });
  if (drumEngine(t) === 1) { const ns = drumSx()[t].slices.length;
    slider(g3, { knob: true, label: 'Slice', min: 0, max: Math.max(1, ns), def: 0, step: 1, get: () => Math.min(drumStepVal(cur(), 21), Math.max(1, ns)), set: v => setX(21, Math.round(v)), fmt: v => Math.round(v) ? 'S' + Math.round(v) : 'TRACK' });
    slider(g3, { knob: true, label: 'Rev %', min: 0, max: 1, def: 0, get: () => drumStepVal(cur(), 22), set: v => setX(22, v < .01 ? 0 : v), fmt: v => Math.round(v * 100) + '%' });
    slider(g3, { knob: true, label: 'Stut %', min: 0, max: 1, def: 0, get: () => drumStepVal(cur(), 23), set: v => setX(23, v < .01 ? 0 : v), fmt: v => Math.round(v * 100) + '%' }); }
  kx.append(g1, g2, g3); sp.appendChild(kx);
  const rt = el('div', 'dmrat'); rt.appendChild(el('span', 'klbl', 'RATCHET'));
  [1, 2, 3, 4].forEach(n => rt.appendChild(hbtn('×' + n, 'sm' + ((cur() ? cur()[3] : 1) === n ? ' on' : ''), () => { ensure()[3] = n; push(); dirty(); renderDrumStep(); }, true)));
  sp.appendChild(rt);
  { const rg = drumStepVal(cur(), 9) > 0, b = hbtn(rg ? 'RING ' + (drumStepVal(cur(), 10) >= RING_OSC ? 'OSC' : 'T' + (drumStepVal(cur(), 10) + 1)) : 'RING MOD…', 'sm cy' + (rg ? ' on' : ''), () => openRing(t, s), true);
    b.title = 'NEW: ring-modulate other tracks (the slaves) by a master track or a sine oscillator, for this step'; sp.appendChild(b); }
  sp.appendChild(hbtn(cur() ? 'STEP ON' : 'STEP OFF', 'sm' + (cur() ? ' on' : ''), () => { pat.tr[t].s[s] = cur() ? null : [.8, 0, 0, 1]; push(); dirty(); renderDrumStep(); }, true));
}
function stepEvents(b, t, s) {
  let timer = null, held = false;
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); audioEnsure(); b.classList.add('down'); held = false;
    timer = setTimeout(() => { held = true; selectStep(t, s); }, 380);   // hold: select for editing (one-shot, cleared on release)
  });
  const end = toggle => { clearTimeout(timer); b.classList.remove('down'); if (!toggle || held) return;
    if (DRM.edit) { selectStep(t, s); return; }
    const d = drumState(), tr = d.pats[d.sel].tr[t];
    tr.s[s] = tr.s[s] ? null : [.8, 0, 0, 1];
    const v = tr.s[s]; drumPost(drumStepMsg(d.sel, t, s, v)); dirty();
    if (v) selectStep(t, s, true); else paintStep(t, s);
  };
  b.addEventListener('pointerup', () => end(true)); b.addEventListener('pointercancel', () => end(false)); b.addEventListener('pointerleave', () => end(false));
  b.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); end(true); } });
}
function selectStep(t, s, quiet) {
  const prevT = DRM.trk, prevS = DRM.step; DRM.step = s;
  if (prevT !== t) { DRM.trk = t; renderDrums(); return; }
  if (prevS >= 0) paintStep(prevT, prevS); paintStep(t, s); renderDrumStep();
  if (!quiet) toast(`Editing track ${t + 1}, step ${s + 1}`);
}
function paintStep(t, s) {
  const b = DRM.els && DRM.els.steps[t] && DRM.els.steps[t][s]; if (!b) return;
  const d = drumState(), tr = d.pats[d.sel].tr[t], v = tr.s[s];
  b.classList.toggle('on', !!v); b.classList.toggle('acc', !!v && v[0] >= .9);
  b.classList.toggle('off', s >= tr.len); b.classList.toggle('sel', t === DRM.trk && s === DRM.step);
  b.classList.toggle('mute', !!drumVal(`t${t + 1}.mute`));
  const pr = drumStepVal(v, 7), fx = v && (drumStepVal(v, 4) > 0 || drumStepVal(v, 5) > 0 || drumStepVal(v, 6) > 0 || drumStepVal(v, 8) > 0 || drumStepVal(v, 14) > 0 || drumStepVal(v, 15) !== 0 || drumStepVal(v, 17) > 0);
  const fr = drumStepVal(v, 8);
  const mark = v ? (v[3] > 1 ? '×' + v[3] : '') + (v[2] ? (v[2] > 0 ? '+' : '') + v[2] : '') + (pr < 1 ? Math.round(pr * 100) + '%' : '') + (fr > 0 ? 'r' + (+fr.toFixed(2)) : '') : '';
  const rg = v && drumStepVal(v, 9) > 0;
  const key = mark + (fx ? '•' : '') + (rg ? '◎' : '');
  if (b.dataset.m !== key) { b.dataset.m = key; b.innerHTML = (mark ? `<em>${mark}</em>` : '') + (fx ? '<i class="sfx"></i>' : '') + (rg ? '<i class="srg"></i>' : ''); }
}
function paintOled() {
  const o = DRM.els && DRM.els.oled; if (!o) return;
  const d = drumState(), tel = DRM.tel, playing = tel && tel[0] === 1, waiting = tel && tel[0] === .5;
  const cur = tel ? Math.round(tel[1]) : d.sel;
  const st = playing ? Math.max(0, tel[4 + DRM.trk]) + 1 : 0, len = d.pats[d.sel].tr[DRM.trk].len;
  const line1 = `${playing ? '▶' : waiting ? '…' : '■'} PAT <b>${String(cur + 1).padStart(2, '0')}</b>  ${d.chainOn && d.chain.length ? `CHAIN ${(tel ? Math.round(tel[2]) : 0) + 1}/${d.chain.length}` : 'LOOP'}`;
  const line2 = `<i>${(S.bpm || 120).toFixed(1)}</i> BPM   STEP ${String(st).padStart(2, '0')}/${String(len).padStart(2, '0')}`;
  const line3 = `T${DRM.trk + 1} ${drumTrackName(DRM.trk).padEnd(6)} ${DRM.armedRec ? '<i>● REC</i>' : ''}${d.on ? '' : '  OFF'}`;
  const html = line1 + '\n' + line2 + '\n' + line3;
  if (o.dataset.h !== html) { o.dataset.h = html; o.innerHTML = html; }
}
function drumFlashPad(t) { const p = DRM.els && DRM.els.pads[t]; if (p) p.classList.add('hit'); if (PADW.pads[t]) PADW.pads[t].classList.add('hit'); }
function paintDrumLive(tel) {
  const E = DRM.els; if (!E) return;
  const playing = tel[0] === 1;
  E.play.classList.toggle('on', tel[0] > 0);
  const nt = Math.min(drumNtr(), E.steps.length);
  for (let t = 0; t < nt; t++) {
    const s = playing ? tel[4 + t] : -1;
    if (s !== E.lastStep[t]) { const old = E.lastStep[t]; if (old >= 0 && E.steps[t][old]) E.steps[t][old].classList.remove('ph'); if (s >= 0 && E.steps[t][s]) E.steps[t][s].classList.add('ph'); E.lastStep[t] = s; }
    const hit = tel[4 + 2 * DRUM_TRACKS + t] > .08;
    if (hit !== E.lastHit[t]) { E.lastHit[t] = hit; E.pads[t].classList.toggle('hit', hit); E.names[t].classList.toggle('on', hit); if (PADW.pads[t]) PADW.pads[t].classList.toggle('hit', hit); }
  }
  if (typeof paintModLive === 'function') paintModLive(tel);
  const cp = Math.round(tel[1]);
  if (cp !== E.lastPat) { E.lastPat = cp; E.pats.forEach((b, i) => b.classList.toggle('on', playing && i === cp)); }
  if (E.chain && E.chain.length) { const ci = Math.round(tel[2]); E.chain.forEach((sp, i) => sp.classList.toggle('now', playing && drumState().chainOn && i === ci)); }
  paintOled(); paintGlitchLive(tel);
}
/* NEW (0.7): compact layout — no wasted space. Smaller dials, tighter sections, the bottom row as a grid:
   pads · sound · (step over EQ) · (effects over tape); glitch and LFOs share one row. */
(function compactCSS() {
  const st = document.createElement('style');
  st.textContent = `#drumModal .dm .kcell{width:3.35rem;gap:.05rem}#drumModal .dm .knob{width:2.3rem;height:2.3rem}
#drumModal .dm .kcell .klbl{font-size:.5rem;letter-spacing:.08em}#drumModal .dm .kcell .kval{font-size:.54rem;min-width:2.2rem;padding:0 .2rem}
#drumModal .dm .dmsec{padding:1.3rem .4rem .3rem}#drumModal .dm .dmrow{gap:.35rem;margin-bottom:.35rem}
#drumModal .dm .dmknobs{gap:.1rem .05rem}
#drumModal .dm .dmr3{display:grid;grid-template-columns:auto minmax(0,1.5fr) minmax(15rem,1fr) minmax(13.5rem,.85fr);align-items:stretch}
#drumModal .dm .dmcol{display:flex;flex-direction:column;gap:.35rem;min-width:0}#drumModal .dm .dmcol>.dmsec{flex:none}#drumModal .dm .dmcol>.dmsec:last-child{flex:1}
#drumModal .dm .dmpads{grid-template-columns:repeat(3,3.7rem);gap:.3rem}#drumModal .dm .pad{font-size:.85em}
#drumModal .dm .dmnote{font-size:.6rem;line-height:1.3}
#drumModal .dm .dmsec.z-ctl{--zt:rgba(205,212,225,.13)}#drumModal .dm .dmsec.z-seq{--zt:rgba(255,255,255,.035)}#drumModal .dm .dmsec.z-play{--zt:rgba(255,236,214,.15)}
#drumModal .dm .dmsec.z-snd{--zt:rgba(255,255,255,.095)}#drumModal .dm .dmsec.z-step{--zt:rgba(185,198,232,.075)}#drumModal .dm .dmsec.z-mod{--zt:rgba(214,204,255,.08)}#drumModal .dm .dmsec>.dmpads{margin-top:.3rem}
#drumModal .dm .dmsec.z-fx{--zt:rgba(0,0,0,.5)}#drumModal .dm .z-fxcol{background:rgba(0,0,0,.38);border-radius:.55rem;padding:.25rem;box-shadow:inset 0 0 0 1px rgba(255,255,255,.04)}
#drumModal .dm .dmsec.z-fx>h5{color:#8f949c}#drumModal .dm .dmpadx{position:absolute;right:.3rem;top:.15rem;min-width:1.4rem;height:1.2rem;padding:0 .25rem;font-size:.7rem;line-height:1}
#drumModal .dm .dmbend .kcell{width:3rem}#drumModal .dm .dmbend .knob{width:1.9rem;height:1.9rem}
#drumModal .dm .dmeng{margin-bottom:.2rem}#drumModal .dm .dmmodels{margin-bottom:.2rem}#drumModal .dm .dmfm{padding:.1rem 0 .2rem;margin-bottom:.2rem}
#drumModal .dm .dmeqh{display:flex;align-items:center;gap:.35rem;margin-bottom:.1rem}#drumModal .dm .dmeqc{width:9rem;height:2.2rem;background:#0b0c0e;border-radius:.25rem;flex:1}
#drumModal .dm .dmeqk{display:grid;grid-template-columns:repeat(4,1fr);gap:0}#drumModal .dm .dmeqb{display:flex;flex-direction:column;align-items:center}
#drumModal .dm .dmeqb>i{font:600 .48rem system-ui;letter-spacing:.12em;color:#7d8189;font-style:normal}
#drumModal .dm .dmeqb .kcell{width:3.1rem}#drumModal .dm .dmeqb .knob{width:2rem;height:2rem}
#drumModal .dm .dmtape .dmknobs{justify-content:space-around}
#drumModal .dm .dmrat{margin:.15rem 0}#drumModal .dm .dmr1>.dmsec:nth-child(2){flex:1}#drumModal .dm .dmlforow>.dmlfo{flex:1;display:flex;flex-wrap:wrap;align-items:center;gap:.3rem}#drumModal .dm .dmlforow .dmlfoopts{margin-top:0}#drumModal .dm .dmcol>.dmgl{min-width:0}#drumModal .dm .dmgl{min-width:14rem}
@media (max-width:1050px){#drumModal .dm .dmbrand small{display:none}#drumModal .dm .dmr3{grid-template-columns:auto minmax(0,1fr) minmax(14rem,1fr)}#drumModal .dm .dmr3>.dmcol:last-child{grid-column:1/-1;flex-direction:row}#drumModal .dm .dmr3>.dmcol:last-child>.dmsec{flex:1}}
@media (max-width:760px){#drumModal .dm .dmr3{grid-template-columns:1fr}#drumModal .dm .dmr3>.dmcol:last-child{flex-direction:column}#drumModal .dm .dmpads{grid-template-columns:repeat(3,1fr)}#drumModal .dm .pad{aspect-ratio:2.2/1}
#drumModal .dm .dmtop{flex-wrap:wrap;row-gap:.25rem}#drumModal .dm .dmtop .sp{flex-basis:100%;height:0}#drumModal .dm .dmbrand small{display:none}#drumModal .dm .dmlforow>.dmlfo{min-width:100%}}`;
  document.head.appendChild(st);
})();
/** NEW (0.8): what the spectral Colour dial is doing — the manipulation and its own setting. */
function specColourName(c) {
  const z = Math.min(5, Math.floor(c * 6)), f = c * 6 - z, n = SPEC_ZONES[z].toUpperCase();
  if (z === 0) return `${n} ${Math.round(f * 100)}%`;
  if (z === 1) return `${n} ${f < .5 ? '↓' : '↑'}${Math.round(Math.abs(f * 2 - 1) * 100)}`;
  if (z === 2) { const hz = 48000 / 256 * (1.5 + f * 14); return `${n} ${hz >= 1000 ? (hz / 1000).toFixed(1) + 'k' : Math.round(hz)}`; }
  if (z === 3) return `${n} ${f < .45 ? 'DARK' : f > .55 ? 'BRIGHT' : 'FLAT'}`;
  if (z === 4) return `${n} ${Math.round(f * 100)}`;
  return `${n} ${(0.15 + f * 6).toFixed(1)}s`;
}
(function () { const st = document.createElement('style'); st.textContent = `#drumModal .dm .dmstepx{display:flex;gap:.4rem;margin-top:.2rem;flex-wrap:wrap}#drumModal .dm .dmxg{display:flex;gap:0;align-items:flex-end;border:1px solid #2a2d32;border-radius:.35rem;padding:.55rem .15rem .1rem;position:relative}
#drumModal .dm .dmxg>i{position:absolute;top:.1rem;left:.35rem;font:600 .46rem system-ui;letter-spacing:.14em;color:#7d8189;font-style:normal}
#drumModal .dm .dmvint{position:relative;border-top:1px solid #2a2d32;margin-top:.35rem;padding-top:.95rem;flex-wrap:wrap;align-items:flex-end;row-gap:.3rem}#drumModal .dm .dmvint select{max-width:5.6rem;font-size:.72rem}#drumModal .dm .dmvint .kcell.vsel{width:6rem;flex:none}#drumModal .dm .dmvint .kcell.vsel select{width:100%;max-width:none}#drumModal .dm .dmvint>.dmvlbl{position:absolute;top:.12rem;left:.1rem;font:600 .46rem system-ui;letter-spacing:.14em;color:#7d8189;font-style:normal}
#drumModal .dm .dmpads.dmpads12{grid-template-columns:repeat(4,3.6rem)}#drumModal .dm .dmpads.dmpads12 .pad{font-size:.75em}@media (max-width:760px){#drumModal .dm .dmpads.dmpads12{grid-template-columns:repeat(4,1fr)}}
.blrow>.dmvlbl{font:700 .55rem system-ui;letter-spacing:.14em;color:#9a9ea6;font-style:normal;align-self:center;margin-right:.3rem}`; document.head.appendChild(st); })();
