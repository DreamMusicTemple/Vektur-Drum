/* ============================================================ Vektur Drum — NEW: SLICER window
   The Slicer sits last on the master bus (after delay, reverb and glitch) and rearranges everything you hear.
   The cycle (1 or 2 bars) is cut into slices (1/32 … 1/4 note, at most 32); each slice has an action:
     Thru · Repeat (the slice before) · Stutter (re-triggers its own start ×2…×8) · Reverse (last cycle's slice backwards)
     Tape stop · Tape start · Pitch (± semitones; up reads ahead from the slice before) · Speed (×0.25…×2)
     Gate (silence) · Permute (plays another slice of the cycle in its place) · Scratch (back-and-forth) · Echo (+ the slice before)
   Density thins the program out at random, Evolve swaps in random actions — both re-rolled every cycle from Seed, so a
   seed always gives the same variations. Hold pads override everything while held (momentary performance).
   Every dial here is a modulation destination: drag an LFO, the envelope follower or chaos onto it. */
const SLW = { sel: 0, cells: [], live: -1 };
function slicerModal() { let m = $('#slicerModal'); if (!m) { m = el('div', 'modal'); m.id = 'slicerModal'; m.appendChild(el('div', 'sheet slsheet')); m.onclick = e => { if (e.target === m) closeSlicer(); }; document.body.appendChild(m); } return m; }
function slicerOpen() { const m = $('#slicerModal'); return !!(m && m.classList.contains('open')); }
function openSlicer() { const m = slicerModal(); document.body.appendChild(m); m.classList.add('open'); renderSlicer(); }
function closeSlicer() { const m = $('#slicerModal'); if (m) m.classList.remove('open'); drumSet('sl.hold', 0, true); SLW.cells = []; }
function slicerCount() { return Math.min(SL_SLOTS, Math.round((Math.round(drumVal('sl.bars')) + 1) * 4 / SL_DIV_BEATS[Math.round(drumVal('sl.div'))])); }
function slSel(host, key, list, label) {
  const dd = el('div', 'kcell'); dd.appendChild(el('span', 'klbl', label));
  const se = el('select'); se.setAttribute('aria-label', 'Slicer ' + label);
  list.forEach((n, j) => { const o = new Option(n, j); if (j === Math.round(drumVal(key))) o.selected = true; se.appendChild(o); });
  se.onchange = () => { drumSet(key, +se.value); renderSlicer(); }; const ol = el('div', 'oled'); ol.style.cssText = 'min-width:0;padding:.1rem'; ol.appendChild(se); dd.appendChild(ol); host.appendChild(dd);
}
function renderSlicer() {
  const sh = slicerModal().querySelector('.sheet'); sh.innerHTML = ''; SLW.cells = []; SLW.live = -1;
  const prog = drumSliceProg(), n = slicerCount(); if (SLW.sel >= n) SLW.sel = 0;
  const h = el('h2'); h.appendChild(el('span', null, 'SLICER')); h.appendChild(el('span', 'spacer'));
  const on = hbtn(drumVal('sl.on') ? 'ON' : 'OFF', 'wide rec' + (drumVal('sl.on') ? ' on' : ''), () => { drumSet('sl.on', drumVal('sl.on') ? 0 : 1); renderSlicer(); if (drumsOpen()) renderDrums(); }, true);
  on.setAttribute('aria-label', 'Slicer on or off'); h.appendChild(on);
  const x = el('button', 'cbtn', 'Close'); x.onclick = closeSlicer; h.appendChild(x); sh.appendChild(h);
  // NEW (0.9.1): which patterns the Slicer plays on — each of the 8 follows the ON switch (SONG), or is always ON or OFF
  { const d = drumState(), pr = el('div', 'slpats'); pr.appendChild(el('span', 'klbl', 'PATTERNS'));
    d.pats.forEach((pt, i) => { const v = pt.sl === 0 || pt.sl === 1 ? pt.sl : -1, live = v === 1 || (v < 0 && drumVal('sl.on'));
      const b = hbtn(String(i + 1), 'sm slpat' + (live ? ' on' : '') + (v >= 0 ? ' own' : '') + (i === d.sel ? ' cur' : ''), () => {
        pt.sl = v < 0 ? 1 : v === 1 ? 0 : -1;   /* SONG → ON → OFF → SONG */ drumPost(['B', i, pt.sl]); dirty(); renderSlicer(); if (drumsOpen()) renderDrums(); }, true);
      b.appendChild(el('small', null, v < 0 ? 'SONG' : v ? 'ON' : 'OFF'));
      b.title = `Pattern ${i + 1}: ` + (v < 0 ? 'follows the Slicer switch' : v ? 'always sliced' : 'never sliced') + ' — tap to change'; b.setAttribute('aria-label', b.title); pr.appendChild(b); });
    pr.appendChild(el('span', 'dmnote', 'Lit = sliced. SONG follows ON / OFF above.')); sh.appendChild(pr); }
  // dials
  const k = el('div', 'dmknobs slknobs');
  slSel(k, 'sl.div', SL_DIVS, 'Slice'); slSel(k, 'sl.bars', ['1 bar', '2 bars'], 'Cycle');
  dKnob(k, 'sl.mix', 'Mix', { fmt: t => Math.round(t * 100) + '%' }); dKnob(k, 'sl.density', 'Density', { fmt: t => Math.round(t * 100) + '%' }); dKnob(k, 'sl.evolve', 'Evolve', { fmt: t => Math.round(t * 100) + '%' });
  dKnob(k, 'sl.seed', 'Seed'); slSel(k, 'sl.stutter', SL_STUTTER, 'Stutter'); const stut = k.lastChild; dKnob(k, 'sl.tape', 'Tape'); dKnob(k, 'sl.pitch', 'Pitch'); dKnob(k, 'sl.speed', 'Speed');
  renderMetalise(k, stut);   // NEW (0.8): Metalise (the old glitch's metallic stretch) right of the Stutter dial
  sh.appendChild(k);
  // program
  sh.appendChild(el('h4', null, `Program — ${n} slices of ${SL_DIVS[Math.round(drumVal('sl.div'))]} over ${Math.round(drumVal('sl.bars')) + 1} bar${drumVal('sl.bars') ? 's' : ''}`));
  const g = el('div', 'slgrid'); g.style.setProperty('--n', Math.min(n, 16));
  for (let i = 0; i < n; i++) {
    const a = prog[i][0], b = el('button', 'slcell a' + a + (i === SLW.sel ? ' sel' : '') + (i % (n > 16 ? 8 : 4) === 0 ? ' beat' : ''));
    b.appendChild(el('small', null, String(i + 1))); b.appendChild(el('b', null, SL_SHORT[a] + (a === 9 ? ' ' + (prog[i][1] + 1) : '')));
    b.setAttribute('aria-label', `Slice ${i + 1}: ${SL_ACTIONS[a]}`); b.onclick = () => { SLW.sel = i; renderSlicer(); };
    g.appendChild(b); SLW.cells.push(b);
  }
  sh.appendChild(g);
  const pal = el('div', 'slpal');
  SL_ACTIONS.forEach((nm, a) => { const b = hbtn(nm.toUpperCase(), 'sm a' + a + (prog[SLW.sel][0] === a ? ' on' : ''), () => {
    prog[SLW.sel][0] = a; if (a === 9 && prog[SLW.sel][1] === SLW.sel) prog[SLW.sel][1] = (SLW.sel + n - 1) % n;
    drumPost(['L', SLW.sel, a, prog[SLW.sel][1]]); dirty(); if (a !== 9) SLW.sel = (SLW.sel + 1) % n; renderSlicer(); }, true); b.classList.add('slact'); pal.appendChild(b); });
  sh.appendChild(pal);
  if (prog[SLW.sel][0] === 9) {
    const ps = el('div', 'slperm'); ps.appendChild(el('span', 'klbl', `SLICE ${SLW.sel + 1} PLAYS`));
    for (let j = 0; j < n; j++) ps.appendChild(hbtn(String(j + 1), 'sm' + (prog[SLW.sel][1] === j ? ' on' : ''), () => { prog[SLW.sel][1] = j; drumPost(['L', SLW.sel, 9, j]); dirty(); renderSlicer(); }, true));
    ps.appendChild(el('div', 'clhelp', 'An earlier slice plays from this cycle; the same or a later one from the cycle before.'));
    sh.appendChild(ps);
  }
  // generators and edits
  const gen = el('div', 'row prebtns');
  [['SUBTLE', 'subtle'], ['JUNGLE', 'jungle'], ['GLITCH', 'glitch'], ['TAPE', 'tape'], ['CHAOS', 'chaos']].forEach(([l, st]) => gen.appendChild(hbtn(l, 'sm', () => slicerGenerate(st))));
  gen.appendChild(hbtn('◀ SHIFT', 'sm', () => slicerRotate(-1))); gen.appendChild(hbtn('SHIFT ▶', 'sm', () => slicerRotate(1)));
  gen.appendChild(hbtn('MIRROR', 'sm', () => { const c = prog.slice(0, n).map(s => s.slice()); for (let i = 0; i < n; i++) prog[i] = c[n - 1 - i]; slicerCommit(); }));
  gen.appendChild(hbtn('NEW SEED', 'sm', () => { drumSet('sl.seed', Math.floor(Math.random() * 100)); renderSlicer(); }));
  gen.appendChild(hbtn('CLEAR', 'sm', () => { for (let i = 0; i < SL_SLOTS; i++) prog[i] = [0, i]; slicerCommit(); }));
  const two = el('div', 'sltwo'), gcol = el('div'), hcol = el('div'); two.append(gcol, hcol); sh.appendChild(two);
  gcol.appendChild(el('h4', null, 'Generate')); gcol.appendChild(gen);
  // hold pads
  hcol.appendChild(el('h4', null, 'Hold — momentary, overrides the program'));
  const hp = el('div', 'slhold');
  for (let i = 1; i < SL_HOLD.length; i++) {
    const p = el('div', 'pad slpad'); p.append(el('b', null, String(i)), el('i'), el('span', null, SL_HOLD[i].toUpperCase()));
    p.setAttribute('role', 'button'); p.tabIndex = 0; p.setAttribute('aria-label', 'Hold ' + SL_HOLD[i]);
    const down = e => { e.preventDefault(); audioEnsure(); if (!drumVal('sl.on')) drumSet('sl.on', 1, true); drumSet('sl.hold', i, true); p.classList.add('down'); };
    const up = () => { if (!p.classList.contains('down')) return; drumSet('sl.hold', 0, true); p.classList.remove('down'); };
    p.addEventListener('pointerdown', down); p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up); p.addEventListener('pointerleave', up);
    p.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') down(e); }); p.addEventListener('keyup', up);
    hp.appendChild(p);
  }
  hcol.appendChild(hp);
  // modulation of the slicer
  sh.appendChild(el('h4', null, 'Modulate — drag a source onto any Slicer dial'));
  const mc = el('div', 'modchips'); for (let s = 0; s < MOD_SOURCES.length; s++) mc.appendChild(modChip(s));
  mc.appendChild(hbtn('MOD MATRIX…', 'sm', () => { MODW.group = 'Slicer'; openMod(); })); sh.appendChild(mc);
  const wl = el('div', 'slmods'); wl.id = 'slMods'; sh.appendChild(wl); renderSlicerMods();
  sh.appendChild(el('div', 'clhelp', 'Ideas: LFO (synced 1 bar) → Density for slicing that breathes; Chaos → Evolve for programs that never settle; Env follower (kick) → Mix so the kick pushes the slicer in; LFO → Pitch for tape-warble; LFO S&H → Seed for a new variation every cycle.'));
}
function renderSlicerMods() {
  const wl = $('#slMods'); if (!wl) return; wl.innerHTML = '';
  drumWires().forEach((w, i) => { if (!/^sl\./.test(w.k)) return;
    const r = el('span', 'slmod'); r.style.setProperty('--mc', MOD_COL[w.s]);
    r.appendChild(document.createTextNode(`${MOD_SOURCES[w.s]} → ${DRUM_PARAMS[DP_ID[w.k]][1]} ${w.a > 0 ? '+' : ''}${Math.round(w.a * 100)}%`));
    const x = el('button', null, '✕'); x.setAttribute('aria-label', 'Delete wire'); x.onclick = () => modDelWire(i); r.appendChild(x); wl.appendChild(r); });
}
function slicerCommit() { drumPushSlicer(); dirty(); renderSlicer(); }
function slicerRotate(d) { const prog = drumSliceProg(), n = slicerCount(), c = prog.slice(0, n).map(s => s.slice()); for (let i = 0; i < n; i++) prog[(i + d + n) % n] = c[i]; slicerCommit(); }
/** Fills the program in a style. Actions are weighted; bar ends and the cycle's last beat get more. */
function slicerGenerate(style) {
  const prog = drumSliceProg(), n = slicerCount(), per = Math.max(1, Math.round(n / (Math.round(drumVal('sl.bars')) + 1)));
  const W = {   // weights per action:  Thru Rpt Stt Rev Stop Strt Ptch Spd Gate Perm Scr Echo
    subtle: [14, 2, 1, 1, 0, 0, 0, 0, 0, 2, 0, 1],
    jungle: [5, 3, 3, 2, 0, 0, 1, 0, 1, 5, 0, 2],
    glitch: [3, 1, 5, 1, 0, 0, 2, 2, 3, 2, 3, 1],
    tape: [8, 0, 0, 1, 1, 0, 1, 3, 0, 1, 1, 1],
    chaos: [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }[style];
  const pickW = w => { let s = w.reduce((a, b) => a + b, 0), r = Math.random() * s; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; } return 0; };
  for (let i = 0; i < SL_SLOTS; i++) {
    const endBar = (i % per) >= per - Math.max(1, per >> 2);
    let a = pickW(W); if (style === 'subtle' && !endBar) a = Math.random() < .85 ? 0 : a;
    if (style === 'tape' && i % per === per - 1) a = 4; if (style === 'tape' && i % per === 0 && Math.random() < .5) a = 5;
    if (a === 4 && style !== 'tape' && style !== 'chaos') a = 0;   // tape stops only where they land musically
    prog[i] = [a, a === 9 ? Math.floor(Math.random() * n) : i];
  }
  if (style === 'jungle') { drumSet('sl.div', 1, true); drumSet('sl.stutter', 2, true); }
  if (style === 'glitch') { drumSet('sl.div', 0, true); }
  toast('Slicer: ' + style + ' program'); slicerCommit();
}
function paintSlicerLive(idx, act) {
  if (!slicerOpen() || !SLW.cells.length) return; const i = idx >= 0 ? Math.round(idx) : -1;
  if (i !== SLW.live) { if (SLW.cells[SLW.live]) SLW.cells[SLW.live].classList.remove('now'); if (SLW.cells[i]) SLW.cells[i].classList.add('now'); SLW.live = i; }
  if (SLW.cells[i]) { const a = Math.round(act); if (SLW.cells[i].dataset.p !== String(a)) { SLW.cells[i].dataset.p = a; SLW.cells.forEach(c => c.classList.remove('play')); if (a > 0) SLW.cells[i].classList.add('play'); } }
}
(function slicerCSS() {
  const st = document.createElement('style');
  st.textContent = `#slicerModal{z-index:66}.slsheet{width:min(64rem,97vw);padding:.6rem .8rem}
.slsheet h2{margin:0 0 .3rem;font-size:1.1rem;display:flex;align-items:center;gap:.4rem}.slsheet h4{margin:.55rem 0 .3rem;font-size:.74rem;letter-spacing:.06em;padding-left:.45rem;border-left:3px solid var(--led)}
.slknobs{align-items:center}
.slsheet .kcell{width:3.4rem}.slsheet .knob{width:2.3rem;height:2.3rem}.slsheet .klbl{font-size:.5rem}.slsheet .kval{font-size:.54rem;min-width:2.2rem}
.slsheet .clhelp{font-size:.66rem;margin-top:.25rem}.slsheet .prebtns{margin:.2rem 0}
.sltwo{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:.6rem}.slsheet .slpad{min-height:2.6rem;aspect-ratio:auto}
.slknobs{flex-wrap:wrap}
.slgrid{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:.22rem}
.slcell{display:flex;flex-direction:column;align-items:center;gap:.05rem;padding:.3rem 0;border:1px solid var(--line);border-radius:.35rem;background:#15171a;font-size:.6rem;min-height:2.6rem}
.slcell small{font-size:.5rem;opacity:.45}.slcell b{font-size:.6rem;letter-spacing:.04em}.slcell.beat{border-left:2px solid #555}
.slcell.sel{box-shadow:0 0 0 2px var(--accent) inset}.slcell.now{background:#2b2f36}.slcell.now.play{background:#3a2a10}
.slcell.a0 b{opacity:.35}.a1 b,.slact.a1{color:#3fd7ff}.a2 b,.slact.a2{color:#ffb43c}.a3 b,.slact.a3{color:#ff5ad2}.a4 b,.slact.a4,.a5 b,.slact.a5{color:#ff7a4e}
.a6 b,.slact.a6,.a7 b,.slact.a7{color:#b48cff}.a8 b,.slact.a8{color:#9aa0a8}.a9 b,.slact.a9{color:#6dff8a}.a10 b,.slact.a10{color:#ffe14e}.a11 b,.slact.a11{color:#7ab8ff}
.slpal{display:flex;flex-wrap:wrap;gap:.25rem;margin-top:.45rem}.slperm{display:flex;flex-wrap:wrap;gap:.2rem;align-items:center;margin-top:.4rem}.slperm .hb{min-width:1.9rem}
.slhold{display:grid;grid-template-columns:repeat(3,1fr);gap:.25rem}.slpad{min-height:3.6rem}
.slmods{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.35rem}.slmod{display:inline-flex;gap:.35rem;align-items:center;border:1px solid var(--mc);color:var(--mc);border-radius:1rem;padding:.12rem .2rem .12rem .55rem;font-size:.66rem}
.slmod button{background:none;border:0;color:inherit;font-size:.7rem}
@media (max-width:640px){.slgrid{grid-template-columns:repeat(8,1fr)}.sltwo{grid-template-columns:1fr}}`;
  document.head.appendChild(st);
})();
