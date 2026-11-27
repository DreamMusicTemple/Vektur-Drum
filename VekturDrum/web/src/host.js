/* Vektur Drum — web host: audio, clock, project save, MIDI in, iPad behaviour.
   Replaces exactly the Vektur VJ services the drum code calls, and nothing more:
     audio context + worklet (audioEnsure, synthStart, synthMidi, SYN)   · project state + autosave (S, dirty)
     sample byte store (filePut, fileGet → IndexedDB)                     · file download (downloadText)
     tempo (S.bpm + the TEMPO knob)                                       · Web MIDI input → drumsTakeMidi
     the per-frame UI tick (drumsTick)                                    · knob hooks Vektur VJ uses for MIDI learn
   Musical timing never runs here: the sequencer clock is inside the AudioWorklet. This file only paints LEDs. */

const VD_KEY = 'vekturdrum.project.v1';
const S = { bpm: 120, drums: null, drumSamples: [] };
const A = { ctx: null };
const SYN = { node: null, loading: null, dtel: null, dead: false };
const SPECTRA_NAME = 'Vektur Spectra';   // only named in a preset-import error message ("that file holds synth presets")
const macroCatch = () => false;
let VD_FRAMED = false; try { VD_FRAMED = window.self !== window.top; } catch (e) { VD_FRAMED = true; }
if (VD_FRAMED) {   // the hosted preview's sandbox refuses dialogs: save under the suggested name, confirm replacing
  window.prompt = (msg, def) => def != null ? String(def) : '';
  window.confirm = () => true;
}          // Vektur VJ macros / MIDI learn are not part of Vektur Drum (see the report)

// ---- audio
function audioEnsure() {
  if (A.ctx) { if (A.ctx.state !== 'running' && A.ctx.state !== 'closed') A.ctx.resume().catch(() => { }); return; }   // iOS: 'suspended' or 'interrupted'
  // Safari 16.4+: play like a music app — not silenced by the ring/silent switch
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try { A.ctx = new AC(audioContextOptions()); }   // Settings → sample rate and latency
  catch (e) { A.ctx = new AC({ latencyHint: PREFS.latency }); toast('That sample rate is not available here: using the device rate'); }
}
function drumProcessorSource() {
  return `const DRUM_PARAMS=${JSON.stringify(DRUM_PARAMS)}, DRUM_DIV_BEATS=${JSON.stringify(DRUM_DIV_BEATS)}, DRUM_NOTES=${JSON.stringify(DRUM_NOTES)}, DRUM_DEF_DIV=${DRUM_DEF_DIV};
${drumsMakeEngine.toString()}
${$('#vd-worklet').textContent}`;
}
function hostOnMessage(data) { SYN.dtel = data.dtel; if (data.drec) drumApplyRecorded(data.drec); }
/** AudioWorklet (audio thread). Throws if the browser or the page's security policy doesn't allow it. */
async function startWorklet() {
  if (!A.ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('no AudioWorklet');
  const src = drumProcessorSource();
  const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
  try { await A.ctx.audioWorklet.addModule(url); }
  catch (e) { await A.ctx.audioWorklet.addModule('data:application/javascript;charset=utf-8,' + encodeURIComponent(src)); }
  finally { URL.revokeObjectURL(url); }
  const n = new AudioWorkletNode(A.ctx, 'vektur-drum', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });   // NEW (0.8): one input — the insert source
  n.onprocessorerror = () => { SYN.dead = true; toast('Audio engine stopped'); };
  n.port.onmessage = e => hostOnMessage(e.data);
  SYN.mode = 'worklet';
  return n;
}
/** Fallback: the same processor class on a ScriptProcessorNode (main thread). Timing is still sample-accurate —
    the sequencer counts samples inside the callback — but a busy UI can cause dropouts. Test builds only. */
function startScriptProcessor() {
  sampleRate = A.ctx.sampleRate;
  const proc = new VD_PROCESSOR(), sp = A.ctx.createScriptProcessor(512, 0, 2);
  proc.port.toHost = hostOnMessage;
  sp.onaudioprocess = e => { const ob = e.outputBuffer; proc.process([], [[ob.getChannelData(0), ob.getChannelData(1)]]); };
  SYN.mode = 'script';
  return { port: { postMessage: m => proc.port.onmessage && proc.port.onmessage({ data: m }) }, connect: d => sp.connect(d) };
}
/** Same contract as Vektur VJ's synthStart(): resolves true once the engine node exists. */
async function synthStart() {
  audioEnsure(); if (!A.ctx) { toast('This browser has no Web Audio'); return false; }
  if (SYN.node) return true;
  if (!SYN.loading) SYN.loading = (async () => {
    let n;
    try { n = await startWorklet(); }
    catch (e) { console.warn('AudioWorklet unavailable, using ScriptProcessor fallback:', e); n = startScriptProcessor(); }
    n.connect(A.ctx.destination);
    SYN.node = n; n.port.postMessage({ tempo: S.bpm }); drumPushAll();
  })().catch(err => { SYN.loading = null; console.error(err); toast('The audio engine could not start'); });
  await SYN.loading; return !!SYN.node;
}
function synthMidi(st, d1, d2) { if (SYN.node) SYN.node.port.postMessage({ m: [st, d1, d2] }); }

// ---- tempo (Vektur VJ: the set's clock; here: our own)
function setBpm(v) { S.bpm = Math.round(clamp(+v || 120, 40, 240) * 10) / 10; if (SYN.node) SYN.node.port.postMessage({ tempo: S.bpm }); paintOled(); dirty(); }
function hostTempoKnob(host) {
  slider(host, { knob: true, label: 'Tempo', min: 40, max: 240, def: 120, step: .5, get: () => S.bpm, set: setBpm, fmt: v => v.toFixed(1) });
}

// ---- project: autosave to localStorage; sample bytes in IndexedDB (as in Vektur VJ)
let saveTimer = 0;
function serialize() {   // autosave: the song (vektur-drum-state, sample bytes stay in IndexedDB) + this device's library
  const o = stateBuild({ embed: false });
  o.library = { userKits: drumState().user || [], samples: drumLib().map(f => ({ key: f.key, name: f.name, fmt: f.fmt })) };
  return JSON.stringify(o);
}
function dirtySave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(VD_KEY, serialize()); } catch (e) { } }, 400); }
function dirty() { dirtySave(); if (typeof undoNote === 'function') undoNote(); }   // 0.9.1: and a step for UNDO
/** Autosave → the app (also reads the earlier autosave format). */
function loadProject() {
  let o = null; try { o = JSON.parse(localStorage.getItem(VD_KEY) || 'null'); } catch (e) { }
  if (!o) return;
  try {
    const lib = o.library || (o.drums ? { userKits: o.drums.user, samples: o.drumSamples } : null);
    if (lib && Array.isArray(lib.samples)) o.library = { userKits: lib.userKits, samples: lib.samples };
    stateApply(o, { library: o.library, midi: false });   // the device's CC map is already in PREFS
  } catch (e) { console.warn('autosave not loaded:', e.message); }
  drumState().on = false;   // audio starts on the first tap (browser autoplay rules); PLAY turns the drums on
}
const IDB = { db: null };
function idb() {
  if (IDB.db) return Promise.resolve(IDB.db);
  return new Promise((res, rej) => { const r = indexedDB.open('vekturdrum', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(IDB.db = r.result); r.onerror = () => rej(r.error); });
}
async function filePut(key, blob, name) { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction('files', 'readwrite'); t.objectStore('files').put({ blob, name }, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); return key; }
async function fileGet(key) { try { const db = await idb(); return await new Promise(res => { const q = db.transaction('files', 'readonly').objectStore('files').get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } }
/** NEW (0.8): hands a file to the user. Inside the Claude artifact viewer this goes through its downloads capability
    (which allows a fixed list of extensions: audio files travel inside a .zip there); elsewhere a normal download. */
const VD_DL_OK = ['json', 'zip', 'txt', 'csv', 'md'];
async function vdSaveFile(name, bytes) {
  let dl = null;
  if (VD_FRAMED && window.claude && typeof window.claude.use === 'function') { try { dl = await window.claude.use('downloads'); } catch (e) { dl = null; } }
  if (dl) {
    const ext = name.split('.').pop().toLowerCase();
    if (!VD_DL_OK.includes(ext)) { bytes = VDENC.zip([{ name, data: bytes }]); name = name.replace(/\.[^.]+$/, '') + '.zip'; }
    try { await dl.save({ filename: name, data: new Blob([bytes]) }); return 'saved'; }
    catch (e) { if (e && e.code === 'declined') return 'declined'; toast('Saving is not available here (' + (e && e.code || 'error') + ')'); return 'failed'; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes])); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return 'saved';
}
async function downloadText(text, name, type) {
  if (VD_FRAMED && window.claude && typeof window.claude.use === 'function') { const r = await vdSaveFile(name, new TextEncoder().encode(text)); if (r !== 'failed') return; }
  if (VD_FRAMED && navigator.clipboard) {   // the hosted preview refuses downloads: hand over the file's text instead
    navigator.clipboard.writeText(text).then(() => toast(name + ' copied — paste it into a .json file'), () => toast('Export is not available in this preview'));
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---- MIDI in (Vektur VJ routes its MIDI handler through drumsTakeMidi; so do we)
let midiAccess = null;
function midiInit() {
  if (!PREFS.midiIn || !navigator.requestMIDIAccess || midiAccess) return;
  navigator.requestMIDIAccess().then(acc => {
    midiAccess = acc;
    const hook = () => { acc.inputs.forEach(i => { i.onmidimessage = e => { const [st, d1 = 0, d2 = 0] = e.data; vdMidi(st, d1, d2); }; }); midiPortsUpdate(acc); };
    hook(); acc.onstatechange = hook;
  }).catch(() => { });
}

// ---- iPad / touch: size the panel to the screen (touch targets ≈ 40 pt on iPad), keep gestures for the instrument
function fitScale() {
  const touch = matchMedia('(pointer: coarse)').matches, w = document.documentElement.clientWidth;
  const s = touch && w >= 700 ? Math.min(1.35, Math.max(1, w / 1060)) : 1;
  document.documentElement.style.setProperty('--scale', s.toFixed(3));
}
fitScale(); addEventListener('resize', fitScale); addEventListener('orientationchange', fitScale);
['gesturestart', 'gesturechange'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('pointerdown', () => { if (A.ctx && A.ctx.state !== 'running') audioEnsure(); }, true);

// ---- boot: the panel is the app
let frameN = 0;
function frame(now) {
  try {
    if (!PREFS.battery || (++frameN & 3) === 0) drumsTick();   // battery saving: lights at a quarter of the frame rate
    if (SET.ccDirty) { SET.ccDirty = false; if (drumsOpen()) renderDrums(); }   // knobs moved by MIDI CC
    batteryTick(now || performance.now());
  } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
loadProject(); drumState();
openDrums(); undoReset();   // 0.9.1: the opened song is where undo starts
document.addEventListener('pointerdown', () => { audioEnsure(); synthStart(); midiInit(); }, { once: true, capture: true });
wakeLockApply(); mediaSessionApply();
requestAnimationFrame(frame);

