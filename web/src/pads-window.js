/* ============================================================ Vektur Drum — NEW (0.8): the PADS window
   ⤢ on PERFORMANCE opens the pads in a window of their own: drag the title bar to move it, the corner to resize it,
   ⛶ to fill the screen. The pads grow with the window (rows and columns follow its shape), play with velocity from
   where they are hit (higher = harder), several at once (multi-touch), and light with the engine like the panel's pads.
   Position and size are remembered on this device. */
const PADW = { pads: [], geo: null };
const PADGEO_KEY = 'vekturdrum.padwin.v1';
PADW.geo = (() => { const d = { x: null, y: 80, w: 420, h: 420, full: false };
  try { const o = JSON.parse(localStorage.getItem(PADGEO_KEY) || 'null'); if (o && typeof o === 'object') Object.assign(d, o); } catch (e) { } return d; })();
function padGeoSave() { try { localStorage.setItem(PADGEO_KEY, JSON.stringify(PADW.geo)); } catch (e) { } }
function padWinOpen() { const m = $('#padWin'); return !!(m && m.classList.contains('open')); }
function padGeoApply() {
  const m = $('#padWin'); if (!m) return; const g = PADW.geo, vw = innerWidth, vh = innerHeight;
  g.w = clamp(+g.w || 420, 220, vw); g.h = clamp(+g.h || 420, 200, vh);
  if (g.x == null) g.x = Math.max(8, (vw - g.w) / 2); g.x = clamp(g.x, -g.w + 80, vw - 80); g.y = clamp(g.y, 0, vh - 40);
  m.classList.toggle('full', !!g.full);
  if (g.full) { m.style.left = m.style.top = '0px'; m.style.width = vw + 'px'; m.style.height = vh + 'px'; }
  else { m.style.left = g.x + 'px'; m.style.top = g.y + 'px'; m.style.width = g.w + 'px'; m.style.height = g.h + 'px'; }
  padLayout();
}
/** Rows × columns that keep the pads closest to square in the window's shape. */
function padLayout() {
  const m = $('#padWin'), gr = m && m.querySelector('.padwgrid'); if (!gr) return;
  const n = PADW.pads.length || 1, W = gr.clientWidth || 300, H = gr.clientHeight || 300;
  let best = [3, 3], bs = -1;
  for (let c = 1; c <= n; c++) { const r = Math.ceil(n / c), s = Math.min(W / c, H / r); if (s > bs) { bs = s; best = [c, r]; } }
  gr.style.gridTemplateColumns = `repeat(${best[0]},1fr)`; gr.style.gridTemplateRows = `repeat(${best[1]},1fr)`;
  gr.style.setProperty('--pz', clamp(bs / 90, .8, 3.2).toFixed(2));
}
function padWinModal() {
  let m = $('#padWin'); if (m) return m;
  m = el('div', 'padwin'); m.id = 'padWin';
  const bar = el('div', 'padwbar'); bar.appendChild(el('b', null, 'PADS'));
  const vel = el('span', 'padwvel'); bar.appendChild(vel); bar.appendChild(el('span', 'spacer'));
  const btn = (txt, title, f) => { const b = el('button', 'modbtn', txt); b.title = title; b.onclick = e => { e.stopPropagation(); f(); }; bar.appendChild(b); return b; };
  btn('⛶', 'Fill the screen (tap again to go back)', () => { PADW.geo.full = !PADW.geo.full; padGeoApply(); padGeoSave(); });
  btn('✕', 'Close', closePadWin);
  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || PADW.geo.full) return;
    e.preventDefault(); const g = PADW.geo, x0 = e.clientX - g.x, y0 = e.clientY - g.y; bar.setPointerCapture(e.pointerId);
    bar.onpointermove = ev => { g.x = ev.clientX - x0; g.y = ev.clientY - y0; padGeoApply(); };
    bar.onpointerup = bar.onpointercancel = () => { bar.onpointermove = null; padGeoSave(); };
  });
  m.appendChild(bar); m.appendChild(el('div', 'padwgrid'));
  const grip = el('div', 'modgrip'); grip.title = 'Drag to resize';
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); const g = PADW.geo; if (g.full) return; const w0 = g.w, h0 = g.h, x0 = e.clientX, y0 = e.clientY; grip.setPointerCapture(e.pointerId);
    grip.onpointermove = ev => { g.w = w0 + ev.clientX - x0; g.h = h0 + ev.clientY - y0; padGeoApply(); };
    grip.onpointerup = grip.onpointercancel = () => { grip.onpointermove = null; padGeoSave(); };
  });
  m.appendChild(grip);
  addEventListener('resize', () => { if (padWinOpen()) padGeoApply(); });
  document.body.appendChild(m); return m;
}
function renderPadWin() {
  const m = $('#padWin'); if (!m) return; const gr = m.querySelector('.padwgrid'), d = drumState(); gr.innerHTML = ''; PADW.pads = [];
  for (let t = 0; t < d.ntr; t++) {
    const p = el('div', 'pad padw' + (t === DRM.trk ? ' sel' : '')); p.append(el('b', null, String(t + 1)), el('i'), el('span', null, drumTrackName(t)));
    p.setAttribute('role', 'button'); p.setAttribute('aria-label', `Pad ${t + 1}, ${drumTrackName(t)}`);
    p.addEventListener('pointerdown', e => {
      e.preventDefault(); audioEnsure();
      const r = p.getBoundingClientRect(), v = 50 + 77 * clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
      drumHit(t, v); p.classList.add('down'); const vl = m.querySelector('.padwvel'); if (vl) vl.textContent = 'VEL ' + Math.round(v);
      if (DRM.trk !== t) { DRM.trk = t; renderDrumSound(); (DRM.els.pads || []).forEach((x, i) => x.classList.toggle('sel', i === t)); (DRM.els.names || []).forEach((x, i) => x.classList.toggle('sel', i === t)); PADW.pads.forEach((x, i) => x.classList.toggle('sel', i === t)); }
    });
    const up = () => p.classList.remove('down'); p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up); p.addEventListener('pointerleave', up);
    gr.appendChild(p); PADW.pads.push(p);
  }
  padLayout();
}
function openPadWin() { const m = padWinModal(); m.classList.add('open'); renderPadWin(); padGeoApply(); }
function closePadWin() { const m = $('#padWin'); if (m) m.classList.remove('open'); PADW.pads = []; }
(function padWinCSS() {
  const st = document.createElement('style');
  st.textContent = `.padwin{position:fixed;z-index:74;display:none;flex-direction:column;border:1px solid #3a3d44;border-radius:.55rem;box-shadow:0 12px 40px #000a;overflow:hidden;background:linear-gradient(180deg,#1d1f23,#141518)}
.padwin.open{display:flex}.padwin.full{border-radius:0}.padwin.full .modgrip{display:none}
.padwbar{display:flex;align-items:center;gap:.3rem;padding:.3rem .35rem .3rem .6rem;background:linear-gradient(180deg,#3a3d43,#2a2c31);cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;flex:none}
.padwbar>b{font-size:.62rem;letter-spacing:.18em;color:#d8d4c8}.padwbar .spacer{flex:1}.padwvel{font:600 .58rem system-ui;letter-spacing:.12em;color:var(--led)}
.padwgrid{flex:1;min-height:0;display:grid;gap:calc(.35rem * var(--pz,1));padding:calc(.4rem * var(--pz,1)) calc(.4rem * var(--pz,1)) 1.4rem}
.padwgrid .pad{aspect-ratio:auto;min-height:0;font-size:calc(.85rem * var(--pz,1))}
.padwgrid .pad b,.padwgrid .pad span{font-size:calc(.62rem * var(--pz,1))}.padwgrid .pad i{height:calc(.22rem * var(--pz,1))}`;
  document.head.appendChild(st);
})();
