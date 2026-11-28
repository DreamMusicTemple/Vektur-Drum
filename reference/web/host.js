/* Vektur Drum — standalone host for the extracted drum machine (new code, not from Vektur VJ).
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
  A.ctx = new AC({ latencyHint: 'interactive' });
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
  const n = new AudioWorkletNode(A.ctx, 'vektur-drum', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
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
function serialize() {
  const lib = (S.drumSamples || []).map(x => ({ key: x.key, name: x.name, fmt: x.fmt }));
  return JSON.stringify({ app: 'vektur-drum', version: 1, bpm: S.bpm, drums: S.drums, drumSamples: lib });
}
function dirty() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(VD_KEY, serialize()); } catch (e) { } }, 400); }
/** Load + validate. Uses the preset cleaner for patterns, so all 8 step fields survive (see report: VJ load bug). */
function loadProject() {
  let o = null; try { o = JSON.parse(localStorage.getItem(VD_KEY) || 'null'); } catch (e) { }
  if (!o || o.app !== 'vektur-drum') return;
  S.bpm = clamp(+o.bpm || 120, 40, 240);
  S.drumSamples = Array.isArray(o.drumSamples) ? o.drumSamples.filter(f => f && typeof f.key === 'string').map(f => ({ key: f.key, name: String(f.name || 'Sample').slice(0, 40), fmt: f.fmt === 'flac' ? 'flac' : 'wav' })) : [];
  const d = o.drums; if (!d || typeof d !== 'object') return;
  const st = drumState();
  st.on = false;   // audio starts on the first tap (browser autoplay rules); PLAY turns the drums on
  st.p = presetCleanP('drums', d.p); if (d.p && d.p['dr.ch'] != null) st.p['dr.ch'] = clamp(Math.round(+d.p['dr.ch']), 0, 16);
  st.pats = [0, 1, 2, 3, 4, 5, 6, 7].map(i => presetCleanPattern(Array.isArray(d.pats) ? d.pats[i] : null));
  st.chain = (Array.isArray(d.chain) ? d.chain : []).slice(0, 16).map(c => clamp(Math.round(+c || 0), 0, 7));
  st.chainOn = !!d.chainOn; st.sel = clamp(Math.round(+d.sel || 0), 0, 7); st.preset = typeof d.preset === 'string' ? d.preset.slice(0, 60) : '';
  st.user = (Array.isArray(d.user) ? d.user : []).slice(0, PRESET_SLOTS).map(x => x ? presetClean('drums', x) : null);
  st.smp = [0, 1, 2, 3, 4, 5].map(i => Array.isArray(d.smp) && typeof d.smp[i] === 'string' && S.drumSamples.some(f => f.key === d.smp[i]) ? d.smp[i] : null);
}
const IDB = { db: null };
function idb() {
  if (IDB.db) return Promise.resolve(IDB.db);
  return new Promise((res, rej) => { const r = indexedDB.open('vekturdrum', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(IDB.db = r.result); r.onerror = () => rej(r.error); });
}
async function filePut(key, blob, name) { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction('files', 'readwrite'); t.objectStore('files').put({ blob, name }, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); return key; }
async function fileGet(key) { try { const db = await idb(); return await new Promise(res => { const q = db.transaction('files', 'readonly').objectStore('files').get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } }
function downloadText(text, name, type) {
  if (VD_FRAMED && navigator.clipboard) {   // the hosted preview refuses downloads: hand over the file's text instead
    navigator.clipboard.writeText(text).then(() => toast(name + ' copied — paste it into a .json file'), () => toast('Export is not available in this preview'));
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---- MIDI in (Vektur VJ routes its MIDI handler through drumsTakeMidi; so do we)
function midiInit() {
  if (!navigator.requestMIDIAccess) return;
  navigator.requestMIDIAccess().then(acc => {
    const hook = () => acc.inputs.forEach(i => { i.onmidimessage = e => { const [st, d1 = 0, d2 = 0] = e.data; drumsTakeMidi(st, d1, d2); }; });
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
document.addEventListener('visibilitychange', () => { if (!document.hidden && A.ctx) audioEnsure(); });
document.addEventListener('pointerdown', () => { if (A.ctx && A.ctx.state !== 'running') audioEnsure(); }, true);

// ---- boot: the panel is the app
function frame() { try { drumsTick(); } catch (e) { console.error(e); } requestAnimationFrame(frame); }
loadProject(); drumState();
openDrums();
document.addEventListener('pointerdown', () => { audioEnsure(); synthStart(); midiInit(); }, { once: true, capture: true });
requestAnimationFrame(frame);
