/* ============================================================ VEKTUR DRUM 0.9 — BREAK LAB (the sample editor)
   One window per track's sample: the waveform (zoom, scroll), transient markers (found automatically from
   amplitude, onset energy and spectral flux; add, move, delete, accept or reject them — re-detect keeps the ones you
   placed), the slices made from them or from a grid (equal, beat, bar, 1/4 … 1/32, triplets — beat-aware once the
   tempo is known), each slice's own pitch, gain, pan, attack, gate, reverse, stretch, stutter and Metalise.
   Slices go to steps (a step can play any slice), to pads (and REC records them), to other tracks (one slice each,
   or kick / snare / hat / ghost lanes), and through the groove generator: 16 variations at a time, with the kick
   locked, the snares randomised and only the ghosts mutated if you like, with chance-based reverse and stutter.
   RESAMPLE renders the track as it sounds now into a new sample (offline — no feedback), ready to slice again.
   EXPORT MIDI writes the pattern (or the chain) as a standard MIDI file. Undo / redo cover every marker and slice edit. */
const BL = { t: 0, zoom: 1, off: 0, sel: 0, mk: -1, undo: [], redo: [], bank: [], vsel: -1, ext: .45, lockK: true, randS: true, mutG: true, revP: 0, stutP: 0, split: false, append: false, gen: 1, play: null, cv: null, m: null };
const BL_COL = ['#ff6a3d', '#ffd23d', '#3dd6ff', '#a98bff', '#9aa0a8'];
function blModal() { let m = $('#blModal'); if (!m) { m = el('div', 'modal'); m.id = 'blModal'; m.appendChild(el('div', 'sheet blsheet')); m.onclick = e => { if (e.target === m) closeBreakLab(); }; document.body.appendChild(m); } return m; }
function breakLabOpen() { const m = $('#blModal'); return !!(m && m.classList.contains('open')); }
async function openBreakLab(t) { BL.t = clamp(t | 0, 0, DRUM_TRACKS - 1); BL.undo = []; BL.redo = []; BL.zoom = 1; BL.off = 0; BL.sel = 0; BL.mk = -1; const m = blModal(); document.body.appendChild(m); m.classList.add('open'); await blLoad(); renderBreakLab(); }
function closeBreakLab() { const m = $('#blModal'); if (m) m.classList.remove('open'); BL.play = null; if (drumsOpen()) renderDrums(); }
async function blLoad() { const k = drumSmp()[BL.t], f = k && drumLib().find(x => x.key === k); BL.m = f ? await dsmpMono(f) : null; }
const blSx = () => drumSx()[BL.t];
function blSnap() { BL.undo.push(JSON.stringify(blSx())); if (BL.undo.length > 60) BL.undo.shift(); BL.redo = []; }
function blRestore(from, to) { if (!from.length) return; to.push(JSON.stringify(blSx())); drumSx()[BL.t] = drumSxClean(JSON.parse(from.pop())); blCommit(); }
let blPushT = 0;
function blCommit(noRender) { dirty(); clearTimeout(blPushT); blPushT = setTimeout(() => drumSamplesPush(), 120); if (!noRender) renderBreakLab(); else blDraw(); }
function blTrackHasSample(t) { return !!drumSmp()[t]; }

function renderBreakLab() {
  const sh = blModal().querySelector('.sheet'); sh.innerHTML = '';
  const sx = blSx(), m = BL.m, t = BL.t;
  const h = el('h2'); h.appendChild(el('span', null, 'BREAK LAB')); h.appendChild(el('span', 'blsub', `TRACK ${t + 1} · ${drumSampleName(t) || 'no sample'}`)); h.appendChild(el('span', 'spacer'));
  const x = el('button', 'cbtn', 'Close'); x.onclick = closeBreakLab; h.appendChild(x); sh.appendChild(h);
  // track chips: drop a slice pad on one to give that track the slice
  const tr = el('div', 'bltracks'); tr.appendChild(el('b', 'dmrowlbl', 'TRACK'));
  for (let i = 0; i < drumNtr(); i++) { const b = hbtn(String(i + 1), 'sm' + (i === t ? ' on' : '') + (blTrackHasSample(i) ? ' has' : ''), async () => { BL.t = i; BL.undo = []; BL.redo = []; BL.zoom = 1; BL.off = 0; BL.sel = 0; await blLoad(); renderBreakLab(); }, true);
    b.title = drumTrackName(i) + ' — drop a slice pad here to send that slice'; b.dataset.trk = i; tr.appendChild(b); }
  tr.appendChild(el('i', 'dmsep'));
  tr.appendChild(hbtn(m ? 'REPLACE SAMPLE…' : 'LOAD SAMPLE…', 'sm', () => { blPickSample(); }));
  sh.appendChild(tr);
  if (!m) { sh.appendChild(el('div', 'clhelp', 'Load a break or any WAV / FLAC on this track. Its transients are found straight away; then slice it, play slices from steps and pads, and generate variations.')); return; }
  // ---- detection and slicing
  const r1 = el('div', 'dmknobs blrow');
  slider(r1, { knob: true, label: 'Sens', min: 0, max: 1, def: .5, get: () => sx.sens, set: v => { sx.sens = v; }, fmt: v => Math.round(v * 100) + '%' });
  slider(r1, { knob: true, label: 'Threshold', min: 5, max: 400, def: 50, get: () => sx.gap, set: v => { sx.gap = Math.round(v); }, fmt: v => Math.round(v) + ' ms' });
  r1.lastChild.title = 'Minimum spacing between transients';
  const det = hbtn('DETECT', 'sm cy', () => { blSnap(); sxRedetect(sx, m); if (sx.mode === 0) sxMakeSlices(sx, m); blCommit(); toast(sx.marks.length + ' transients'); }); det.title = 'Find transients again (your own marks stay)'; r1.appendChild(det);
  const bpmc = el('div', 'kcell'); bpmc.appendChild(el('span', 'klbl', 'BPM')); const bi = el('input'); bi.type = 'number'; bi.min = 0; bi.max = 400; bi.step = .01; bi.value = sx.bpm || ''; bi.placeholder = '—'; bi.className = 'blnum';
  bi.onchange = () => { blSnap(); sx.bpm = clamp(+bi.value || 0, 0, 400); blCommit(); }; const bo = el('div', 'oled'); bo.style.cssText = 'min-width:0;padding:.1rem'; bo.appendChild(bi); bpmc.appendChild(bo); r1.appendChild(bpmc);
  r1.appendChild(hbtn('FIND BPM', 'sm', () => { blSnap(); sx.bpm = sxBpm(m.d, m.rate, S.bpm); blCommit(); toast(sx.bpm ? sx.bpm + ' BPM' : 'No clear tempo'); }));
  const ms = el('div', 'kcell'); ms.appendChild(el('span', 'klbl', 'Slice by')); const msel = el('select'); SX_MODES.forEach((n, i) => { const o = new Option(n, i); if (i === sx.mode) o.selected = true; msel.appendChild(o); });
  msel.onchange = () => { blSnap(); sx.mode = +msel.value; sxMakeSlices(sx, m); BL.sel = 0; blCommit(); }; const mo = el('div', 'oled'); mo.style.cssText = 'min-width:0;padding:.1rem'; mo.appendChild(msel); ms.appendChild(mo); r1.appendChild(ms);
  if (sx.mode === 1 || (sx.mode >= 2 && !sx.bpm)) { const dc = el('div', 'kcell'); dc.appendChild(el('span', 'klbl', 'Slices')); const ds = el('select'); [2, 4, 8, 12, 16, 24, 32].forEach(n => { const o = new Option(String(n), n); if (n === sx.div) o.selected = true; ds.appendChild(o); });
    ds.onchange = () => { blSnap(); sx.div = +ds.value; sxMakeSlices(sx, m); blCommit(); }; const dol = el('div', 'oled'); dol.style.cssText = 'min-width:0;padding:.1rem'; dol.appendChild(ds); dc.appendChild(dol); r1.appendChild(dc); }
  if (sx.mode === 4) { const gc = el('div', 'kcell'); gc.appendChild(el('span', 'klbl', 'Grid')); const gs = el('select'); SX_GRIDS.forEach((g, i) => { const o = new Option(g[0], i); if (i === sx.grid) o.selected = true; gs.appendChild(o); });
    gs.onchange = () => { blSnap(); sx.grid = +gs.value; sxMakeSlices(sx, m); blCommit(); }; const go = el('div', 'oled'); go.style.cssText = 'min-width:0;padding:.1rem'; go.appendChild(gs); gc.appendChild(go); r1.appendChild(gc); }
  r1.appendChild(hbtn('SLICE', 'sm cy', () => { blSnap(); sxMakeSlices(sx, m); BL.sel = 0; blCommit(); toast(sx.slices.length + ' slices'); }));
  r1.appendChild(el('i', 'dmsep'));
  const ub = hbtn('UNDO', 'sm', () => blRestore(BL.undo, BL.redo)); ub.disabled = !BL.undo.length; r1.appendChild(ub);
  const rb = hbtn('REDO', 'sm', () => blRestore(BL.redo, BL.undo)); rb.disabled = !BL.redo.length; r1.appendChild(rb);
  sh.appendChild(r1);
  // ---- waveform
  const wv = el('div', 'blwave'); const cv = el('canvas'); cv.setAttribute('aria-label', 'Waveform with transient markers and slices'); wv.appendChild(cv); BL.cv = cv; sh.appendChild(wv);
  const zr = el('div', 'dmchain blzoom');
  zr.appendChild(hbtn('−', 'sm', () => { BL.zoom = Math.max(1, BL.zoom / 2); blClampView(); blDraw(); })); zr.appendChild(hbtn('+', 'sm', () => { BL.zoom = Math.min(256, BL.zoom * 2); blClampView(); blDraw(); }));
  zr.appendChild(hbtn('FIT', 'sm', () => { BL.zoom = 1; BL.off = 0; blDraw(); }));
  const sc = el('input'); sc.type = 'range'; sc.min = 0; sc.max = 1000; sc.value = 0; sc.className = 'blscroll'; sc.setAttribute('aria-label', 'Scroll the waveform'); sc.oninput = () => { const n = m.d.length, w = n / BL.zoom; BL.off = Math.round((+sc.value / 1000) * (n - w)); blDraw(); }; BL.scroll = sc; zr.appendChild(sc);
  zr.appendChild(el('i', 'dmsep'));
  zr.appendChild(hbtn('+ MARK', 'sm', () => { const s = sx.slices[BL.sel]; const p = s ? Math.round((s.s + s.e) / 2) : Math.round(BL.off + m.d.length / BL.zoom / 2); blAddMark(p); }));
  const dm = hbtn('DELETE', 'sm', () => { if (BL.mk < 0) return; blSnap(); sx.marks.splice(BL.mk, 1); BL.mk = -1; if (sx.mode === 0) sxMakeSlices(sx, m); blCommit(); }); dm.disabled = BL.mk < 0; zr.appendChild(dm);
  const mk = sx.marks[BL.mk];
  const ac = hbtn(mk && !mk.on ? 'ACCEPT' : 'REJECT', 'sm', () => { if (!mk) return; blSnap(); mk.on = mk.on ? 0 : 1; if (sx.mode === 0) sxMakeSlices(sx, m); blCommit(); }); ac.disabled = !mk; zr.appendChild(ac);
  zr.appendChild(hbtn('ACCEPT ALL', 'sm', () => { blSnap(); sx.marks.forEach(k => { k.on = 1; }); if (sx.mode === 0) sxMakeSlices(sx, m); blCommit(); }));
  if (mk) { const cs = el('select'); SX_CLASSES.forEach((n, i) => { const o = new Option(n, i); if (i === mk.c) o.selected = true; cs.appendChild(o); }); cs.setAttribute('aria-label', 'Hit type');
    cs.onchange = () => { blSnap(); mk.c = +cs.value; const s = sx.slices.find(v => Math.abs(v.s - mk.p) < m.rate * .01); if (s) s.c = mk.c; blCommit(); }; const co = el('div', 'oled'); co.style.cssText = 'min-width:0;padding:.1rem'; co.appendChild(cs); zr.appendChild(co); }
  sh.appendChild(zr);
  blWaveEvents(cv);
  // ---- the selected slice
  const s = sx.slices[BL.sel];
  const se = el('div', 'dmknobs blrow'); se.appendChild(el('i', 'dmvlbl', s ? 'SLICE ' + (BL.sel + 1) : 'SLICE'));
  if (s) {
    const set = (k, v) => { s[k] = v; blCommit(true); };
    slider(se, { knob: true, label: 'Pitch', min: -24, max: 24, def: 0, step: 1, bipolar: true, get: () => s.p, set: v => set('p', Math.round(v)), fmt: v => (v > 0 ? '+' : '') + Math.round(v) + ' st' });
    slider(se, { knob: true, label: 'Gain', min: 0, max: 2, def: 1, get: () => s.g, set: v => set('g', v), fmt: v => v <= 0 ? '−∞' : (20 * Math.log10(v)).toFixed(1) + ' dB' });
    slider(se, { knob: true, label: 'Pan', min: -1, max: 1, def: 0, bipolar: true, get: () => s.pan, set: v => set('pan', Math.abs(v) < .03 ? 0 : v), fmt: v => Math.abs(v) < .03 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100) });
    slider(se, { knob: true, label: 'Attack', min: 0, max: 50, def: 0, get: () => s.a, set: v => set('a', Math.round(v * 2) / 2), fmt: v => v <= 0 ? 'HARD' : v.toFixed(1) + ' ms' });
    slider(se, { knob: true, label: 'Gate', min: .02, max: 1, def: 1, get: () => s.gate, set: v => set('gate', v), fmt: v => v >= .995 ? 'FULL' : Math.round(v * 100) + '%' });
    slider(se, { knob: true, label: 'Stretch', min: .25, max: 4, def: 1, get: () => s.st, set: v => set('st', Math.round(v * 100) / 100), fmt: v => v.toFixed(2) + '×' });
    slider(se, { knob: true, label: 'Stutter', min: 0, max: 8, def: 0, step: 1, get: () => s.stut, set: v => set('stut', Math.round(v)), fmt: v => Math.round(v) ? '×' + Math.round(v) : 'OFF' });
    const sdl = [[1 / 32, '1/128'], [1 / 16, '1/64'], [.125, '1/32'], [.25, '1/16'], [.5, '1/8'], [1, '1/4']];
    slider(se, { knob: true, label: 'Stut len', min: 0, max: sdl.length - 1, def: 2, step: 1, get: () => Math.max(0, sdl.findIndex(q => Math.abs(q[0] - s.sd) < 1e-6)), set: v => set('sd', sdl[Math.round(v)][0]), fmt: v => sdl[Math.round(v)][1] });
    slider(se, { knob: true, label: 'Metalise', min: -0.02, max: 1, def: -0.02, get: () => Math.max(-0.02, s.m), set: v => set('m', v < .005 ? -1 : v), fmt: v => v < .005 ? 'TRACK' : Math.round(v * 100) + '%' });
    se.appendChild(hbtn('REVERSE', 'sm cy' + (s.r ? ' on' : ''), () => { blSnap(); s.r = s.r ? 0 : 1; blCommit(); }, true));
    const cs = el('select'); SX_CLASSES.forEach((n, i) => { const o = new Option(n, i); if (i === s.c) o.selected = true; cs.appendChild(o); }); cs.setAttribute('aria-label', 'Slice type'); cs.onchange = () => { blSnap(); s.c = +cs.value; blCommit(); };
    const co = el('div', 'oled'); co.style.cssText = 'min-width:0;padding:.1rem'; co.appendChild(cs); se.appendChild(co);
    se.appendChild(hbtn('▶ AUDITION', 'sm', () => blAudition(BL.sel)));
  } else se.appendChild(el('span', 'dmnote', 'No slices yet — DETECT, then SLICE (or pick Equal / Beat / Bar / Grid).'));
  sh.appendChild(se);
  // ---- slice pads
  const pads = el('div', 'blpads');
  sx.slices.forEach((v, i) => {
    const p = el('div', 'blpad' + (i === BL.sel ? ' sel' : '')); p.style.setProperty('--c', BL_COL[v.c]); p.append(el('b', null, String(i + 1)), el('span', null, SX_CLASSES[v.c] + (v.r ? ' ◀' : '') + (v.stut ? ' ×' + v.stut : '')));
    p.setAttribute('role', 'button'); p.tabIndex = 0; p.draggable = true; p.setAttribute('aria-label', `Slice ${i + 1}, ${SX_CLASSES[v.c]}`);
    p.addEventListener('pointerdown', e => { if (e.button) return; audioEnsure(); BL.sel = i; blHitSlice(i, 50 + 77 * clamp(1 - (e.offsetY / p.offsetHeight), 0, 1)); pads.querySelectorAll('.blpad').forEach((q, j) => q.classList.toggle('sel', j === i)); blDraw(); });
    p.addEventListener('dblclick', () => renderBreakLab());
    p.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { blHitSlice(i, 100); e.preventDefault(); } });
    p.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', 'slice:' + i); });
    pads.appendChild(p);
  });
  tr.querySelectorAll('button[data-trk]').forEach(b => { b.addEventListener('dragover', e => e.preventDefault()); b.addEventListener('drop', e => { e.preventDefault(); const d = e.dataTransfer.getData('text/plain'); if (d.startsWith('slice:')) blSendSlices([+d.slice(6)], +b.dataset.trk); }); });
  if (sx.slices.length) { const ph = el('div', 'blpadhd'); ph.appendChild(el('b', null, 'SLICE PADS')); ph.appendChild(el('span', 'dmnote', 'Tap to play (higher = harder); with REC lit and the pattern playing, slices are recorded into the steps. Drag a pad onto a track number to send that slice.')); sh.appendChild(ph); sh.appendChild(pads); }
  // ---- send slices
  if (sx.slices.length) {
    const mp = el('div', 'dmchain blrow'); mp.appendChild(el('b', 'dmrowlbl', 'SEND'));
    mp.appendChild(hbtn('TO STEPS', 'sm', () => { blSlicesToLane(); }));
    mp.lastChild.title = 'Lay the slices out on this track\'s steps, one per step in order (the pattern selected now)';
    mp.appendChild(hbtn('ACROSS TRACKS', 'sm', () => { const n = Math.min(sx.slices.length, drumNtr()); blSendSlices(Array.from({ length: n }, (_, i) => i), BL.append ? -1 : BL.t); }));
    mp.lastChild.title = 'One slice per track, from this track on (or only into empty tracks with APPEND)';
    mp.appendChild(hbtn('SELECTED → NEXT TRACK', 'sm', () => blSendSlices([BL.sel], BL.append ? -1 : Math.min(BL.t + 1, drumNtr() - 1))));
    mp.appendChild(hbtn(BL.append ? 'APPEND' : 'REPLACE', 'sm cy' + (BL.append ? ' on' : ''), () => { BL.append = !BL.append; renderBreakLab(); }, true));
    mp.lastChild.title = 'REPLACE: overwrite tracks from the chosen one · APPEND: only use tracks with nothing on them';
    mp.appendChild(hbtn('BY TYPE → 4 LANES', 'sm', () => blSplitByClass(blBase(), true)));
    mp.lastChild.title = 'Kicks, snares, hats and ghosts on four tracks from this one, each playing its own slices where the break has them';
    sh.appendChild(mp);
  }
  // ---- groove generator
  if (sx.slices.length) {
    const g = el('div', 'blgen'); g.appendChild(el('h4', null, 'GROOVE GENERATOR — new rhythms from this break\'s own hits'));
    const gk = el('div', 'dmknobs blrow');
    slider(gk, { knob: true, label: 'Extreme', min: 0, max: 1, def: .45, get: () => BL.ext, set: v => { BL.ext = v; }, fmt: v => Math.round(v * 100) + '%' });
    slider(gk, { knob: true, label: 'Reverse %', min: 0, max: 1, def: 0, get: () => BL.revP, set: v => { BL.revP = v < .01 ? 0 : v; }, fmt: v => Math.round(v * 100) + '%' });
    slider(gk, { knob: true, label: 'Stutter %', min: 0, max: 1, def: 0, get: () => BL.stutP, set: v => { BL.stutP = v < .01 ? 0 : v; }, fmt: v => Math.round(v * 100) + '%' });
    gk.appendChild(hbtn('LOCK KICK', 'sm cy' + (BL.lockK ? ' on' : ''), () => { BL.lockK = !BL.lockK; renderBreakLab(); }, true));
    gk.appendChild(hbtn('RANDOM SNARES', 'sm cy' + (BL.randS ? ' on' : ''), () => { BL.randS = !BL.randS; renderBreakLab(); }, true));
    gk.appendChild(hbtn('MUTATE GHOSTS', 'sm cy' + (BL.mutG ? ' on' : ''), () => { BL.mutG = !BL.mutG; renderBreakLab(); }, true));
    gk.appendChild(hbtn(BL.split ? 'TO 4 LANES' : 'TO THIS LANE', 'sm cy' + (BL.split ? ' on' : ''), () => { BL.split = !BL.split; renderBreakLab(); }, true));
    gk.lastChild.title = 'Apply a variation to this track alone (each step plays its slice) or split into kick / snare / hat / ghost tracks';
    gk.appendChild(hbtn('GENERATE 16', 'wide rec on', () => { BL.gen++; BL.bank = Array.from({ length: 16 }, (_, i) => blVariation(blBase(), BL.gen * 977 + i * 131 + 7, i)); BL.vsel = -1; renderBreakLab(); }));
    g.appendChild(gk);
    if (BL.bank.length) { const vb = el('div', 'blbank');
      BL.bank.forEach((v, i) => { const b = el('button', 'blvar' + (i === BL.vsel ? ' sel' : '')); b.setAttribute('aria-label', 'Variation ' + (i + 1));
        const mini = el('span', 'blmini'); v.forEach(c => { const q = el('i'); if (c) q.style.background = BL_COL[c.c]; mini.appendChild(q); }); b.append(el('b', null, String(i + 1)), mini);
        b.onclick = () => { BL.vsel = i; blApplyVariation(v); renderBreakLab(); }; vb.appendChild(b); });
      g.appendChild(vb); g.appendChild(el('div', 'dmnote', 'Tap a variation to put it in pattern ' + (drumState().sel + 1) + '. GENERATE again for 16 more — the break\'s groove is the starting point every time; Extreme decides how far they wander.')); }
    sh.appendChild(g);
  }
  // ---- resample · export
  const rx = el('div', 'dmchain blrow'); rx.appendChild(el('b', 'dmrowlbl', 'RENDER'));
  { const b = hbtn('RESAMPLE TRACK → NEW SAMPLE', 'sm cy', () => blResample(b)); b.title = 'Render this track as it sounds now (engine, Metalise, Resample, EQ, slices — no sends) over the pattern or chain into a new sample, and load it'; rx.appendChild(b); }
  rx.appendChild(hbtn('EXPORT MIDI', 'sm', () => blExportMidi())); rx.lastChild.title = 'The pattern (or the chain, when CHAIN is on) as a standard MIDI file; slice lanes as notes 36 + slice';
  rx.appendChild(hbtn('EXPORT WAV…', 'sm', () => openExport()));
  sh.appendChild(rx);
  requestAnimationFrame(blDraw);
}
function blPickSample() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.wav,.wave,.flac,audio/wav,audio/x-wav,audio/flac,audio/x-flac';
  inp.onchange = async () => { const f = inp.files && inp.files[0]; if (!f) return; await drumImportSample(BL.t, f); await blLoad(); const sx = blSx(); if (BL.m) { sx.marks = []; sx.slices = []; sx.bpm = 0; sxRedetect(sx, BL.m); sxMakeSlices(sx, BL.m); drumSet(`t${BL.t + 1}.slice`, 1, true); } BL.undo = []; BL.redo = []; blCommit(); };
  inp.click();
}

/* ---------------- waveform ---------------- */
function blClampView() { const n = BL.m ? BL.m.d.length : 1, w = n / BL.zoom; BL.off = clamp(BL.off, 0, Math.max(0, n - w)); if (BL.scroll) BL.scroll.value = n - w > 0 ? Math.round(BL.off / (n - w) * 1000) : 0; }
function blX2P(x, W) { const n = BL.m.d.length; return Math.round(BL.off + (x / W) * n / BL.zoom); }
function blP2X(p, W) { const n = BL.m.d.length; return (p - BL.off) / (n / BL.zoom) * W; }
function blDraw() {
  const cv = BL.cv, m = BL.m; if (!cv || !m || !cv.isConnected) return;
  const dpr = window.devicePixelRatio || 1, W = Math.max(200, cv.clientWidth), H = cv.clientHeight || 170;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const sx = blSx(), n = m.d.length, span = n / BL.zoom, mid = H / 2;
  sx.slices.forEach((v, i) => { const a = blP2X(v.s, W), b = blP2X(v.e, W); if (b < 0 || a > W) return; g.fillStyle = i === BL.sel ? 'rgba(255,210,61,.16)' : i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,0)'; g.fillRect(a, 0, b - a, H);
    g.fillStyle = '#7d8189'; g.font = '600 9px system-ui'; g.fillText(String(i + 1) + (v.r ? '◀' : ''), a + 3, H - 4); });
  g.strokeStyle = '#cfd3da'; g.beginPath();
  for (let x = 0; x < W; x++) { const a = Math.floor(BL.off + x * span / W), b = Math.max(a + 1, Math.floor(BL.off + (x + 1) * span / W)); let lo = 0, hi = 0;
    for (let i = a; i < Math.min(b, n); i += Math.max(1, Math.floor((b - a) / 64))) { const v = m.d[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    g.moveTo(x + .5, mid - hi * mid * .95); g.lineTo(x + .5, mid - lo * mid * .95 + .5); }
  g.stroke();
  sx.marks.forEach((k, i) => { const x = blP2X(k.p, W); if (x < -4 || x > W + 4) return; g.strokeStyle = k.on ? BL_COL[k.c] : '#555a62'; g.lineWidth = i === BL.mk ? 2.5 : 1.2; g.setLineDash(k.on ? [] : [3, 3]);
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.setLineDash([]); g.fillStyle = g.strokeStyle; g.beginPath(); if (k.m) { g.moveTo(x - 5, 0); g.lineTo(x + 5, 0); g.lineTo(x, 7); } else g.arc(x, 4, 3, 0, 7); g.fill(); });
  g.lineWidth = 1;
  if (BL.play) { const v = sx.slices[BL.play.i]; if (v) { const el2 = (performance.now() - BL.play.t0) / 1000 * m.rate, p = v.r ? v.e - el2 : v.s + el2;
      if (el2 < (v.e - v.s) * v.gate) { const x = blP2X(p, W); g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); requestAnimationFrame(blDraw); } else BL.play = null; } }
}
function blWaveEvents(cv) {
  let drag = -1, moved = false, x0 = 0, lp = 0;
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, W: r.width }; };
  cv.addEventListener('pointerdown', e => {
    if (!BL.m) return; audioEnsure(); const { x, W } = pos(e), sx = blSx(); x0 = x; moved = false;
    let best = -1, bd = 7; sx.marks.forEach((k, i) => { const d = Math.abs(blP2X(k.p, W) - x); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { BL.mk = best; drag = best; blSnap(); cv.setPointerCapture(e.pointerId); blDraw(); return; }
    const p = blX2P(x, W), i = sx.slices.findIndex(v => p >= v.s && p < v.e); BL.mk = -1;
    if (i >= 0) { BL.sel = i; blAudition(i); }
    clearTimeout(lp); lp = setTimeout(() => { if (!moved) blAddMark(p); }, 600);   // touch and hold: a new mark here
  });
  cv.addEventListener('pointermove', e => { const { x, W } = pos(e); if (Math.abs(x - x0) > 4) { moved = true; clearTimeout(lp); }
    if (drag < 0) return; const sx = blSx(), k = sx.marks[drag]; if (!k) return; k.p = clamp(blX2P(x, W), 0, BL.m.d.length - 8); k.m = 1; blDraw(); });
  const up = () => { clearTimeout(lp); if (drag >= 0) { const sx = blSx(), k = sx.marks[drag]; sx.marks.sort((a, b) => a.p - b.p); BL.mk = sx.marks.indexOf(k); if (!moved) BL.undo.pop(); else if (sx.mode === 0) sxMakeSlices(sx, BL.m); drag = -1; blCommit(); } else if (!moved) renderBreakLab(); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { clearTimeout(lp); drag = -1; });
  cv.addEventListener('dblclick', e => { const { x, W } = pos(e); blAddMark(blX2P(x, W)); });
  cv.addEventListener('wheel', e => { e.preventDefault(); const { x, W } = pos(e), p = blX2P(x, W);
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) { BL.zoom = clamp(BL.zoom * (e.deltaY < 0 ? 1.25 : 0.8), 1, 256); BL.off = p - (x / W) * BL.m.d.length / BL.zoom; }
    else BL.off += e.deltaX / W * BL.m.d.length / BL.zoom;
    blClampView(); blDraw(); }, { passive: false });
}
function blAddMark(p) { const sx = blSx(); blSnap(); const q = clamp(Math.round(p), 0, BL.m.d.length - 8);
  sx.marks.push({ p: q, m: 1, on: 1, c: 4 }); sx.marks.sort((a, b) => a.p - b.p);
  const cls = sxClassifyAll(BL.m.d, BL.m.rate, sx.marks.map(k => k.p)); BL.mk = sx.marks.findIndex(k => k.p === q && k.m); if (BL.mk >= 0) sx.marks[BL.mk].c = cls[BL.mk];
  if (sx.mode === 0) sxMakeSlices(sx, BL.m); blCommit(); }
function blHitSlice(i, vel) { if (!drumState().on) { drumsSetOn(true).then(() => blHitSlice(i, vel)); return; } drumSamplesPush().then(() => drumPost(['hs', BL.t, i + 1, clamp(vel / 127, 0, 1)])); BL.play = { i, t0: performance.now() }; drumFlashPad(BL.t); requestAnimationFrame(blDraw); }
function blAudition(i) { blHitSlice(i, 110); }

/* ---------------- sending slices ---------------- */
function blCopySampleTo(u) {   // track u gets this track's sample and slices (and the sample engine)
  if (u === BL.t) return;
  drumSmp()[u] = drumSmp()[BL.t]; drumSx()[u] = drumSxClean(JSON.parse(JSON.stringify(blSx())));
  drumSet(`t${u + 1}.engine`, 1, true); drumSet(`t${u + 1}.tsmode`, drumVal(`t${BL.t + 1}.tsmode`), true); drumSet(`t${u + 1}.stretch`, drumVal(`t${BL.t + 1}.stretch`), true); drumSet(`t${u + 1}.decay`, 3, true);
}
function blTrackEmpty(u) { const d = drumState(); return !drumSmp()[u] && !d.pats.some(pt => pt.tr[u].s.some(Boolean)); }
/** slices (indices) → tracks from `from` (−1: the empty ones), one each: same sample, that slice as the track's Slice. */
function blSendSlices(list, from) {
  const n = drumNtr(), used = []; let u = from;
  for (const i of list) {
    if (from < 0) { u = 0; while (u < n && (!blTrackEmpty(u) || used.includes(u))) u++; }
    if (u >= n) break;
    blCopySampleTo(u); drumSet(`t${u + 1}.slice`, i + 1, true); used.push(u); u++;
  }
  drumState().preset = ''; drumSamplesPush(); dirty(); if (drumsOpen()) renderDrums();
  toast(used.length ? (list.length > 1 ? 'Slices' : 'Slice ' + (list[0] + 1)) + ' → track' + (used.length > 1 ? 's ' : ' ') + used.map(x => x + 1).join(', ') : 'No free track');
}
function blWriteStep(pt, u, k, cell) {
  const v = drumStepFull([cell.vel, 0, 0, 1], DRUM_STEP_N); v[21] = cell.sl; v[22] = cell.rv || 0; v[23] = cell.su || 0; pt.tr[u].s[k] = drumTrimStep(v);
}
function blSlicesToLane() {
  const d = drumState(), pt = d.pats[d.sel], sx = blSx(), n = Math.min(16, sx.slices.length);
  pt.tr[BL.t].s = new Array(16).fill(null); pt.tr[BL.t].len = Math.max(n, 1);
  for (let k = 0; k < n; k++) blWriteStep(pt, BL.t, k, { sl: k + 1, vel: sx.slices[k].c === 3 ? .5 : .9 });
  drumSet(`t${BL.t + 1}.engine`, 1, true); drumPushPattern(d.sel); dirty(); if (drumsOpen()) renderDrums(); toast(n + ' slices on track ' + (BL.t + 1) + ', pattern ' + (d.sel + 1));
}

/* ---------------- groove generator ---------------- */
/** The break's own groove on a 16-step bar: where each slice falls (first bar; the rest folded in where it's free). */
function blBase() {
  const sx = blSx(), m = BL.m, n = m.d.length; let stepLen;
  if (sx.bpm > 0) stepLen = 60 / sx.bpm * m.rate / 4;
  else { const bars = Math.max(1, Math.round(n / m.rate * (S.bpm || 120) / 240)); stepLen = n / (16 * bars); }
  const base = new Array(16).fill(null);
  sx.slices.forEach((v, i) => { const st = Math.round(v.s / stepLen); const k = st % 16; if (!base[k] || st < 16) base[k] = { sl: i + 1, c: v.c, vel: v.c === 3 ? .5 : .9 }; });
  return base;
}
function blRng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
/** One variation of the base groove. Kicks stay put when locked; snares swap and slide; ghosts come and go; at high
    Extreme any hit can borrow another slice. Every cell is still one of the break's own slices. */
function blVariation(base, seed, idx) {
  const r = blRng(seed), x = clamp(BL.ext * (0.55 + 0.9 * (idx / 15)), 0, 1), sx = blSx();
  const of = c => sx.slices.map((v, i) => v.c === c ? i + 1 : 0).filter(Boolean);
  const pick = (a, d) => a.length ? a[Math.floor(r() * a.length)] : d;
  const kicks = of(0), snares = of(1), hats = of(2), ghosts = of(3).length ? of(3) : snares;
  const out = base.map(c => c ? Object.assign({}, c) : null);
  for (let k = 0; k < 16; k++) { const c = out[k]; if (!c) continue;
    if (c.c === 0 && !BL.lockK && r() < x * .5) { const to = (k + (r() < .5 ? 1 : -1) * (1 + Math.floor(r() * 2)) + 16) % 16; if (!out[to]) { out[to] = c; out[k] = null; } }
    else if (c.c === 1 && BL.randS) { if (r() < x) c.sl = pick(snares, c.sl); if (r() < x * .45 && k % 4 !== 0) { const to = (k + (r() < .5 ? 1 : 2) + 16) % 16; if (!out[to]) { out[to] = c; out[k] = null; } } }
    else if (c.c === 2) { if (r() < x * .3) out[k] = null; else if (r() < x * .5) c.sl = pick(hats, c.sl); }
    else if (c.c === 3 && BL.mutG) { if (r() < x * .5) out[k] = null; else if (r() < x * .5) c.sl = pick(ghosts, c.sl); }
  }
  if (BL.mutG && ghosts.length) for (let k = 0; k < 16; k++) if (!out[k] && r() < x * .3) out[k] = { sl: pick(ghosts, 1), c: 3, vel: .38 + r() * .18 };
  if (BL.randS && snares.length && x > .5) for (let k = 1; k < 16; k += 2) if (!out[k] && r() < (x - .5) * .35) out[k] = { sl: pick(snares, 1), c: 1, vel: .7 };
  if (x > .6) for (let k = 0; k < 16; k++) { const c = out[k]; if (c && !(c.c === 0 && BL.lockK) && r() < (x - .6) * .5) c.sl = 1 + Math.floor(r() * sx.slices.length); }
  for (const c of out) if (c) { c.vel = clamp(c.vel + (r() - .5) * .12, .2, 1); c.rv = BL.revP; c.su = BL.stutP; }
  return out;
}
function blApplyVariation(v) { if (BL.split) blSplitByClass(v, false); else { const d = drumState(), pt = d.pats[d.sel]; pt.tr[BL.t].s = new Array(16).fill(null); pt.tr[BL.t].len = 16; pt.tr[BL.t].div = DRUM_DEF_DIV;
  v.forEach((c, k) => { if (c) blWriteStep(pt, BL.t, k, c); }); drumSet(`t${BL.t + 1}.engine`, 1, true); drumPushPattern(d.sel); dirty(); if (drumsOpen()) renderDrums(); } }
/** kick / snare / hat / ghost → this track and the next three (each with the break and its slices). */
function blSplitByClass(v, announce) {
  const d = drumState(), pt = d.pats[d.sel], n = drumNtr(), lanes = [0, 1, 2, 3].map(i => Math.min(BL.t + i, n - 1));
  lanes.forEach(u => { blCopySampleTo(u); pt.tr[u].s = new Array(16).fill(null); pt.tr[u].len = 16; pt.tr[u].div = DRUM_DEF_DIV; });
  v.forEach((c, k) => { if (!c) return; const u = lanes[Math.min(c.c, 3)]; blWriteStep(pt, u, k, c); });
  drumPushPattern(d.sel); drumSamplesPush(); dirty(); if (drumsOpen()) renderDrums();
  if (announce) toast('Kick, snare, hat, ghost → tracks ' + lanes.map(x => x + 1).join(', '));
}

/* ---------------- resample (offline render → new sample) ---------------- */
async function drumAddSampleBytes(t, bytes, name) {
  const key = dsmpKey(bytes); let f = drumLib().find(x => x.key === key);
  if (!f) { f = { key, name: name.slice(0, 40), fmt: 'wav', data: ufontB64(bytes) }; DSMP.mono.set(key, await dsmpDecode(bytes)); drumLib().push(f); try { await filePut('dsmp:' + key, new Blob([bytes]), f.name); DSMP.stored.add(key); } catch (e) { } }
  drumSmp()[t] = key; drumState().preset = ''; drumSet(`t${t + 1}.engine`, 1, true); drumSamplesPrune(); return f;
}
async function blResample(btn) {
  if (BL.busy) return; BL.busy = true; const t = BL.t, old = btn.textContent; btn.textContent = 'RENDERING…';
  try {
    const plan = exportPlan(), sr = 48000, samples = [];
    for (let u = 0; u < DRUM_TRACKS; u++) { const k = drumSmp()[u], f = k && drumLib().find(x => x.key === k); const m = f ? await dsmpMono(f) : null; samples.push(m ? (sxPrepare(m, drumSx()[u], sxPrepOpts(u)) || m) : null); }
    const keep = { dly: drumVal(`t${t + 1}.dly`), rev: drumVal(`t${t + 1}.rev`), ring: EXP.tail };
    drumState().p[`t${t + 1}.dly`] = 0; drumState().p[`t${t + 1}.rev`] = 0; EXP.tail = 'cut';   // the dry track: no sends
    let ch; try { ch = await exportRender(sr, plan, t, samples, p => { btn.textContent = 'RENDERING ' + Math.round(p * 100) + '%'; }); }
    finally { drumState().p[`t${t + 1}.dly`] = keep.dly; drumState().p[`t${t + 1}.rev`] = keep.rev; EXP.tail = keep.ring; }
    const n = ch[0].length, mono = new Float32Array(n); let pk = 0; for (let i = 0; i < n; i++) { mono[i] = (ch[0][i] + ch[1][i]) * .5; pk = Math.max(pk, Math.abs(mono[i])); }
    if (pk < 1e-5) { toast('Track ' + (t + 1) + ' is silent in this pattern'); return; }
    const g = Math.min(1 / pk * .98, 8); for (let i = 0; i < n; i++) mono[i] *= g;   // normalised
    const bytes = VDENC.wav([mono], sr, 16), base = (drumSampleName(t) || drumTrackName(t)).replace(/ RS\d+$/, '');
    BL.rsN = (BL.rsN || 0) + 1;
    await drumAddSampleBytes(t, bytes, base + ' RS' + BL.rsN);
    // the processing is now in the sample: reset it on the track so it isn't applied twice
    ['metal', 'rsmp'].forEach(k => drumSet(`t${t + 1}.${k}`, 0, true)); drumSet(`t${t + 1}.tsmode`, 0, true); drumSet(`t${t + 1}.tune`, 0, true); drumSet(`t${t + 1}.slice`, 1, true);
    const sx = drumSx()[t] = drumSxDef(); await blLoad(); sx.bpm = S.bpm; sxRedetect(sx, BL.m); sxMakeSlices(sx, BL.m);
    BL.undo = []; BL.redo = []; drumSamplesPush(true); dirty(); renderBreakLab(); if (drumsOpen()) renderDrums();
    toast('Resampled into a new sample on track ' + (t + 1) + ' — ' + sx.slices.length + ' slices');
  } catch (e) { toast('Resample failed: ' + e.message); }
  finally { BL.busy = false; if (btn.isConnected) btn.textContent = old; }
}

/* ---------------- MIDI export ---------------- */
/** Standard MIDI file (type 1, 96 PPQ): one track per drum track that plays, GM drum notes on channel 10; a track whose
    steps choose slices is a slice lane — notes 36 + slice, on its own channel. */
function drumMidiFile() {
  const d = drumState(), plan = exportPlan(), PPQ = 96, tracks = [];
  const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
  const trk = ev => { ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]); const out = []; let last = 0; for (const [tk, , bytes] of ev) { out.push(...vlq(tk - last), ...bytes); last = tk; } out.push(0, 0xff, 0x2f, 0);
    return [0x4d, 0x54, 0x72, 0x6b, (out.length >>> 24) & 255, (out.length >>> 16) & 255, (out.length >>> 8) & 255, out.length & 255, ...out]; };
  const us = Math.round(60000000 / (S.bpm || 120)), name = s => { const b = Array.from(new TextEncoder().encode(s)); return [0xff, 0x03, ...vlq(b.length), ...b]; };
  tracks.push(trk([[0, 0, [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]], [0, 0, [0xff, 0x58, 4, 4, 2, 24, 8]], [0, 1, name('Vektur Drum')]]));
  let chn = 0;
  for (let t = 0; t < d.ntr; t++) {
    const ev = [], slice = d.pats.some(pt => pt.tr[t].s.some(s => s && drumStepVal(s, 21) > 0)) && drumEngine(t) === 1;
    const ch = slice ? (chn === 9 ? ++chn : chn) : 9; if (slice) chn++;
    let at = 0;
    for (const p of plan.order) { const pt = d.pats[p], tr = pt.tr[t], beats = 4 * pt.bars, sb = DRUM_DIV_BEATS[tr.div] || .25, steps = Math.round(beats / sb);
      for (let k = 0; k < steps; k++) { const s = tr.s[k % tr.len]; if (!s) continue;
        const vel = clamp(Math.round(drumStepVal(s, 0) * 127), 1, 127), rat = drumStepVal(s, 3), sl = drumStepVal(s, 21);
        const note = slice ? clamp(36 + (sl > 0 ? sl - 1 : Math.round(drumVal(`t${t + 1}.slice`)) - 1), 0, 127) : DRUM_NOTES[t];
        for (let r = 0; r < rat; r++) { const on = at + Math.round((k * sb + r * sb / rat) * PPQ), len = Math.max(1, Math.round(sb / rat * PPQ * .9));
          ev.push([on, 1, [0x90 | ch, note, vel]], [on + len, 0, [0x80 | ch, note, 0]]); } }
      at += Math.round(beats * PPQ); }
    if (ev.length) { ev.push([0, -1, name((slice ? 'Slices ' : '') + 'T' + (t + 1) + ' ' + drumTrackName(t))]); tracks.push(trk(ev)); }
  }
  const hd = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, 0, PPQ];
  return Uint8Array.from([...hd, ...tracks.flat()]);
}
function blExportMidi() { const d = drumState(), plan = exportPlan(); vdSaveFile('Vektur Drum' + (d.preset ? ' - ' + exportSafe(d.preset) : '') + ' - ' + (plan.chain ? 'Chain' : 'Pattern ' + (d.sel + 1)) + '.mid', drumMidiFile()); }

(function blCSS() {
  const st = document.createElement('style');
  st.textContent = `.blsheet{max-width:min(1100px,96vw);width:96vw}.blsheet h2 .blsub{font:600 .7rem system-ui;letter-spacing:.12em;color:#9a9ea6;margin-left:.8rem}
.bltracks,.blrow{display:flex;flex-wrap:wrap;gap:.35rem;align-items:flex-end;margin:.35rem 0}.bltracks button.has{box-shadow:inset 0 -2px 0 #3dd6ff}
.blwave{position:relative;border:1px solid #2a2d32;border-radius:.4rem;background:#0b0c0e;margin:.3rem 0}.blwave canvas{display:block;width:100%;height:170px;touch-action:none;cursor:crosshair}
.blzoom{align-items:center}.blscroll{flex:1;min-width:8rem}.blnum{width:3.8rem;background:transparent;border:0;color:#cfe;font:600 .85rem ui-monospace,monospace}
.blpadhd{display:flex;gap:.6rem;align-items:baseline;margin-top:.4rem}.blpadhd b{font:700 .62rem system-ui;letter-spacing:.14em;color:#9a9ea6}
.blpads{display:grid;grid-template-columns:repeat(auto-fill,minmax(4.2rem,1fr));gap:.3rem;margin:.3rem 0}
.blpad{border-radius:.35rem;padding:.35rem .4rem;background:#1b1c1f;border:1px solid #33363c;border-left:4px solid var(--c);cursor:pointer;user-select:none;touch-action:none;display:flex;flex-direction:column;gap:.1rem}
.blpad b{font:700 .9rem system-ui;color:#e8e9ec}.blpad span{font:600 .55rem system-ui;letter-spacing:.08em;color:#9a9ea6}.blpad.sel{background:#2a2b20;border-color:#ffd23d}
.blgen{border:1px solid #2a2d32;border-radius:.4rem;padding:.4rem .5rem;margin:.4rem 0}.blgen h4{margin:.1rem 0 .3rem;font:700 .62rem system-ui;letter-spacing:.14em;color:#9a9ea6}
.blbank{display:grid;grid-template-columns:repeat(8,1fr);gap:.3rem;margin:.3rem 0}.blvar{all:unset;cursor:pointer;border:1px solid #33363c;border-radius:.35rem;padding:.25rem;display:flex;flex-direction:column;gap:.2rem;background:#15161a}
.blvar.sel{border-color:#ffd23d;background:#24251c}.blvar b{font:700 .7rem system-ui;color:#cfd3da}.blmini{display:grid;grid-template-columns:repeat(16,1fr);gap:1px}.blmini i{height:.55rem;background:#26282d;border-radius:1px}
@media (max-width:700px){.blbank{grid-template-columns:repeat(4,1fr)}}`;
  document.head.appendChild(st);
})();
