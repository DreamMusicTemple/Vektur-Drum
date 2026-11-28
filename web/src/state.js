/* ============================================================ Vektur Drum — STATE (vektur-drum-state v1)
   One format for everything that saves a song: this web app's project files and autosave, the iPad/iPhone app's
   documents, and the AUv3's state inside GarageBand, Cubasis, AUM, Logic… (AUAudioUnit.fullState). Spec:
   docs/STATE.md. Rules: every value is written (so a song sounds the same after an update changes a default);
   parameters by key (stable across versions); reading never trusts the file (unknown keys ignored, everything
   clamped, missing → default); older files and Vektur VJ sets are read too. */
const STATE_FORMAT = 'vektur-drum-state', STATE_VERSION = 6;   // v6 (0.9): 12 tracks, steps up to 24 values (Metalise, slice, reverse / stutter chance), ring oscillator master 12 (was 9), per-pattern Slicer, per-track slices / transients / BPM · v5: master TEMPER (replaces Warmth: old value w → −w) and HUMANISE · v4: step pitch shift + spectral (values 16–20), reverb type, insert input parameters ·   // v2: slicer program, modulation wires, ring fields on steps (14 values) · v3: step fold (15th value), EQ and tape parameters; v1/v2 open
const MOD_SRC_IDS = ['lfo1', 'lfo2', 'lfo3', 'env', 'chaos'];

/** The current song as a vektur-drum-state object. embed: include the sample files (portable song). */
function stateBuild(opts = {}) {
  const d = drumState();
  const params = {}; DRUM_PARAMS.forEach(q => { params[q[0]] = drumVal(q[0]); });
  const patterns = d.pats.slice(0, 8).map(pt => Object.assign({ bars: pt.bars }, pt.sl === 0 || pt.sl === 1 ? { slicer: pt.sl } : {}, {
    tracks: pt.tr.slice(0, DRUM_TRACKS).map(tr => ({ len: tr.len, div: tr.div, steps: tr.s.slice(0, 16).map(s => s ? drumTrimStep(drumStepFull(s.slice(), DRUM_STEP_N)) : null) })) }));
  const sx = drumSx(), samples = drumSmp().slice(0, DRUM_TRACKS).map((k, t) => { const f = k && drumLib().find(x => x.key === k); return f ? Object.assign({ key: f.key, name: f.name }, drumSxOut(sx[t])) : null; });
  const ccMap = {}; for (const [path, m] of Object.entries(PREFS.ccMap)) if (path.startsWith('drums:')) ccMap[path.slice(6)] = { cc: m.cc, ch: m.ch || 0 };
  const o = { format: STATE_FORMAT, version: STATE_VERSION, writer: 'Vektur Drum ' + APP_VERSION,
    project: { tempo: S.bpm, trackCount: d.ntr, selected: d.sel, chain: d.chain.slice(0, 16), chainOn: !!d.chainOn, kit: d.preset || '', params, patterns, samples,
      slicer: drumSliceProg().map(s => s.slice()), wires: drumWires().map(w => ({ source: MOD_SRC_IDS[w.s], param: w.k, amount: Math.round(w.a * 1e4) / 1e4 })),
      lfoShapes: drumLfoPts().map(p => p.slice()) },   // NEW (0.9.1): the LFOs' drawn shapes (optional: missing = sines)
    midi: { ccMap } };
  if (opts.embed) { const keys = new Set(samples.filter(Boolean).map(s => s.key)); o.sampleData = drumLib().filter(f => keys.has(f.key) && f.data).map(f => ({ key: f.key, name: f.name, fmt: f.fmt, data: f.data })); }
  return o;
}

/** Puts a saved song into the app. Accepts vektur-drum-state, the earlier autosave format and Vektur VJ sets.
    Returns { warnings: [...] }; throws Error with a message for files that aren't songs at all. */
function stateApply(o, opts = {}) {
  const warnings = [];
  if (!o || typeof o !== 'object') throw new Error('That file is not a Vektur Drum project.');
  let pr;
  if (o.format === STATE_FORMAT) {
    if (+o.version > STATE_VERSION) warnings.push('Saved by a newer Vektur Drum: anything this version doesn\'t know is skipped.');
    pr = o.project && typeof o.project === 'object' ? o.project : {};
  } else if (o.app === 'vektur-drum' && o.drums) pr = legacyProject(o.drums, o.bpm);                    // autosave before v1
  else if (o.drums && typeof o.drums === 'object' && (o.drums.pats || o.drums.p)) { pr = legacyProject(o.drums, o.bpm); warnings.push('Opened the drums of a Vektur VJ set.'); }
  else if (o.format === 'vektur-pulse-presets') throw new Error('That is a kit file — open it in PRESETS → Import.');
  else throw new Error('That file is not a Vektur Drum project.');
  // sample files carried in the file → the library (bytes are stored in IndexedDB by drumSamplesSync)
  for (const f of Array.isArray(o.sampleData) ? o.sampleData : []) {
    if (!f || typeof f.key !== 'string' || typeof f.data !== 'string' || drumLib().some(x => x.key === f.key)) continue;
    drumLib().push({ key: f.key.slice(0, 24), name: String(f.name || 'Sample').slice(0, 40), fmt: f.fmt === 'flac' ? 'flac' : 'wav', data: f.data });
  }
  for (const f of (o.library && Array.isArray(o.library.samples)) ? o.library.samples : [])   // autosave: names; bytes are in IndexedDB
    if (f && typeof f.key === 'string' && !drumLib().some(x => x.key === f.key)) drumLib().push({ key: f.key.slice(0, 24), name: String(f.name || 'Sample').slice(0, 40), fmt: f.fmt === 'flac' ? 'flac' : 'wav' });
  const st = drumState();
  const num = (x, a, b, def) => Number.isFinite(+x) ? Math.min(b, Math.max(a, +x)) : def;
  const P = pr.params && typeof pr.params === 'object' ? pr.params : {};
  st.p = drumMigrateParams(presetCleanP('drums', P), Array.isArray(pr.samples) ? pr.samples.map(s => s && s.key) : null);
  if (P['dr.ch'] != null && Number.isFinite(+P['dr.ch'])) st.p['dr.ch'] = Math.round(num(P['dr.ch'], 0, 16, 10));
  S.bpm = Math.round(num(pr.tempo, 40, 240, 120) * 10) / 10;
  st.ntr = Math.round(num(pr.trackCount, 6, DRUM_TRACKS, DRUM_TRACKS));
  const pats = Array.isArray(pr.patterns) ? pr.patterns : [];
  const oldRing = !(+o.version >= 6);
  st.pats = [0, 1, 2, 3, 4, 5, 6, 7].map(i => presetCleanPattern(toLegacyPattern(pats[i]), oldRing));
  st.sx = Array.from({ length: DRUM_TRACKS }, (_, i) => drumSxClean(Array.isArray(pr.samples) ? pr.samples[i] : null));
  st.chain = (Array.isArray(pr.chain) ? pr.chain : []).slice(0, 16).map(c => Math.round(num(c, 0, 7, 0)));
  st.chainOn = !!pr.chainOn; st.sel = Math.round(num(pr.selected, 0, 7, 0));
  st.preset = typeof pr.kit === 'string' ? pr.kit.slice(0, 60) : '';
  st.slice = drumSliceClean(pr.slicer);   // v1: a clear program
  st.lfo = drumLfoClean(pr.lfoShapes);
  st.wires = drumWiresClean((Array.isArray(pr.wires) ? pr.wires : []).map(w => w && ({ s: MOD_SRC_IDS.indexOf(w.source), k: w.param, a: w.amount })).filter(w => w && w.s >= 0));
  st.smp = Array.from({ length: DRUM_TRACKS }, (_, i) => {
    const s = Array.isArray(pr.samples) ? pr.samples[i] : null; if (!s || typeof s.key !== 'string') return null;
    if (drumLib().some(f => f.key === s.key)) return s.key;
    warnings.push(`Track ${i + 1}: the sample “${String(s.name || s.key).slice(0, 40)}” is not on this device (save with samples included to carry it).`);
    return null;
  });
  if (opts.library && Array.isArray(opts.library.userKits)) st.user = opts.library.userKits.slice(0, PRESET_SLOTS).map(x => x ? presetClean('drums', x) : null);
  const cc = o.midi && o.midi.ccMap && typeof o.midi.ccMap === 'object' ? o.midi.ccMap : null;
  if (cc && opts.midi !== false) {
    const m = {}; for (let [k, v] of Object.entries(cc)) { if (k === 'dr.warmth') k = 'dr.temper'; if (DP_ID[k] != null && v && Number.isInteger(+v.cc) && +v.cc >= 0 && +v.cc < 128) m['drums:' + k] = { cc: +v.cc, ch: Math.round(num(v.ch, 0, 16, 0)) }; }
    PREFS.ccMap = m; SET.ccIndex = null; prefsSave();
  }
  DSMP.sent = '';
  return { warnings };
}
function toLegacyPattern(pt) {   // v1 {bars, tracks:[{len, div, steps}]} → the app's {bars, tr:[{len, div, s}]} (then cleaned)
  if (!pt || typeof pt !== 'object') return null;
  if (Array.isArray(pt.tr)) return pt;
  return { bars: pt.bars, sl: pt.slicer, tr: (Array.isArray(pt.tracks) ? pt.tracks : []).map(tr => tr && typeof tr === 'object' ? { len: tr.len, div: tr.div, s: tr.steps } : null) };
}
function legacyProject(d, bpm) {
  return { tempo: bpm, trackCount: d.ntr || 6, selected: d.sel, chain: d.chain, chainOn: d.chainOn, kit: d.preset, params: d.p || {}, patterns: d.pats,
    samples: Array.isArray(d.smp) ? d.smp.map(k => typeof k === 'string' ? { key: k, name: k } : null) : [] };
}
/** After a song is applied: the engine, the panel, the sample bytes. */
function stateAfterApply() {
  drumPushAll(); if (SYN.node) drumPost(['z', 0]);
  if (drumsOpen()) renderDrums();
  dirty();
}

// ---- project files (Settings → PROJECT)
const PROJ = { embed: true };
function projectSave() {
  const o = stateBuild({ embed: PROJ.embed }), text = JSON.stringify(o);
  const name = (drumState().preset || 'Vektur Drum project').replace(/[^\w-]+/g, '_') + '.vdrum.json';
  downloadText(text, name, 'application/json');
}
function projectOpen() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,.vdrum,application/json';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try {
      const r = stateApply(JSON.parse(await f.text()));
      stateAfterApply(); renderSettings();
      toast(r.warnings.length ? r.warnings[0] : 'Project opened');
      if (r.warnings.length > 1) console.warn(r.warnings);
    } catch (e) { toast(e instanceof SyntaxError ? 'That file is not a Vektur Drum project.' : e.message); }
  };
  inp.click();
}
function setProject(b) {
  const s = sec('PROJECT'); b.appendChild(s);
  const box = el('div', 'setchoice');
  box.appendChild(hbtn('SAVE PROJECT…', 'sm', projectSave)); box.appendChild(hbtn('OPEN PROJECT…', 'sm', projectOpen));
  { const eb = el('div', 'setchoice'); eb.appendChild(hbtn('EXPORT AUDIO…', 'sm', () => openExport()));
    setRow(s, 'Export audio', 'The master or stems as WAV, FLAC or MP3 — the whole chain when CHAIN is on, otherwise the selected pattern.', eb); }
  setRow(s, 'Project file', 'Everything about this song in one file: all sound settings, the 8 patterns, chain, track count, tempo, samples and your MIDI CC map. The same format the App Store app and the plug-in save inside GarageBand, Cubasis, AUM and Logic.', box);
  setRow(s, 'Include samples', 'Puts the track samples inside the file, so the song opens complete on any device. Off: smaller file; samples must already be on the device that opens it.',
    setToggle(PROJ.embed, () => { PROJ.embed = !PROJ.embed; renderSettings(); }, 'Include samples'));
  const o = stateBuild({ embed: PROJ.embed }), size = JSON.stringify(o).length;
  const used = o.project.samples.filter(Boolean).length;
  s.appendChild(el('div', 'oled setoled', `Format ${STATE_FORMAT} v${STATE_VERSION} · ${(size / 1024).toFixed(size < 102400 ? 1 : 0)} KB · ${used} sample${used === 1 ? '' : 's'}${PROJ.embed && used ? ' included' : ''}\nAutosave: on (this browser) · kit: ${drumState().preset || '—'}`));
}
