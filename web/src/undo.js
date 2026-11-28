/* ============================================================ Vektur Drum — NEW (0.9.1): UNDO / REDO (the top strip's ↶ ↷)
   Every change to the song (a dial, a step, a pattern, a kit, the Slicer, wires, slices…) ends in dirty(); half a second after
   the last one, the song is captured as a state snapshot (the same vektur-drum-state as a saved project, without sample
   bytes) and the one before goes on the undo stack. Undo / redo put a snapshot back without stopping the transport.
   Up to 60 steps. Keys: ⌘/Ctrl-Z, ⇧⌘/Ctrl-Shift-Z or Ctrl-Y. The BREAK LAB keeps its own undo for marker edits. */
const UNDO = { back: [], fwd: [], cur: null, t: 0, applying: false, max: 60 };
function undoSnap() { const o = stateBuild({ embed: false }); delete o.writer; return JSON.stringify(o); }
function undoNote() {   // called by dirty()
  if (UNDO.applying) return;
  clearTimeout(UNDO.t); UNDO.t = setTimeout(undoCapture, 450);
}
function undoCapture() {
  clearTimeout(UNDO.t); UNDO.t = 0;
  let s; try { s = undoSnap(); } catch (e) { return; }
  if (UNDO.cur == null) { UNDO.cur = s; return; }
  if (s === UNDO.cur) return;
  UNDO.back.push(UNDO.cur); if (UNDO.back.length > UNDO.max) UNDO.back.shift();
  UNDO.cur = s; UNDO.fwd = []; undoPaint();
}
function undoCan(d) { return d < 0 ? UNDO.back.length > 0 || !!UNDO.t : UNDO.fwd.length > 0; }
function undoStep(d) {
  if (UNDO.t) undoCapture();   // a change still settling counts as a step
  const from = d < 0 ? UNDO.back : UNDO.fwd, to = d < 0 ? UNDO.fwd : UNDO.back;
  if (!from.length) { toast(d < 0 ? 'Nothing to undo' : 'Nothing to redo'); return; }
  to.push(UNDO.cur); UNDO.cur = from.pop();
  UNDO.applying = true;
  try {
    const sel = drumState().sel, on = drumState().on;
    stateApply(JSON.parse(UNDO.cur)); drumState().on = on;
    drumPushAll(); drumSamplesPush(true);   // the transport keeps playing
    if (typeof drumsOpen === 'function' && drumsOpen()) renderDrums();
    if (typeof slicerOpen === 'function' && slicerOpen()) renderSlicer();
    if (typeof modOpen === 'function' && modOpen()) renderMod();
    if (typeof breakLabOpen === 'function' && breakLabOpen()) { blLoad().then(renderBreakLab); }
    if (drumState().sel !== sel) paintOled();
  } catch (e) { toast('Undo failed: ' + e.message); }
  setTimeout(() => { UNDO.applying = false; }, 0);
  dirtySave(); undoPaint();
  toast(d < 0 ? 'Undo' : 'Redo');
}
function undoPaint() { const e = DRM.els; if (!e) return; if (e.undo) e.undo.disabled = !undoCan(-1); if (e.redo) e.redo.disabled = !undoCan(1); }
function undoReset() { UNDO.back = []; UNDO.fwd = []; UNDO.cur = null; clearTimeout(UNDO.t); UNDO.t = 0; setTimeout(undoCapture, 0); }
window.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
  const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoStep(-1); }
  else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); undoStep(1); }
});
