/* ============================================================ Vektur Drum — NEW: modulation matrix and ring modulator
   MOD window (a drawer on the right, so the panel stays usable beside it):
     · five sources — LFO 1–3, the envelope follower and chaos — as chips with live meters;
     · drag a chip onto ANY dial (in the panel, the glitch row, the Slicer window) or onto a destination in the list:
       a wire appears in the wire list, where it gets its depth (−100…+100 %), can be inverted or deleted;
     · or tap a chip, then tap a destination (no dragging needed).
   Up to 32 wires. A wire adds source × depth to the dial's position (0…1 of its travel), so it works the same on every
   dial, linear or logarithmic; the dial itself doesn't move. Wired dials carry a coloured ring.
   RING popup (from the STEP section): this step ring-modulates its slave tracks by a master — another track's sound,
   level-normalised, or a sine oscillator — for as long as the step lasts. */
const MOD_COL = ['#3fd7ff', '#ffb43c', '#ff5ad2', '#6dff8a', '#ff5a4e'];
const MODW = { pick: -1, group: 'Slicer', meters: [], drag: null, left: false, lfoCol: {} };

// ---- wires
function modAddWire(s, key, a) {
  const q = DRUM_PARAMS[DP_ID[key]]; if (!drumModDest(q)) { toast('That control can’t be modulated'); return; }
  const w = drumWires(); const ex = w.find(x => x.s === s && x.k === key);
  if (ex) { toast(MOD_SOURCES[s] + ' already modulates ' + modDestName(key)); return; }
  if (w.length >= MOD_WIRES) { toast('All 32 wires are in use: delete one first'); return; }
  w.push({ s, k: key, a: a != null ? a : 0.5 }); drumPushWires(); dirty();
  toast(MOD_SOURCES[s] + ' → ' + modDestName(key)); modRefresh();
}
function modDelWire(i) { drumWires().splice(i, 1); drumPushWires(); dirty(); modRefresh(); }
function modDestName(key) {
  const q = DRUM_PARAMS[DP_ID[key]]; if (!q) return key; if (key === 'gl.on') return 'Metalise · On/Off';
  const m = /^t(\d+)\./.exec(key); return (m ? 'T' + m[1] : q[2]) + ' · ' + q[1];
}
function modGroups() {
  const g = new Map();
  for (const q of DRUM_PARAMS) { if (!drumModDest(q)) continue; const m = /^t(\d+)\./.exec(q[0]); const name = m ? 'Track ' + m[1] : q[2];
    if (m && +m[1] > drumNtr()) continue; if (!g.has(name)) g.set(name, []); g.get(name).push(q); }
  return g;
}
function modPeek() { const m = $('#modModal'); if (m) m.classList.toggle('peek', MODW.pick >= 0 && MODW.geo.mode !== 'float'); }
function modRefresh() { modPeek();   // wired rings on the dials, the drawer, the slicer window
  const keys = drumWiredKeys();
  document.querySelectorAll('[data-mod-key]').forEach(c => { if (c.classList.contains('kcell') || c.tagName === 'BUTTON' && !c.classList.contains('moddest')) c.classList.toggle('wired', keys.has(c.dataset.modKey) || (c.dataset.modKey === 'gl.on' && drumVal('gl.chance') > 0)); });
  if (modOpen()) renderMod(); if (typeof slicerOpen === 'function' && slicerOpen()) renderSlicerMods();
}

// ---- drag and drop (pointer events: works with touch, pen and mouse)
function modChip(s, opts = {}) {
  const c = el('button', 'modchip' + (MODW.pick === s ? ' pick' : '')); c.style.setProperty('--mc', MOD_COL[s]);
  c.appendChild(el('i', 'modm')); c.appendChild(el('b', null, MOD_SOURCES[s].replace('Env follower', 'ENV').toUpperCase()));
  c.title = 'Drag onto any dial or destination — or tap, then tap a destination'; c.setAttribute('aria-label', MOD_SOURCES[s] + ' modulation source');
  c.addEventListener('pointerdown', e => modDragStart(e, s, c));
  MODW.meters.push({ s, m: c.firstChild });
  return c;
}
function modDragStart(e, s, chip) {
  e.preventDefault(); const x0 = e.clientX, y0 = e.clientY; let ghost = null;
  const move = ev => {
    if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
    if (!ghost) { ghost = el('div', 'modghost', MOD_SOURCES[s]); ghost.style.setProperty('--mc', MOD_COL[s]); document.body.appendChild(ghost); document.body.classList.add('moddrag'); }
    ghost.style.transform = `translate(${ev.clientX + 10}px, ${ev.clientY + 10}px)`;
    const t = modTargetAt(ev.clientX, ev.clientY); if (MODW.drag !== t) { if (MODW.drag) MODW.drag.classList.remove('modover'); MODW.drag = t; if (t) t.classList.add('modover'); }
  };
  const up = ev => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    document.body.classList.remove('moddrag'); if (MODW.drag) MODW.drag.classList.remove('modover'); MODW.drag = null;
    if (ghost) { ghost.remove(); const t = ev.type === 'pointerup' && modTargetAt(ev.clientX, ev.clientY); if (t) modAddWire(s, t.dataset.modKey); return; }
    MODW.pick = MODW.pick === s ? -1 : s;   // a tap: pick this source, then tap a destination (the drawer steps aside)
    if (MODW.pick >= 0) toast('Now tap a destination for ' + MOD_SOURCES[s]); modRefresh(); if (!modOpen()) chip.classList.toggle('pick', MODW.pick === s);
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}
function modTargetAt(x, y) { const e = document.elementFromPoint(x, y); return e && e.closest ? e.closest('[data-mod-key]') : null; }
// a picked source + a tap on a dial wires it (capture phase, before the dial turns)
document.addEventListener('pointerdown', e => {
  if (MODW.pick < 0) return; const t = e.target.closest && e.target.closest('[data-mod-key]'); if (!t || e.target.closest('.modchip')) return;
  e.stopPropagation(); e.preventDefault(); const s = MODW.pick; MODW.pick = -1; modAddWire(s, t.dataset.modKey);
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && MODW.pick >= 0) { MODW.pick = -1; modRefresh(); } });

// ---- the MOD drawer
/* NEW (0.7): the MOD window floats — drag it by its title bar anywhere, resize it from its corner, scale its contents
   (A− / A+), fold it down to just the source chips (—), or dock it to the left or right edge. Its place and size are
   remembered on this device. */
const MODGEO_KEY = 'vekturdrum.modwin.v1';
MODW.geo = (() => { const d = { mode: 'float', x: null, y: 64, w: 380, h: 560, scale: 1, min: false };
  try { const o = JSON.parse(localStorage.getItem(MODGEO_KEY) || 'null'); if (o && typeof o === 'object') Object.assign(d, o); } catch (e) { } return d; })();
function modGeoSave() { try { localStorage.setItem(MODGEO_KEY, JSON.stringify(MODW.geo)); } catch (e) { } }
function modGeoApply() {
  const m = $('#modModal'); if (!m) return; const g = MODW.geo, vw = innerWidth, vh = innerHeight;
  g.scale = clamp(+g.scale || 1, .7, 1.6); g.w = clamp(+g.w || 380, 250, vw); g.h = clamp(+g.h || 560, 160, vh);
  if (g.x == null) g.x = vw - g.w - 16; g.x = clamp(g.x, -g.w + 80, vw - 80); g.y = clamp(g.y, 0, vh - 40);
  m.classList.toggle('float', g.mode === 'float'); m.classList.toggle('left', g.mode === 'left'); m.classList.toggle('mini', !!g.min);
  m.style.setProperty('--mz', g.scale);
  if (g.mode === 'float') { m.style.left = g.x + 'px'; m.style.top = g.y + 'px'; m.style.width = g.w + 'px'; m.style.height = g.min ? 'auto' : g.h + 'px'; }
  else { m.style.left = m.style.top = m.style.height = ''; m.style.width = Math.min(g.w, vw) + 'px'; }
}
function modModal() {
  let m = $('#modModal'); if (m) return m;
  m = el('div', 'moddrawer modwin'); m.id = 'modModal';
  const bar = el('div', 'modbar'); bar.appendChild(el('b', null, 'MODULATION'));
  const chips = el('span', 'modbarchips'); bar.appendChild(chips); bar.appendChild(el('span', 'spacer'));
  const btn = (txt, title, f) => { const b = el('button', 'modbtn', txt); b.title = title; b.onclick = e => { e.stopPropagation(); f(); }; bar.appendChild(b); return b; };
  btn('A−', 'Smaller', () => { MODW.geo.scale = Math.round((MODW.geo.scale - .1) * 10) / 10; modGeoApply(); modGeoSave(); });
  btn('A+', 'Larger', () => { MODW.geo.scale = Math.round((MODW.geo.scale + .1) * 10) / 10; modGeoApply(); modGeoSave(); });
  btn('◧', 'Dock to the left edge', () => { MODW.geo.mode = 'left'; MODW.geo.min = false; modGeoApply(); modGeoSave(); renderMod(); });
  btn('❐', 'Float: drag the title bar to move, the corner to resize', () => { MODW.geo.mode = 'float'; modGeoApply(); modGeoSave(); renderMod(); });
  btn('◨', 'Dock to the right edge', () => { MODW.geo.mode = 'right'; MODW.geo.min = false; modGeoApply(); modGeoSave(); renderMod(); });
  btn('—', 'Fold down to the source chips only (tap again to open)', () => { MODW.geo.min = !MODW.geo.min; if (MODW.geo.min) MODW.geo.mode = 'float'; modGeoApply(); modGeoSave(); renderMod(); });
  btn('✕', 'Close', closeMod);
  // move by the title bar
  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || MODW.geo.mode !== 'float') return;
    e.preventDefault(); const g = MODW.geo, x0 = e.clientX - g.x, y0 = e.clientY - g.y; bar.setPointerCapture(e.pointerId);
    bar.onpointermove = ev => { g.x = ev.clientX - x0; g.y = ev.clientY - y0; modGeoApply(); };
    bar.onpointerup = bar.onpointercancel = () => { bar.onpointermove = null; modGeoSave(); };
  });
  m.appendChild(bar); m.appendChild(el('div', 'sheet modsheet'));
  // resize from the corner (touch too)
  const grip = el('div', 'modgrip'); grip.title = 'Drag to resize';
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); const g = MODW.geo, w0 = g.w, h0 = g.h, x0 = e.clientX, y0 = e.clientY, left = g.mode === 'left'; grip.setPointerCapture(e.pointerId);
    grip.onpointermove = ev => { g.w = w0 + (left || g.mode === 'float' ? 1 : -1) * (ev.clientX - x0); if (g.mode === 'float') g.h = h0 + (ev.clientY - y0); modGeoApply(); };
    grip.onpointerup = grip.onpointercancel = () => { grip.onpointermove = null; modGeoSave(); };
  });
  m.appendChild(grip);
  addEventListener('resize', modGeoApply);
  document.body.appendChild(m); return m;
}
function modOpen() { const m = $('#modModal'); return !!(m && m.classList.contains('open')); }
function openMod() { const m = modModal(); document.body.appendChild(m); m.classList.add('open'); modGeoApply(); renderMod(); }
function closeMod() { const m = $('#modModal'); if (m) m.classList.remove('open', 'peek'); MODW.pick = -1; }
function renderMod() {
  const m = modModal(), sh = m.querySelector('.sheet'); sh.innerHTML = ''; MODW.meters = MODW.meters.filter(x => x.m.isConnected);
  const bc = m.querySelector('.modbarchips'); bc.innerHTML = '';
  if (MODW.geo.min) { for (let s = 0; s < MOD_SOURCES.length; s++) bc.appendChild(modChip(s)); return; }   // folded: a palette of sources
  const h = el('div');
  if (MODW.pick >= 0) { const pk = el('div', 'modpick', `${MOD_SOURCES[MODW.pick]} picked — tap any dial or destination (Esc / tap the chip again to cancel)`); pk.style.setProperty('--mc', MOD_COL[MODW.pick]); sh.appendChild(pk); }
  // sources
  sh.appendChild(el('h4', null, 'Sources — drag onto any dial'));
  const chips = el('div', 'modchips'); for (let s = 0; s < MOD_SOURCES.length; s++) chips.appendChild(modChip(s)); sh.appendChild(chips);
  // source settings: env follower and chaos (the LFOs are in the GLITCH row of the panel)
  const ss = el('div', 'modset');
  { const b = el('div', 'modbox'); b.appendChild(el('b', null, 'ENV FOLLOWER'));
    const sel = el('select'); sel.setAttribute('aria-label', 'Envelope follower input'); ENV_SRCS.forEach((n, i) => { if (i > drumNtr()) return; const o = new Option(n, i); if (i === Math.round(drumVal('env.src'))) o.selected = true; sel.appendChild(o); });
    sel.onchange = () => drumSet('env.src', +sel.value); b.appendChild(sel);
    const k = el('div', 'dmknobs'); dKnob(k, 'env.att', 'Attack'); dKnob(k, 'env.rel', 'Release'); dKnob(k, 'env.gain', 'Gain'); b.appendChild(k); ss.appendChild(b); }
  { const b = el('div', 'modbox'); b.appendChild(el('b', null, 'CHAOS'));
    const r = el('div', 'row'); CHAOS_MODES.forEach((n, i) => r.appendChild(hbtn(n.toUpperCase(), 'sm cy' + (Math.round(drumVal('ch.mode')) === i ? ' on' : ''), () => { drumSet('ch.mode', i); renderMod(); }, true))); b.appendChild(r);
    const k = el('div', 'dmknobs'); dKnob(k, 'ch.rate', 'Rate'); b.appendChild(k); ss.appendChild(b); }
  { const b = el('div', 'modbox'); b.appendChild(el('b', null, 'LFO 1–3'));   // NEW: every source's settings in one place
    for (let i = 1; i <= 3; i++) {
      const k = `lfo${i}`, r = el('div', 'modlfo'); r.appendChild(modChip(i - 1));
      const se = el('select'); se.setAttribute('aria-label', `LFO ${i} shape`); LFO_SHAPES.forEach((n, j) => { const o = new Option(n, j); if (j === Math.round(drumVal(k + '.shape'))) o.selected = true; se.appendChild(o); });
      se.onchange = () => { drumSet(k + '.shape', +se.value); if (drumsOpen()) renderDrums(); renderMod(); }; r.appendChild(se);
      const sync = !!drumVal(k + '.sync');
      r.appendChild(hbtn('SYNC', 'sm cy' + (sync ? ' on' : ''), () => { drumSet(k + '.sync', sync ? 0 : 1); renderMod(); if (drumsOpen()) renderDrums(); }, true));
      if (sync) { const dv = el('select'); dv.setAttribute('aria-label', `LFO ${i} division`); LFO_DIVS.forEach((n, j) => { const o = new Option(n, j); if (j === Math.round(drumVal(k + '.div'))) o.selected = true; dv.appendChild(o); });
        dv.onchange = () => { drumSet(k + '.div', +dv.value); if (drumsOpen()) renderDrums(); }; r.appendChild(dv); }
      else dKnob(r, k + '.rate', 'Rate');
      b.appendChild(r);
      if (Math.round(drumVal(k + '.shape')) === 5) b.appendChild(lfoDrawEditor(i - 1, 220, 52));   // NEW (0.9.1): DRAW
    }
    ss.appendChild(b); }
  sh.appendChild(ss);
  sh.appendChild(el('div', 'clhelp', 'Each LFO also still moves its own glitch target with its Depth (in the LFO row). Env follower: the level of the master or one track. Chaos: Lorenz (smooth, never repeats), Logistic (stepped jumps), Drift (slow random walk).'));
  // wire list
  const w = drumWires();
  sh.appendChild(el('h4', null, `Wires — ${w.length} of ${MOD_WIRES}`));
  if (!w.length) sh.appendChild(el('div', 'clhelp', 'No wires yet. Drag a source onto a dial.'));
  const wl = el('div', 'modwires');
  w.forEach((x, i) => {
    const r = el('div', 'modwire'); r.style.setProperty('--mc', MOD_COL[x.s]);
    const src = el('select'); src.setAttribute('aria-label', 'Wire source'); MOD_SOURCES.forEach((n, j) => { const o = new Option(n, j); if (j === x.s) o.selected = true; src.appendChild(o); });
    src.onchange = () => { x.s = +src.value; drumPushWires(); dirty(); renderMod(); };
    r.appendChild(src); r.appendChild(el('span', 'modarrow', '→')); r.appendChild(el('span', 'moddst', modDestName(x.k)));
    slider(r, { knob: true, label: 'Depth', min: -1, max: 1, def: 0.5, bipolar: true, get: () => x.a, set: v => { x.a = Math.abs(v) < .02 ? 0 : v; drumPost(['W', i, x.s, DP_ID[x.k], x.a]); }, fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%' });
    r.appendChild(hbtn('INV', 'sm', () => { x.a = -x.a; drumPushWires(); dirty(); renderMod(); }));
    r.appendChild(hbtn('✕', 'sm', () => modDelWire(i)));
    wl.appendChild(r);
  });
  sh.appendChild(wl);
  if (w.length) { const r = el('div', 'row'); r.appendChild(hbtn('CLEAR ALL', 'sm', () => { if (!confirm('Delete every wire?')) return; drumWires().length = 0; drumPushWires(); dirty(); modRefresh(); })); sh.appendChild(r); }
  // destinations
  sh.appendChild(el('h4', null, 'Destinations — every dial'));
  const G = modGroups(); if (!G.has(MODW.group)) MODW.group = 'Slicer';
  const gs = el('select'); gs.setAttribute('aria-label', 'Destination group'); for (const n of G.keys()) { const o = new Option(n, n); if (n === MODW.group) o.selected = true; gs.appendChild(o); }
  gs.onchange = () => { MODW.group = gs.value; renderMod(); }; sh.appendChild(gs);
  const keys = drumWiredKeys(), dl = el('div', 'moddests');
  for (const q of G.get(MODW.group) || []) {
    const b = el('button', 'moddest' + (keys.has(q[0]) ? ' wired' : '')); b.dataset.modKey = q[0];
    b.appendChild(el('span', null, q[1])); b.appendChild(el('small', null, drumFmt(q, drumVal(q[0]))));
    b.onclick = () => { if (MODW.pick >= 0) return; toast('Drag a source here, or tap a source first'); };
    dl.appendChild(b);
  }
  sh.appendChild(dl);
}
/** Live: source meters (chips anywhere), the Slicer's playing slice. */
function paintModLive(tel) {
  const base = 4 + 3 * DRUM_TRACKS + 3;
  for (const x of MODW.meters) { if (!x.m.isConnected) continue; const v = tel[base + x.s] || 0, p = Math.round((x.s === 3 ? v : v * .5 + .5) * 100);
    if (x.m.dataset.p !== String(p)) { x.m.dataset.p = p; x.m.style.width = p + '%'; } }
  if (typeof paintSlicerLive === 'function') paintSlicerLive(tel[base + MOD_SOURCES.length], tel[base + MOD_SOURCES.length + 1]);
  paintModDials(tel);
}
/** NEW: every dial a source moves shows where the modulation has it now — a light on its rim, in the source's colour
    (wires from the engine's telemetry; the LFOs' own glitch targets from the LFO values and depths). */
function paintModDials(tel) {
  const mb = 4 + 3 * DRUM_TRACKS + 5 + MOD_SOURCES.length, pos = new Map();
  for (let n = 0; n < MOD_WIRES; n++) { const d = tel[mb + 2 * n]; if (!(d >= 0)) break; const q = DRUM_PARAMS[d]; if (q) pos.set(q[0], tel[mb + 2 * n + 1]); }
  if (drumVal('gl.on')) {   // LFO → glitch Mix / Size / Speed (depth), as the engine adds it
    const add = [0, 0, 0], col = [null, null, null];
    for (let i = 0; i < 3; i++) { const dp = drumVal(`lfo${i + 1}.depth`); if (!dp) continue; const ds = Math.round(drumVal(`lfo${i + 1}.dest`)); add[ds] += dp * (tel[4 + 3 * DRUM_TRACKS + i] || 0); col[ds] = col[ds] || MOD_COL[i]; }
    ['gl.mix', 'gl.size', 'gl.speed'].forEach((k, i) => { if (col[i] && !pos.has(k)) { pos.set(k, clamp(drumNorm(DRUM_PARAMS[DP_ID[k]], drumVal(k)) + add[i], 0, 1)); MODW.lfoCol[k] = col[i]; } else delete MODW.lfoCol[k]; });
  }
  const colOf = k => { const w = drumWires().find(x => x.k === k); return w ? MOD_COL[w.s] : MODW.lfoCol[k] || '#ff5ad2'; };
  for (const c of document.querySelectorAll('.kcell[data-mod-key]')) {
    const k = c.dataset.modKey, p = pos.get(k), m = c.querySelector('.kmod'); if (!m) continue;
    if (p == null) { if (c.classList.contains('modlive')) c.classList.remove('modlive'); continue; }
    const a = (p * 270 - 135).toFixed(1) + 'deg';
    if (!c.classList.contains('modlive')) { c.classList.add('modlive'); m.style.setProperty('--mc', colOf(k)); }
    if (m.dataset.a !== a) { m.dataset.a = a; m.style.setProperty('--m', a); }
  }
}

// ---- RING popup
const RING = { t: 0, s: 0 };
function ringModal() { let m = $('#ringModal'); if (!m) { m = el('div', 'modal'); m.id = 'ringModal'; m.appendChild(el('div', 'sheet ringsheet')); m.onclick = e => { if (e.target === m) closeRing(); }; document.body.appendChild(m); } return m; }
function openRing(t, s) { RING.t = t; RING.s = s; const m = ringModal(); document.body.appendChild(m); m.classList.add('open'); renderRing(); }
function closeRing() { const m = $('#ringModal'); if (m) m.classList.remove('open'); if (drumsOpen()) renderDrumStep(); }
function renderRing() {
  const d = drumState(), pat = d.pats[d.sel], t = RING.t, s = RING.s, n = drumNtr();
  const cur = () => pat.tr[t].s[s];
  const full = () => { if (!pat.tr[t].s[s]) pat.tr[t].s[s] = [.8, 0, 0, 1]; return drumStepFull(pat.tr[t].s[s], DRUM_STEP_N); };
  const push = () => { drumPost(drumStepMsg(d.sel, t, s, cur())); paintStep(t, s); dirty(); };
  const val = i => drumStepVal(cur(), i);
  const sh = ringModal().querySelector('.sheet'); sh.innerHTML = '';
  const h = el('h2'); h.appendChild(el('span', null, `RING MOD · T${t + 1} STEP ${String(s + 1).padStart(2, '0')}`)); h.appendChild(el('span', 'spacer'));
  const x = el('button', 'cbtn', 'Done'); x.onclick = closeRing; h.appendChild(x); sh.appendChild(h);
  const on = val(9) > 0;
  const top = el('div', 'row');
  top.appendChild(hbtn(on ? 'RING ON' : 'RING OFF', 'wide rec' + (on ? ' on' : ''), () => {
    const v = full(); if (v[9] > 0) v[9] = 0; else { v[9] = 1; if (!v[11]) { v[10] = v[10] >= RING_OSC ? RING_OSC : t; v[11] = ((1 << n) - 1) & ~(v[10] < RING_OSC ? 1 << v[10] : 0); } }
    push(); renderRing(); }, true));
  sh.appendChild(top);
  sh.appendChild(el('h4', null, 'Master — the modulator'));
  const mr = el('div', 'ringrow');
  for (let i = 0; i < n; i++) mr.appendChild(hbtn('T' + (i + 1), 'sm cy' + (val(10) === i ? ' on' : ''), () => { const v = full(); v[10] = i; v[11] &= ~(1 << i); push(); renderRing(); }, true));
  mr.appendChild(hbtn('OSC', 'sm cy' + (val(10) >= RING_OSC ? ' on' : ''), () => { full()[10] = RING_OSC; push(); renderRing(); }, true));
  sh.appendChild(mr);
  sh.appendChild(el('h4', null, 'Slaves — the tracks that get modulated'));
  const sr = el('div', 'ringrow');
  for (let i = 0; i < n; i++) { const isM = val(10) === i, b = hbtn('T' + (i + 1), 'sm' + ((val(11) >> i) & 1 ? ' on' : ''), () => { const v = full(); v[11] ^= 1 << i; push(); renderRing(); }, true); b.disabled = isM; b.title = drumTrackName(i); sr.appendChild(b); }
  sr.appendChild(hbtn('ALL', 'sm', () => { const v = full(); v[11] = ((1 << n) - 1) & ~(v[10] < RING_OSC ? 1 << v[10] : 0); push(); renderRing(); }));
  sr.appendChild(hbtn('NONE', 'sm', () => { full()[11] = 0; push(); renderRing(); }));
  sh.appendChild(sr);
  const k = el('div', 'dmknobs');
  slider(k, { knob: true, label: 'Amount', min: 0, max: 1, def: 1, get: () => val(12), set: v => { full()[12] = v; push(); }, fmt: v => Math.round(v * 100) + '%' });
  if (val(10) >= RING_OSC) { const toK = hz => Math.log(hz / 20) / Math.log(250), fromK = x2 => 20 * Math.pow(250, x2);
    slider(k, { knob: true, label: 'Osc', min: 0, max: 1, def: toK(220), get: () => toK(val(13)), set: x2 => { full()[13] = Math.round(fromK(x2) * 10) / 10; push(); }, fmt: x2 => { const hz = fromK(x2); return hz >= 1000 ? (hz / 1000).toFixed(2) + ' kHz' : hz.toFixed(0) + ' Hz'; } }); }
  sh.appendChild(k);
  const r2 = el('div', 'row prebtns');
  r2.appendChild(hbtn('COPY TO TRACK', 'sm', () => { const src = full().slice(9, 14); let c = 0; pat.tr[t].s.forEach((v, j) => { if (v && j !== s) { drumStepFull(v, DRUM_STEP_N).splice(9, 5, ...src); drumPost(drumStepMsg(d.sel, t, j, v)); paintStep(t, j); c++; } }); dirty(); toast(`Ring settings copied to ${c} step${c === 1 ? '' : 's'} on track ${t + 1}`); }));
  sh.appendChild(r2);
  sh.appendChild(el('div', 'clhelp', 'When this step plays, its slave tracks are multiplied by the master for the length of the step. A track master is level-normalised, so a quiet hat modulates as hard as a loud kick — the slaves take on its pitch and noise (clangy, bell-like, metallic). OSC uses a pure sine instead: low = tremolo, high = classic ring-mod. Amount fades between dry and fully ringed. Ringed steps show a ring mark.'));
}

(function modCSS() {
  const st = document.createElement('style');
  st.textContent = `.moddrawer{position:fixed;top:0;right:0;bottom:0;width:min(25rem,100vw);z-index:72;transform:translateX(105%);transition:transform .18s ease;pointer-events:none;display:flex;flex-direction:column}
.moddrawer.float{bottom:auto;right:auto;transition:none;transform:none;display:none;border:1px solid #3a3d44;border-radius:.55rem;box-shadow:0 12px 40px #000a;overflow:hidden;background:var(--panel)}
.moddrawer.float.open{display:flex}.moddrawer.float.mini .sheet,.moddrawer.float.mini .modgrip{display:none}
.modbar{display:flex;align-items:center;gap:.2rem;padding:.3rem .35rem .3rem .6rem;background:linear-gradient(180deg,#3a3d43,#2a2c31);cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;flex:none}
.modbar>b{font-size:.62rem;letter-spacing:.18em;color:#d8d4c8}.modbar .spacer{flex:1}.modbarchips{display:flex;gap:.2rem;flex-wrap:wrap}.modbarchips .modchip{min-width:0;padding:.22rem .4rem;font-size:.58rem}
.modbtn{background:#1b1d21;border:1px solid #444850;color:#d8d4c8;border-radius:.3rem;font-size:.66rem;min-width:1.7rem;height:1.55rem;padding:0 .3rem}
.modgrip{position:absolute;right:0;bottom:0;width:1.3rem;height:1.3rem;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 50%,#6a6f78 50% 58%,transparent 58% 70%,#6a6f78 70% 78%,transparent 78%)}
.moddrawer.left .modgrip{right:0}.moddrawer:not(.float):not(.left) .modgrip{left:0;right:auto;transform:scaleX(-1);cursor:nesw-resize}
.moddrawer .modsheet{flex:1;min-height:0;zoom:var(--mz,1)}.moddrawer .modbar{zoom:var(--mz,1)}
.moddrawer.open{transform:none;pointer-events:auto}.moddrawer.left{right:auto;left:0;transform:translateX(-105%)}.moddrawer.left.open{transform:none}
.moddrawer.open.peek{transform:translateX(calc(100% - 2.4rem));opacity:.85}.moddrawer.left.open.peek{transform:translateX(calc(-100% + 2.4rem))}
.modpick{margin:.2rem 0 .4rem;padding:.35rem .5rem;border-radius:.4rem;background:var(--mc);color:#000;font-size:.72rem;font-weight:600}.moddrawer .sheet{height:auto;max-height:none;overflow:auto;border-radius:0;margin:0;width:100%;box-shadow:none;padding:.5rem .7rem}.moddrawer:not(.float) .sheet{box-shadow:-8px 0 24px #0008}
body.moddrag .moddrawer .sheet{opacity:.88}
.modchips{display:flex;flex-wrap:wrap;gap:.35rem}.modchip{position:relative;overflow:hidden;min-width:4.6rem;padding:.45rem .55rem;border:1px solid var(--mc);border-radius:.45rem;background:#15171a;color:var(--mc);font-size:.68rem;letter-spacing:.08em;touch-action:none;cursor:grab}
.modchip b{position:relative}.modchip .modm{position:absolute;left:0;bottom:0;height:3px;width:50%;background:var(--mc)}.modchip.pick{box-shadow:0 0 0 2px var(--mc),0 0 12px var(--mc)}
.modghost{position:fixed;left:0;top:0;z-index:200;pointer-events:none;padding:.3rem .55rem;border-radius:.4rem;background:var(--mc);color:#000;font-size:.7rem;font-weight:700}
body.moddrag [data-mod-key]{outline:1px dashed #6a6f78;outline-offset:1px}body.moddrag [data-mod-key].modover{outline:2px solid #fff;background:#ffffff14}
.kcell.wired .knob{box-shadow:0 0 0 1px #ff5ad288}
.knob .kmod{position:absolute;inset:-2px;border-radius:50%;transform:rotate(var(--m,0deg));pointer-events:none;display:none;text-decoration:none}
.kcell.modlive .knob .kmod{display:block}
.knob .kmod::after{content:'';position:absolute;left:50%;top:-1px;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:var(--mc,#ff5ad2);box-shadow:0 0 6px var(--mc,#ff5ad2),0 0 2px #fff}
.modset{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:.4rem;margin-top:.4rem}
.modlfo{display:flex;align-items:center;gap:.3rem;margin:.1rem 0}.modlfo select{font-size:.66rem;max-width:5.6rem}.modlfo .modchip{min-width:3.4rem;padding:.25rem .35rem}.modlfo .kcell{width:3.8rem}.modlfo .kval{min-width:3.2rem}.modlfo .knob{width:1.8rem;height:1.8rem}.modbox{border:1px solid var(--line);border-radius:.45rem;padding:.4rem .5rem}.modbox>b{font-size:.6rem;letter-spacing:.16em;opacity:.7;display:block;margin-bottom:.25rem}
.modwires{display:flex;flex-direction:column;gap:.3rem}.modwire{display:flex;align-items:center;gap:.35rem;border-left:3px solid var(--mc);padding:.15rem .3rem;background:#ffffff06;border-radius:.3rem}
.modwire select{font-size:.66rem;max-width:6.2rem}.modwire .moddst{flex:1;font-size:.72rem}.modwire .kcell{width:3.2rem}.modwire .knob{width:1.9rem;height:1.9rem}.modarrow{opacity:.5}
.moddests{display:grid;grid-template-columns:repeat(2,1fr);gap:.3rem;margin-top:.4rem}.moddest{display:flex;justify-content:space-between;gap:.3rem;padding:.4rem .5rem;border:1px solid var(--line);border-radius:.4rem;background:var(--panel2);font-size:.72rem;text-align:left}
.moddest small{opacity:.55}.moddest.wired{border-color:#ff5ad2}
#ringModal{z-index:74}.ringsheet{width:min(34rem,96vw)}.ringrow{display:flex;flex-wrap:wrap;gap:.3rem}.ringrow .hb{min-width:2.6rem}
.dmsteps .st .srg{position:absolute;left:.2rem;top:.55rem;width:.36rem;height:.36rem;border-radius:50%;border:1.5px solid #ffb43c}`;
  document.head.appendChild(st);
})();

/* ---- NEW (0.9.1): touch and hold any dial (or the Metalise ON button) → its modulation popup: add a source (LFO 1–3,
   the envelope follower, chaos), set each wire's depth, invert or delete it — the MOD list updates with it. On the
   Metalise button the popup also has CHANCE: while ON, Metalise plays each 1/16 · 1/8 · 1/4 · bar with that chance. */
const MODLP = { t: 0, x: 0, y: 0, key: null, fired: false };
document.addEventListener('pointerdown', e => {
  if (e.button || document.body.classList.contains('moddrag')) return;
  const c = e.target.closest && e.target.closest('[data-mod-key]'); if (!c || e.target.closest('.modchip,.modpop')) return;
  MODLP.key = c.dataset.modKey; MODLP.x = e.clientX; MODLP.y = e.clientY; MODLP.fired = false; clearTimeout(MODLP.t);
  MODLP.t = setTimeout(() => { MODLP.t = 0; MODLP.fired = true; if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) { } modPopup(MODLP.key, MODLP.x, MODLP.y); }, 550);
}, true);
document.addEventListener('pointermove', e => { if (MODLP.t && Math.hypot(e.clientX - MODLP.x, e.clientY - MODLP.y) > 7) { clearTimeout(MODLP.t); MODLP.t = 0; } }, true);
['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => { clearTimeout(MODLP.t); MODLP.t = 0; }, true));
document.addEventListener('click', e => { if (MODLP.fired) { MODLP.fired = false; if (!e.target.closest('.modpop')) { e.stopPropagation(); e.preventDefault(); } } }, true);   // the hold doesn't also press the button
document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('[data-mod-key]')) e.preventDefault(); });
function modPopClose() { const p = $('#modPop'); if (p) p.remove(); }
function modPopup(key, x, y) {
  modPopClose(); const q = DRUM_PARAMS[DP_ID[key]]; if (!q) return;
  const pop = el('div', 'modpop'); pop.id = 'modPop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Modulation for ' + modDestName(key));
  const draw = () => {
    pop.innerHTML = '';
    const h = el('div', 'modpoph'); h.appendChild(el('b', null, modDestName(key).toUpperCase())); h.appendChild(el('span', 'spacer'));
    const x2 = el('button', 'cbtn', '✕'); x2.setAttribute('aria-label', 'Close'); x2.onclick = modPopClose; h.appendChild(x2); pop.appendChild(h);
    if (key === 'gl.on') pop.appendChild(el('div', 'modpopn', 'An LFO turns Metalise on while it is above the middle (or off, inverted, while the button is ON).'));
    const add = el('div', 'modpopsrc'); add.appendChild(el('span', 'klbl', 'ADD'));
    MOD_SOURCES.forEach((n, s) => { const b = el('button', 'modchip'); b.style.setProperty('--mc', MOD_COL[s]); b.appendChild(el('i', 'modm')); b.appendChild(el('b', null, n.replace('Env follower', 'ENV').toUpperCase()));
      const has = drumWires().some(w => w.s === s && w.k === key); b.disabled = has; b.title = has ? 'Already wired' : 'Add ' + n;
      b.onclick = () => { modAddWire(s, key, key === 'gl.on' ? 1 : 0.5); draw(); }; add.appendChild(b); });
    pop.appendChild(add);
    const ws = drumWires().map((w, i) => [w, i]).filter(([w]) => w.k === key);
    if (!ws.length) pop.appendChild(el('div', 'modpopn', 'No modulation yet — tap a source.'));
    ws.forEach(([w, i]) => { const r = el('div', 'modpopw'); r.style.setProperty('--mc', MOD_COL[w.s]); r.appendChild(el('b', null, MOD_SOURCES[w.s]));
      slider(r, { min: -1, max: 1, def: 0.5, label: 'Depth', get: () => w.a, set: v => { w.a = Math.round(v * 100) / 100; drumPushWires(); }, fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%' });
      r.appendChild(hbtn('INV', 'sm', () => { w.a = -w.a; drumPushWires(); dirty(); draw(); }));
      r.appendChild(hbtn('✕', 'sm', () => { modDelWire(i); draw(); })); pop.appendChild(r); });
    if (key === 'gl.on') {
      const c = el('div', 'modpopch');
      slider(c, { min: 0, max: 1, def: 0, label: 'Chance', get: () => drumVal('gl.chance'), set: v => drumSet('gl.chance', v < 0.01 ? 0 : Math.round(v * 100) / 100, true), fmt: v => v < 0.01 ? 'OFF (always)' : Math.round(v * 100) + '%' });
      const se = el('select'); se.setAttribute('aria-label', 'Chance every'); GL_CHDIVS.forEach((n, j) => { const o = new Option('every ' + n, j); if (j === Math.round(drumVal('gl.chdiv'))) o.selected = true; se.appendChild(o); });
      se.onchange = () => drumSet('gl.chdiv', +se.value); c.appendChild(se); pop.appendChild(c);
      pop.appendChild(el('div', 'modpopn', 'While ON, Metalise plays each division with this chance (fades in and out, no clicks).'));
    }
    pop.appendChild(hbtn('OPEN MOD LIST', 'sm', () => { modPopClose(); if (!modOpen()) openMod(); }));
  };
  draw(); document.body.appendChild(pop);
  const r = pop.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
  pop.style.left = Math.max(8, Math.min(W - r.width - 8, x - r.width / 2)) + 'px'; pop.style.top = Math.max(8, Math.min(H - r.height - 8, y + 18)) + 'px';
  const off = e => { if (!pop.isConnected) { document.removeEventListener('pointerdown', off, true); return; } if (!e.target.closest('.modpop')) { modPopClose(); document.removeEventListener('pointerdown', off, true); modRefresh(); if (typeof slicerOpen === 'function' && slicerOpen()) renderSlicer(); } };
  setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
}

/* ---- NEW (0.9.1): LFO DRAW — a 16-point shape you draw with a finger (the LFO's sixth shape). */
function lfoDrawEditor(i, w, h) {
  const box = el('div', 'lfodraw'); const cv = el('canvas'); cv.width = w * 2; cv.height = h * 2; cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.setAttribute('aria-label', `LFO ${i + 1} drawn shape: drag to draw`); box.appendChild(cv);
  const pts = () => drumLfoPts()[i];
  const paint = () => { const g = cv.getContext('2d'), W = cv.width, H = cv.height, p = pts(), n = p.length; g.clearRect(0, 0, W, H);
    g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, W, H); g.strokeStyle = '#2a2d33'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    g.fillStyle = MOD_COL[i] + '55'; for (let j = 0; j < n; j++) { const x0 = j * W / n, y = H / 2 - p[j] * (H / 2 - 3); g.fillRect(x0 + 1, Math.min(y, H / 2), W / n - 2, Math.abs(y - H / 2)); }
    g.strokeStyle = MOD_COL[i]; g.lineWidth = 3; g.beginPath(); for (let j = 0; j <= n; j++) { const x0 = j * W / n, y = H / 2 - p[j % n] * (H / 2 - 3); j ? g.lineTo(x0, y) : g.moveTo(x0, y); } g.stroke(); };
  let last = -1, pt = 0;
  const set = e => { const r = cv.getBoundingClientRect(), p = pts(), n = p.length, j = clamp(Math.floor((e.clientX - r.left) / r.width * n), 0, n - 1), v = Math.round(clamp(1 - 2 * (e.clientY - r.top) / r.height, -1, 1) * 100) / 100;
    if (last >= 0 && last !== j) { const a = Math.min(last, j), b = Math.max(last, j), v0 = p[last]; for (let k = a + 1; k < b; k++) p[k] = Math.round((v0 + (v - v0) * (k - last) / (j - last)) * 100) / 100; }
    p[j] = v; last = j; paint(); const now = performance.now(); if (now - pt > 40) { pt = now; drumPost(['D', i, p.slice()]); } };
  cv.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); cv.setPointerCapture(e.pointerId); last = -1; set(e); cv.onpointermove = set; });
  cv.addEventListener('pointerup', () => { cv.onpointermove = null; last = -1; drumPost(['D', i, pts().slice()]); dirty(); });
  const pre = el('div', 'lfodrawp'); const shapes = { SINE: j => Math.sin(2 * Math.PI * j / 16), RAMP: j => 1 - j / 7.5, STEPS: j => [1, .5, 0, -.5, -1, -.5, 0, .5][Math.floor(j / 2)], RANDOM: () => Math.random() * 2 - 1, FLAT: () => 0 };
  Object.entries(shapes).forEach(([n, f]) => pre.appendChild(hbtn(n, 'sm', () => { const p = pts(); for (let j = 0; j < 16; j++) p[j] = Math.round(clamp(f(j), -1, 1) * 100) / 100; paint(); drumPost(['D', i, p.slice()]); dirty(); })));
  box.appendChild(pre); requestAnimationFrame(paint);
  return box;
}
(function () { const st = document.createElement('style');
  st.textContent = `.modpop{position:fixed;z-index:9999;min-width:18rem;max-width:min(26rem,94vw);background:#16171b;border:1px solid #3a3d44;border-radius:.55rem;padding:.5rem .6rem;box-shadow:0 12px 40px rgba(0,0,0,.6);color:#e4e1d8;display:flex;flex-direction:column;gap:.4rem}
.modpoph{display:flex;align-items:center;gap:.4rem}.modpoph b{font:800 .68rem system-ui;letter-spacing:.14em}.modpoph .cbtn{padding:.1rem .45rem}
.modpopsrc{display:flex;flex-wrap:wrap;gap:.25rem;align-items:center}.modpopsrc .modchip[disabled]{opacity:.35}
.modpopw{display:flex;align-items:center;gap:.3rem;border-left:3px solid var(--mc);padding-left:.35rem}.modpopw>b{font:700 .6rem system-ui;min-width:4.6rem;color:var(--mc)}.modpopw .prow{flex:1;min-width:7rem}
.modpop .prow{display:flex;align-items:center;gap:.4rem}.modpop .prow>label{font:600 .6rem system-ui;letter-spacing:.06em;color:#9a9da4;text-transform:uppercase}.modpop .prow .pv{font:600 .7rem ui-monospace,monospace;min-width:3.4rem;white-space:nowrap;text-align:right;color:#e4e1d8}
.modpop .sl{position:relative;flex:1;height:.55rem;min-width:5rem;background:#0b0c0e;border:1px solid #33363c;border-radius:.3rem;touch-action:none;cursor:pointer}.modpop .sl>i{position:absolute;left:0;top:0;bottom:0;background:var(--mc,#ffb23d);opacity:.7;border-radius:.3rem}.modpop .sl>b{position:absolute;top:50%;width:.95rem;height:.95rem;border-radius:50%;background:#e4e1d8;box-shadow:0 1px 4px #000a;transform:translate(-50%,-50%)}.modpop .sl>em{display:none}
.modpopch{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;border-top:1px solid #2a2d33;padding-top:.35rem}.modpopch .prow{flex:1;min-width:9rem}.modpopch select{background:#0b0c0e;color:#cfe;border:1px solid #33363c;border-radius:.25rem}
.modpopn{font-size:.62rem;color:#9a9ea6;line-height:1.4}
button.wired,.hbtn.wired{box-shadow:0 0 0 2px #3fd7ff99,0 0 8px #3fd7ff66!important}
.knob{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
.lfodraw{display:flex;flex-direction:column;gap:.25rem}.lfodraw canvas{border:1px solid #2a2d33;border-radius:.3rem;touch-action:none;cursor:crosshair}.lfodrawp{display:flex;flex-wrap:wrap;gap:.2rem}.lfodrawp button{font-size:.5rem!important;padding:.1rem .3rem!important}`;
  document.head.appendChild(st); })();
