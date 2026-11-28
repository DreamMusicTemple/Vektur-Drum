/* ============================================================ Vektur Drum — NEW (0.8): dial designs (SETTINGS → APPEARANCE)
   Classic (Vektur Drum), six from Vektur Vocal — Machined, Chrome, Wood, Mecha, Porcelain, Blueprint (its SVG bodies and
   pointers) — and four from Vektur Vortex — Interstellar, Aqua, Scientific, Holo ring (its canvas pots). Code from those
   apps, by Dream Music Temple. A dial is only redrawn when its value changes, so the designs cost nothing while idle. */
const DIAL_STYLES = [['classic', 'Classic', 'Drum'], ['machined', 'Machined', 'Vocal'], ['chrome', 'Chrome', 'Vocal'], ['wood', 'Wood', 'Vocal'],
  ['mecha', 'Mecha', 'Vocal'], ['porcelain', 'Porcelain', 'Vocal'], ['blueprint', 'Blueprint', 'Vocal'],
  ['interstellar', 'Interstellar', 'Vortex'], ['aqua', 'Aqua', 'Vortex'], ['scientific', 'Scientific', 'Vortex'], ['holo', 'Holo ring', 'Vortex']];
const DIAL_SVG = ['machined', 'chrome', 'wood', 'mecha', 'porcelain', 'blueprint'], DIAL_CANVAS = ['interstellar', 'aqua', 'scientific', 'holo'];
// Vektur Vocal's knob colours per design (its themes' --knob-* values)
const DIAL_VARS = {
  machined: '--knob-rim:#3a3e48;--knob-body:#1c1e25;--knob-cap-top:#4d4d4d;--knob-cap:#2b2e36;--knob-cap-bot:#141414;--knob-pointer:#E8ECF4',
  chrome: '--knob-rim:#C9CDD3;--knob-body:#8E949C;--knob-cap-top:#EEF0F2;--knob-cap:#B5BAC1;--knob-cap-bot:#6E747C;--knob-pointer:#111214',
  wood: '--knob-rim:#A06A3E;--knob-body:#5C3A20;--knob-cap-top:#9a6a40;--knob-cap:#7A4E2C;--knob-cap-bot:#3e2614;--knob-pointer:#F4E8D0',
  mecha: '--knob-rim:#C9D2E0;--knob-body:#6E7890;--knob-cap-top:#c4ccda;--knob-cap:#A8B2C4;--knob-cap-bot:#5a6378;--knob-pointer:#7CFF4F;--cyan:#22E4FF',
  porcelain: '--knob-rim:#FFFFFF;--knob-body:#E2E8EE;--knob-cap-top:#fff;--knob-cap:#FAFCFD;--knob-cap-bot:#c9d1da;--knob-pointer:#1B2531;--border:#9aa7b5',
  blueprint: '--knob-rim:#FFFFFF;--knob-body:#1A4B8D;--knob-cap-top:#2a62ad;--knob-cap:#1C5097;--knob-cap-bot:#123a70;--knob-pointer:#FFFFFF',
};
const DIAL = { style: 'interstellar', color: '#ffb23d' };
function dialInit() {
  DIAL.style = DIAL_STYLES.some(d => d[0] === PREFS.dial) ? PREFS.dial : 'interstellar';   // 0.9.1: Interstellar is the default design
  try { DIAL.color = themeOf().arc; } catch (e) { }
  if (!document.getElementById('vdKnobDefs')) document.body.insertAdjacentHTML('beforeend', DIAL_DEFS);
  const defs = document.getElementById('vdKnobDefs'); defs.setAttribute('style', 'position:absolute;width:0;height:0;' + (DIAL_VARS[DIAL.style] || DIAL_VARS.machined));
  DIAL_STYLES.forEach(d => document.body.classList.toggle('dial-' + d[0], d[0] === DIAL.style));
  document.body.classList.toggle('dialx', DIAL.style !== 'classic');
}
function dialSet(style) { PREFS.dial = style; prefsSave(); dialInit(); if (typeof drumsOpen === 'function' && drumsOpen()) renderDrums(); }
const SVGNS = 'http://www.w3.org/2000/svg';
/** Called by every dial when it repaints (helpers.js knobCtl). t = 0…1, c = the bipolar centre. */
function dialPaint(k, t, c, bip) {
  const st = DIAL.style; if (st === 'classic') return;
  if (DIAL_SVG.includes(st)) {
    let s = k._dsv;
    if (!s || s._st !== st) {
      if (k._dcv) { k._dcv.remove(); k._dcv = null; } if (s) s.remove();
      s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', '0 0 66 66'); s.setAttribute('class', 'kv'); s._st = st; s._ticks = [];
      for (let i = 0; i <= 30; i++) {   // Vektur Vocal: a printed scale of 31 notches, lit up to the value
        const a = (135 + 270 * i / 30) * Math.PI / 180, major = i % 5 === 0, r1 = 24, r2 = 21 + (major ? 9 : 6.5);
        const ln = document.createElementNS(SVGNS, 'line');
        ln.setAttribute('x1', 33 + r1 * Math.cos(a)); ln.setAttribute('y1', 33 + r1 * Math.sin(a)); ln.setAttribute('x2', 33 + r2 * Math.cos(a)); ln.setAttribute('y2', 33 + r2 * Math.sin(a));
        ln.setAttribute('stroke-width', major ? 1.8 : 1.1); ln.setAttribute('stroke-linecap', 'round'); s.appendChild(ln); s._ticks.push([ln, i / 30]);
      }
      const use = document.createElementNS(SVGNS, 'use'); use.setAttribute('href', '#vkb-' + st); s.appendChild(use);
      const g = document.createElementNS(SVGNS, 'g'); g.innerHTML = DIAL_PTR[st]; s.appendChild(g); s._ptr = g;
      k.appendChild(s); k._dsv = s;
    }
    s._ptr.setAttribute('transform', `rotate(${(135 + 270 * t).toFixed(1)} 33 33)`);
    const lo = Math.min(t, c), hi = Math.max(t, c), col = DIAL.color;
    for (const [ln, u] of s._ticks) { const on = u >= lo - 1e-6 && u <= hi + 1e-6 && (bip || u <= t + 1e-6); ln.setAttribute('stroke', on ? col : 'rgba(255,255,255,.16)'); }
    return;
  }
  let cv = k._dcv;
  if (!cv || cv._st !== st) {
    if (k._dsv) { k._dsv.remove(); k._dsv = null; } if (cv) cv.remove();
    cv = document.createElement('canvas'); cv.className = 'kv'; cv._st = st; k.appendChild(cv); k._dcv = cv;
  }
  const px = Math.max(24, Math.round((k.clientWidth || 37) * 1.3)), dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(px * dpr);
  if (cv.width !== W) { cv.width = W; cv.height = W; }
  const cx = cv.getContext('2d'); cx.clearRect(0, 0, W, W);
  (POT_DRAW[st] || POT_DRAW.interstellar)(cx, W, W, t, { color: DIAL.color, dragging: k.classList.contains('turn'), anim: false, time: 0 });
}
// pointers (Vektur Vocal), drawn along +x, rotated into place
const DIAL_PTR = {
  machined: '<line x1="37" y1="33" x2="47.3" y2="33" style="stroke:var(--knob-pointer,#E8ECF4)" stroke-width="2.2" stroke-linecap="round"/><circle cx="51.3" cy="33" r="2.3" class="kpc"/>',
  chrome: '<line x1="35.3" y1="33" x2="53" y2="33" style="stroke:#111214" stroke-width="2.4"/>',
  wood: '<line x1="37.2" y1="33" x2="51.9" y2="33" style="stroke:#F4E8D0" stroke-width="3" stroke-linecap="round"/><circle cx="51.9" cy="33" r="2" class="kpc"/>',
  mecha: '<polygon points="47.8,33 36,29.6 36,36.4" style="fill:#7CFF4F" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>',
  blueprint: '<line x1="33" y1="33" x2="53" y2="33" stroke="#fff" stroke-width="1.4"/><circle cx="46" cy="33" r="2.4" fill="none" stroke="#fff" stroke-width="1"/><circle cx="46" cy="33" r="1" class="kpc"/>',
  porcelain: '<circle cx="43.9" cy="33" r="3" class="kpc"/>',
};
// ---- Vektur Vortex pots (canvas), from its POT_DRAW, plus its default Interstellar dial
const POT_DRAW = (() => {
  const TAU = Math.PI * 2, A0 = 0.75 * Math.PI, SW = 1.5 * Math.PI;
  const knobRGB = c => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c || ''); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 178, 61]; };
  const rgbOf = (c) => { const L = knobRGB(c); return (a) => 'rgba(' + L[0] + ',' + L[1] + ',' + L[2] + ',' + a + ')'; };
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const shadowOn = (cx, w, a) => { cx.shadowColor = 'rgba(0,0,0,' + a + ')'; cx.shadowBlur = w * 0.045; cx.shadowOffsetX = 0; cx.shadowOffsetY = w * 0.032; };
  const shadowOff = (cx) => { cx.shadowColor = 'transparent'; cx.shadowBlur = 0; cx.shadowOffsetY = 0; };
  const topLight = (cx, cxm, cym, R, a) => { const g = cx.createLinearGradient(0, cym - R, 0, cym + R * 0.6); g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(0.45, 'rgba(255,255,255,' + (a * 0.15) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)'); return g; };
    // ---------- AQUA: a ring of liquid held together by surface tension - it bulges toward the value and sheds a droplet while dragged
    function aqua(cx, w, h, t, o){
      const cxm = w/2, cym = h/2, R0 = w*0.375, tk = w*0.085, N = 96, va = A0 + t*SW, time = o.anim ? o.time : 0;
      const wob = (a) => Math.sin(a*3 + time*1.3)*w*0.0028 + Math.sin(a*5 - time*1.9)*w*0.002 + Math.sin(a*8 + time*2.7)*w*0.0013;
      const bump = (a) => { let d = Math.atan2(Math.sin(a - va), Math.cos(a - va)); return Math.exp(-d*d/0.12)*w*0.034 + Math.exp(-d*d/0.9)*w*0.008; };   // meniscus pulled up toward the pointer
      const ring = new Path2D(), outer = [], inner = [];
      for (let i = 0; i <= N; i++){ const a = i/N*TAU, b = bump(a), wv = wob(a); outer.push([cxm + Math.cos(a)*(R0 + tk/2 + wv + b), cym + Math.sin(a)*(R0 + tk/2 + wv + b)]); inner.push([cxm + Math.cos(a)*(R0 - tk/2 + wv*0.6 + b*0.45), cym + Math.sin(a)*(R0 - tk/2 + wv*0.6 + b*0.45)]); }
      outer.forEach((p, i) => i ? ring.lineTo(p[0], p[1]) : ring.moveTo(p[0], p[1])); ring.closePath();
      inner.forEach((p, i) => i ? ring.lineTo(p[0], p[1]) : ring.moveTo(p[0], p[1])); ring.closePath();
      // centre well: dark glass with a lit rim
      cx.save(); shadowOn(cx, w, 0.42); cx.fillStyle = 'rgba(10,22,32,0.92)'; cx.beginPath(); cx.arc(cxm, cym, w*0.27, 0, TAU); cx.fill(); cx.restore();
      cx.strokeStyle = topLight(cx, cxm, cym, w*0.27, 0.55); cx.lineWidth = Math.max(1, w*0.012); cx.beginPath(); cx.arc(cxm, cym, w*0.27 - cx.lineWidth/2, 0, TAU); cx.stroke();
      // the water body (semi-transparent) with its own cast shadow
      cx.save(); shadowOn(cx, w, 0.32); const wg = cx.createLinearGradient(0, cym-R0-tk, 0, cym+R0+tk); wg.addColorStop(0, 'rgba(150,225,255,0.55)'); wg.addColorStop(0.5, 'rgba(60,160,215,0.38)'); wg.addColorStop(1, 'rgba(20,90,150,0.45)');
      cx.fillStyle = wg; cx.fill(ring, 'evenodd'); cx.restore();
      cx.save(); cx.clip(ring, 'evenodd');
      // flowing streaks inside the water
      for (let k = 0; k < 18; k++){ const rr = R0 - tk*0.4 + tk*0.8*hash(k+1), a0 = hash(k+20)*TAU + time*(0.25 + hash(k+40)*0.5)*(k%2 ? 1 : -1), ln = 0.5 + hash(k+60)*1.1;
        cx.strokeStyle = 'rgba(225,250,255,'+(0.2 + hash(k+80)*0.35).toFixed(2)+')'; cx.lineWidth = Math.max(0.7, w*(0.004 + hash(k+95)*0.006)); cx.beginPath(); cx.arc(cxm, cym, rr, a0, a0 + ln); cx.stroke(); }
      // the part of the ring that is "filled" up to the value glows
      const L = rgbOf(o.color); cx.strokeStyle = L(0.55); cx.lineWidth = tk*1.3; cx.shadowColor = L(0.9); cx.shadowBlur = w*0.05; cx.beginPath(); cx.arc(cxm, cym, R0, A0, va); cx.stroke();
      cx.restore();
      // surface highlights: bright on the upper rim (light from above), faint dark on the lower
      cx.save(); cx.strokeStyle = (() => { const g = cx.createLinearGradient(0, cym-R0-tk, 0, cym+R0+tk); g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.4, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,30,60,0.35)'); return g; })();
      cx.lineWidth = Math.max(1, w*0.011); cx.stroke(ring); cx.restore();
      // droplets held near the surface by tension
      for (let k = 0; k < 7; k++){ const a = hash(k+3)*TAU, d = R0 + tk*0.7 + w*0.012 + hash(k+9)*w*0.028, rr = w*(0.007 + hash(k+15)*0.01), x = cxm + Math.cos(a)*d, y = cym + Math.sin(a)*d;
        cx.fillStyle = 'rgba(170,230,255,0.45)'; cx.beginPath(); cx.arc(x, y, rr, 0, TAU); cx.fill(); cx.fillStyle = 'rgba(255,255,255,0.75)'; cx.beginPath(); cx.arc(x - rr*0.3, y - rr*0.35, rr*0.38, 0, TAU); cx.fill(); }
      // the pointer bead: a drop riding the crest; it stretches away from the ring while the dial is being dragged
      const sx = Math.cos(va), sy = Math.sin(va), br = tk*(o.dragging ? 0.62 : 0.52), bd = R0 + (o.dragging ? tk*0.1 : 0), bx = cxm + sx*bd, by = cym + sy*bd;
      cx.save(); shadowOn(cx, w, 0.4); const bg = cx.createRadialGradient(bx - br*0.3, by - br*0.4, br*0.1, bx, by, br); bg.addColorStop(0, 'rgba(255,255,255,0.95)'); bg.addColorStop(0.5, L(0.75)); bg.addColorStop(1, 'rgba(20,100,170,0.7)');
      cx.fillStyle = bg; cx.beginPath(); cx.arc(bx, by, br, 0, TAU); cx.fill(); cx.restore();
      if (o.dragging){ cx.strokeStyle = L(0.6); cx.lineWidth = Math.max(1.2, w*0.014); cx.beginPath(); cx.moveTo(cxm + sx*(R0 - tk*0.3), cym + sy*(R0 - tk*0.3)); cx.lineTo(bx, by); cx.stroke(); }   // the neck of the drop
      // scale marks
      cx.fillStyle = 'rgba(190,230,245,0.55)'; for (const u of [0, 0.5, 1]){ const a = A0 + u*SW, x = cxm + Math.cos(a)*w*0.475, y = cym + Math.sin(a)*w*0.475; cx.beginPath(); cx.arc(x, y, Math.max(1, w*0.01), 0, TAU); cx.fill(); }
    }
    // ---------- SCIENTIFIC: machined instrument knob - engraved scale, vernier, knurled skirt, jewelled cap, trim LED arc
    function tech(cx, w, h, t, o){
      const cxm = w/2, cym = h/2, va = A0 + t*SW, L = rgbOf(o.color), big = w >= 96;
      // bezel plate
      cx.save(); shadowOn(cx, w, 0.45);
      let bz; if (cx.createConicGradient){ bz = cx.createConicGradient(-Math.PI/2, cxm, cym); [[0,'#9aa3ad'],[0.18,'#4a525b'],[0.38,'#aab3bd'],[0.6,'#3c434b'],[0.8,'#9aa3ad'],[1,'#9aa3ad']].forEach(([p,c]) => bz.addColorStop(p, c)); } else bz = '#6b737c';
      cx.fillStyle = bz; cx.beginPath(); cx.arc(cxm, cym, w*0.47, 0, TAU); cx.fill(); cx.restore();
      cx.fillStyle = topLight(cx, cxm, cym, w*0.47, 0.45); cx.beginPath(); cx.arc(cxm, cym, w*0.47, 0, TAU); cx.fill();
      // dark scale ring
      cx.fillStyle = '#0b1117'; cx.beginPath(); cx.arc(cxm, cym, w*0.44, 0, TAU); cx.fill();
      cx.strokeStyle = 'rgba(0,0,0,0.7)'; cx.lineWidth = Math.max(1, w*0.01); cx.beginPath(); cx.arc(cxm, cym, w*0.445, 0, TAU); cx.stroke();
      // engraved scale: 0..100 (50 minor ticks, 10 majors with numerals) and, when large enough, a 200 division vernier track
      for (let i = 0; i <= 50; i++){ const u = i/50, a = A0 + u*SW, major = i % 5 === 0, r1 = w*0.44, r2 = w*(major ? 0.375 : 0.405), c = Math.cos(a), s = Math.sin(a);
        cx.strokeStyle = major ? 'rgba(230,240,250,0.9)' : 'rgba(180,200,215,0.55)'; cx.lineWidth = Math.max(0.8, w*(major ? 0.012 : 0.007)); cx.beginPath(); cx.moveTo(cxm + c*r1, cym + s*r1); cx.lineTo(cxm + c*r2, cym + s*r2); cx.stroke();
        if (major && big && i % 10 === 0){ cx.fillStyle = 'rgba(215,230,242,0.85)'; cx.font = (w*0.06).toFixed(0)+'px monospace'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(String(i*2), cxm + c*w*0.345, cym + s*w*0.345); } }
      if (big) for (let i = 0; i <= 200; i++){ if (i % 4 === 0) continue; const a = A0 + i/200*SW; cx.strokeStyle = 'rgba(120,150,170,0.4)'; cx.lineWidth = 0.6; cx.beginPath(); cx.moveTo(cxm + Math.cos(a)*w*0.44, cym + Math.sin(a)*w*0.44); cx.lineTo(cxm + Math.cos(a)*w*0.428, cym + Math.sin(a)*w*0.428); cx.stroke(); }
      // trim LED arc (value)
      cx.save(); cx.strokeStyle = L(0.95); cx.lineWidth = Math.max(1.5, w*0.018); cx.shadowColor = L(0.9); cx.shadowBlur = w*0.04; cx.lineCap = 'round'; cx.beginPath(); cx.arc(cxm, cym, w*0.46, A0, va); cx.stroke(); cx.restore();
      // knurled skirt (40 teeth)
      const Rk = w*0.30, teeth = 40; cx.save(); shadowOn(cx, w, 0.55); const sk = new Path2D();
      for (let i = 0; i < teeth*2; i++){ const a = i/(teeth*2)*TAU, r = (i % 2 ? Rk*0.955 : Rk); i ? sk.lineTo(cxm + Math.cos(a)*r, cym + Math.sin(a)*r) : sk.moveTo(cxm + Math.cos(a)*r, cym + Math.sin(a)*r); } sk.closePath();
      let kg; if (cx.createConicGradient){ kg = cx.createConicGradient(-Math.PI/2 - va + A0, cxm, cym); [[0,'#c9d0d8'],[0.12,'#5d656e'],[0.3,'#b9c1c9'],[0.5,'#444b53'],[0.7,'#b9c1c9'],[0.88,'#5d656e'],[1,'#c9d0d8']].forEach(([p,c]) => kg.addColorStop(p, c)); } else kg = '#8a929a';
      cx.fillStyle = kg; cx.fill(sk); cx.restore();
      cx.fillStyle = topLight(cx, cxm, cym, Rk, 0.5); cx.fill(sk);
      cx.strokeStyle = 'rgba(0,0,0,0.5)'; cx.lineWidth = 0.8; cx.stroke(sk);
      // engraved concentric rings + jewelled cap
      for (const [rr, al] of [[0.255, 0.55], [0.225, 0.35]]){ cx.strokeStyle = 'rgba(0,0,0,'+al+')'; cx.lineWidth = Math.max(0.8, w*0.008); cx.beginPath(); cx.arc(cxm, cym, w*rr, 0, TAU); cx.stroke(); cx.strokeStyle = 'rgba(255,255,255,'+(al*0.35)+')'; cx.beginPath(); cx.arc(cxm, cym, w*rr + w*0.008, Math.PI*1.05, Math.PI*1.95); cx.stroke(); }
      const cg = cx.createRadialGradient(cxm, cym - w*0.08, w*0.01, cxm, cym, w*0.2); cg.addColorStop(0, '#f1f5f9'); cg.addColorStop(0.45, '#8e98a2'); cg.addColorStop(1, '#2d343b'); cx.fillStyle = cg; cx.beginPath(); cx.arc(cxm, cym, w*0.2, 0, TAU); cx.fill();
      cx.strokeStyle = 'rgba(0,0,0,0.55)'; cx.lineWidth = 1; cx.beginPath(); cx.arc(cxm, cym, w*0.2, 0, TAU); cx.stroke();
      cx.strokeStyle = 'rgba(20,30,40,0.55)'; cx.lineWidth = 0.8; cx.beginPath(); cx.moveTo(cxm - w*0.07, cym); cx.lineTo(cxm + w*0.07, cym); cx.moveTo(cxm, cym - w*0.07); cx.lineTo(cxm, cym + w*0.07); cx.stroke();
      // index line on the skirt + triangular pointer on the scale
      cx.save(); cx.translate(cxm, cym); cx.rotate(va); cx.strokeStyle = L(1); cx.lineWidth = Math.max(1.6, w*0.022); cx.lineCap = 'round'; cx.shadowColor = L(0.8); cx.shadowBlur = w*0.025; cx.beginPath(); cx.moveTo(w*0.215, 0); cx.lineTo(w*0.285, 0); cx.stroke(); cx.shadowColor = 'transparent';
      cx.fillStyle = '#ffffff'; cx.beginPath(); cx.moveTo(w*0.372, 0); cx.lineTo(w*0.41, -w*0.022); cx.lineTo(w*0.41, w*0.022); cx.closePath(); cx.fill(); cx.restore();
      // corner screws
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]){ const x = cxm + dx*w*0.405, y = cym + dy*w*0.405; if (Math.hypot(dx, dy)*w*0.405 > w*0.47 - w*0.02) continue; }
    }
    // ---------- HOLO RING: glass dial with segmented concentric rings, a growing LED arc and a white index bar
    function holo(cx, w, h, t, o){
      const cxm = w/2, cym = h/2, va = A0 + t*SW, L = rgbOf(o.color);
      // dark glass plate with cast shadow
      cx.save(); shadowOn(cx, w, 0.4); const pg = cx.createRadialGradient(cxm, cym - w*0.12, w*0.05, cxm, cym, w*0.43); pg.addColorStop(0, 'rgba(8,26,36,0.9)'); pg.addColorStop(1, 'rgba(2,10,16,0.92)');
      cx.fillStyle = pg; cx.beginPath(); cx.arc(cxm, cym, w*0.43, 0, TAU); cx.fill(); cx.restore();
      cx.strokeStyle = topLight(cx, cxm, cym, w*0.43, 0.5); cx.lineWidth = Math.max(1, w*0.012); cx.beginPath(); cx.arc(cxm, cym, w*0.43, 0, TAU); cx.stroke();
      // concentric segmented rings (the glowing tick bands)
      const bands = [[0.40, 0.020, [w*0.025, w*0.012], 0.45], [0.355, 0.034, [w*0.012, w*0.012], 0.30], [0.305, 0.018, [w*0.03, w*0.01], 0.4]];
      cx.save(); bands.forEach(([r, lw, dash, al], bi) => { cx.lineWidth = w*lw; cx.setLineDash(dash); cx.lineDashOffset = -bi*w*0.01; cx.strokeStyle = L(al); cx.beginPath(); cx.arc(cxm, cym, w*r, 0, TAU); cx.stroke(); }); cx.restore();
      cx.strokeStyle = L(0.55); cx.lineWidth = Math.max(0.8, w*0.007); for (const r of [0.42, 0.285, 0.265]){ cx.beginPath(); cx.arc(cxm, cym, w*r, 0, TAU); cx.stroke(); }
      // lit portion of the middle band
      cx.save(); cx.strokeStyle = L(0.95); cx.lineWidth = w*0.034; cx.shadowColor = L(0.9); cx.shadowBlur = w*0.05; cx.setLineDash([w*0.012, w*0.012]); cx.beginPath(); cx.arc(cxm, cym, w*0.355, A0, va); cx.stroke(); cx.restore();
      // inner glass disc
      const ig = cx.createLinearGradient(0, cym - w*0.24, 0, cym + w*0.24); ig.addColorStop(0, 'rgba(255,255,255,0.10)'); ig.addColorStop(1, 'rgba(0,0,0,0.3)'); cx.fillStyle = ig; cx.beginPath(); cx.arc(cxm, cym, w*0.25, 0, TAU); cx.fill();
      // outer LED dots, sizes growing clockwise, lit up to the value
      const nD = 15, ringR = w*0.465; for (let i = 0; i < nD; i++){ const u = i/(nD-1), a = A0 + u*SW, x = cxm + Math.cos(a)*ringR, y = cym + Math.sin(a)*ringR, rr = w*(0.012 + 0.024*u), lit = u <= t + 0.001;
        if (lit){ cx.save(); cx.shadowColor = L(0.95); cx.shadowBlur = w*0.05; cx.fillStyle = L(0.95); cx.beginPath(); cx.arc(x, y, rr, 0, TAU); cx.fill(); cx.restore(); cx.fillStyle = 'rgba(255,255,255,0.7)'; cx.beginPath(); cx.arc(x - rr*0.2, y - rr*0.3, rr*0.4, 0, TAU); cx.fill(); }
        else { cx.fillStyle = L(0.22); cx.beginPath(); cx.arc(x, y, rr*0.85, 0, TAU); cx.fill(); } }
      // fixed index at 12 o'clock and the moving white bar
      cx.fillStyle = 'rgba(255,255,255,0.9)'; cx.fillRect(cxm - w*0.007, cym - w*0.425, w*0.014, w*0.05);
      cx.save(); cx.translate(cxm, cym); cx.rotate(va); cx.shadowColor = L(0.95); cx.shadowBlur = w*0.045; cx.fillStyle = '#f5fbff'; const bl = w*0.17, bw = w*0.042;
      if (cx.roundRect){ cx.beginPath(); cx.roundRect(w*0.2, -bw/2, bl, bw, bw/2); cx.fill(); } else cx.fillRect(w*0.2, -bw/2, bl, bw); cx.restore();
    }
  function interstellar(cx, w, h, t, o) {
    const cxm = w / 2, cym = h / 2, L = knobRGB(o.color), rgba = (al) => 'rgba(' + L[0] + ',' + L[1] + ',' + L[2] + ',' + al + ')';
    const nDots = 15, minR = Math.max(1.2, w * 0.011), maxR = Math.max(3.6, w * 0.047), ringR = w / 2 - maxR - 1;
    const ptAt = (u) => { const an = (135 + 270 * u) * Math.PI / 180; return [cxm + ringR * Math.cos(an), cym + ringR * Math.sin(an)]; };
    const dot = (p, rr, fill) => { cx.fillStyle = fill; cx.beginPath(); cx.arc(p[0], p[1], rr, 0, Math.PI * 2); cx.fill(); };
    const pos = t * (nDots - 1);
    for (let i = 0; i < nDots; i++) {
      const u = i / (nDots - 1), reveal = Math.min(1, Math.max(0, pos - i + 1)), p = ptAt(u);
      dot(p, minR * 0.8, 'rgba(255,255,255,0.13)');
      if (reveal <= 0) continue;
      const rr = minR * 0.8 + (minR + (maxR - minR) * Math.pow(u, 1.15) - minR * 0.8) * reveal;
      if (o.dragging || u > 0.7) dot(p, rr * 2.1, rgba((0.10 * reveal * (o.dragging ? 1.6 : 1)).toFixed(3)));
      dot(p, rr, rgba(((0.45 + 0.55 * u) * reveal).toFixed(3)));
      dot(p, rr * 0.62, 'rgba(255,255,255,' + (u * 0.75 * reveal).toFixed(3) + ')');
    }
    const skirtIn = w * 0.15, skR = w / 2 - skirtIn;
    cx.save(); cx.shadowColor = 'rgba(0,0,0,0.8)'; cx.shadowBlur = w * 0.07; cx.shadowOffsetY = w * 0.06;
    let sk; if (cx.createConicGradient) { sk = cx.createConicGradient(-Math.PI / 2, cxm, cym); [[0, 0.30], [0.25, 0.11], [0.5, 0.26], [0.75, 0.09], [1, 0.30]].forEach(([q, g]) => sk.addColorStop(q, 'rgb(' + Math.round(g * 255) + ',' + Math.round(g * 255) + ',' + Math.round(g * 255) + ')')); }
    else { sk = cx.createRadialGradient(cxm, cym, 0, cxm, cym, skR); sk.addColorStop(0, '#3a3a3a'); sk.addColorStop(1, '#181818'); }
    cx.fillStyle = sk; cx.beginPath(); cx.arc(cxm, cym, skR, 0, Math.PI * 2); cx.fill(); cx.restore();
    cx.save(); cx.beginPath(); cx.arc(cxm, cym, skR, 0, Math.PI * 2); cx.clip();
    const lg = cx.createLinearGradient(0, cym - skR, 0, cym); lg.addColorStop(0, rgba(0.38)); lg.addColorStop(0.5, rgba(0.06)); lg.addColorStop(1, rgba(0));
    cx.globalCompositeOperation = 'screen'; cx.fillStyle = lg; cx.fillRect(cxm - skR, cym - skR, skR * 2, skR * 2); cx.restore();
    const rim = cx.createLinearGradient(0, cym - skR, 0, cym + skR); rim.addColorStop(0, rgba(0.75)); rim.addColorStop(0.5, rgba(0.1)); rim.addColorStop(1, rgba(0));
    cx.strokeStyle = rim; cx.lineWidth = Math.max(1.4, w * 0.012); cx.beginPath(); cx.arc(cxm, cym, skR - cx.lineWidth / 2, 0, Math.PI * 2); cx.stroke();
    const capR = skR - w * 0.085;
    const cg = cx.createRadialGradient(cxm, cym - capR * 0.64, 0, cxm, cym - capR * 0.64, w * 0.42); cg.addColorStop(0, '#3d3d3d'); cg.addColorStop(1, '#0d0d0d');
    cx.fillStyle = cg; cx.beginPath(); cx.arc(cxm, cym, capR, 0, Math.PI * 2); cx.fill();
    cx.save(); cx.translate(cxm, cym); cx.rotate((-135 + t * 270) * Math.PI / 180);
    const pw = Math.max(3, w * 0.04), ph = w * 0.16, py0 = -(w * 0.5 - skirtIn - w * 0.12) - ph / 2;
    cx.fillStyle = 'rgba(255,255,255,0.92)'; cx.beginPath(); (cx.roundRect ? cx.roundRect(-pw / 2, py0, pw, ph, pw / 2) : cx.rect(-pw / 2, py0, pw, ph)); cx.fill(); cx.restore();
  }
  return { interstellar, aqua, scientific: tech, holo };
})();
const DIAL_DEFS = `<svg id="vdKnobDefs" width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <radialGradient id="vkg-body" cx="0.35" cy="0.3" r="0.9"><stop offset="0" style="stop-color:var(--knob-rim)"/><stop offset="1" style="stop-color:var(--knob-body)"/></radialGradient>
    <linearGradient id="vkg-cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--knob-cap-top)"/><stop offset="0.5" style="stop-color:var(--knob-cap)"/><stop offset="1" style="stop-color:var(--knob-cap-bot)"/></linearGradient>
    <linearGradient id="vkg-chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset="0.3" stop-color="#8e949c"/><stop offset="0.5" stop-color="#e2e5e8"/><stop offset="0.75" stop-color="#7d838b"/><stop offset="1" stop-color="#eef0f2"/></linearGradient>
    <radialGradient id="vkg-chromecap" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#c9cdd3"/><stop offset="1" stop-color="#8e949c"/></radialGradient>
    <radialGradient id="vkg-wood" cx="0.38" cy="0.32" r="0.9"><stop offset="0" style="stop-color:var(--knob-rim)"/><stop offset="1" style="stop-color:var(--knob-body)"/></radialGradient>
    <linearGradient id="vkg-mecha" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--knob-cap)"/><stop offset="1" style="stop-color:var(--knob-body)"/></linearGradient>
    <radialGradient id="vkg-porc" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="#ffffff"/><stop offset="1" style="stop-color:var(--knob-body)"/></radialGradient>
    <radialGradient id="vkg-porccap" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="#ffffff"/><stop offset="1" style="stop-color:var(--knob-cap)"/></radialGradient>
    <pattern id="vkg-hazard" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="10" fill="#000"/></pattern>
    <filter id="vknob-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="vknob-shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
    <filter id="vknob-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    <g id="vkb-machined">
      <circle cx="33" cy="34.5" r="21" fill="#000" opacity="0.55" filter="url(#vknob-shadow)"/>
      <circle cx="33" cy="33" r="21" fill="url(#vkg-body)"/><line x1="49.8" y1="33.0" x2="53.2" y2="33.0" stroke="#000" stroke-opacity="0.55"/><line x1="49.63" y1="35.39" x2="52.99" y2="35.87" stroke="#000" stroke-opacity="0.25"/><line x1="49.12" y1="37.73" x2="52.38" y2="38.69" stroke="#000" stroke-opacity="0.55"/><line x1="48.28" y1="39.98" x2="51.37" y2="41.39" stroke="#000" stroke-opacity="0.25"/><line x1="47.13" y1="42.08" x2="49.99" y2="43.92" stroke="#000" stroke-opacity="0.55"/><line x1="45.7" y1="44.0" x2="48.27" y2="46.23" stroke="#000" stroke-opacity="0.25"/><line x1="44.0" y1="45.7" x2="46.23" y2="48.27" stroke="#000" stroke-opacity="0.55"/><line x1="42.08" y1="47.13" x2="43.92" y2="49.99" stroke="#000" stroke-opacity="0.25"/><line x1="39.98" y1="48.28" x2="41.39" y2="51.37" stroke="#000" stroke-opacity="0.55"/><line x1="37.73" y1="49.12" x2="38.69" y2="52.38" stroke="#000" stroke-opacity="0.25"/><line x1="35.39" y1="49.63" x2="35.87" y2="52.99" stroke="#000" stroke-opacity="0.55"/><line x1="33.0" y1="49.8" x2="33.0" y2="53.2" stroke="#000" stroke-opacity="0.25"/><line x1="30.61" y1="49.63" x2="30.13" y2="52.99" stroke="#000" stroke-opacity="0.55"/><line x1="28.27" y1="49.12" x2="27.31" y2="52.38" stroke="#000" stroke-opacity="0.25"/><line x1="26.02" y1="48.28" x2="24.61" y2="51.37" stroke="#000" stroke-opacity="0.55"/><line x1="23.92" y1="47.13" x2="22.08" y2="49.99" stroke="#000" stroke-opacity="0.25"/><line x1="22.0" y1="45.7" x2="19.77" y2="48.27" stroke="#000" stroke-opacity="0.55"/><line x1="20.3" y1="44.0" x2="17.73" y2="46.23" stroke="#000" stroke-opacity="0.25"/><line x1="18.87" y1="42.08" x2="16.01" y2="43.92" stroke="#000" stroke-opacity="0.55"/><line x1="17.72" y1="39.98" x2="14.63" y2="41.39" stroke="#000" stroke-opacity="0.25"/><line x1="16.88" y1="37.73" x2="13.62" y2="38.69" stroke="#000" stroke-opacity="0.55"/><line x1="16.37" y1="35.39" x2="13.01" y2="35.87" stroke="#000" stroke-opacity="0.25"/><line x1="16.2" y1="33.0" x2="12.8" y2="33.0" stroke="#000" stroke-opacity="0.55"/><line x1="16.37" y1="30.61" x2="13.01" y2="30.13" stroke="#000" stroke-opacity="0.25"/><line x1="16.88" y1="28.27" x2="13.62" y2="27.31" stroke="#000" stroke-opacity="0.55"/><line x1="17.72" y1="26.02" x2="14.63" y2="24.61" stroke="#000" stroke-opacity="0.25"/><line x1="18.87" y1="23.92" x2="16.01" y2="22.08" stroke="#000" stroke-opacity="0.55"/><line x1="20.3" y1="22.0" x2="17.73" y2="19.77" stroke="#000" stroke-opacity="0.25"/><line x1="22.0" y1="20.3" x2="19.77" y2="17.73" stroke="#000" stroke-opacity="0.55"/><line x1="23.92" y1="18.87" x2="22.08" y2="16.01" stroke="#000" stroke-opacity="0.25"/><line x1="26.02" y1="17.72" x2="24.61" y2="14.63" stroke="#000" stroke-opacity="0.55"/><line x1="28.27" y1="16.88" x2="27.31" y2="13.62" stroke="#000" stroke-opacity="0.25"/><line x1="30.61" y1="16.37" x2="30.13" y2="13.01" stroke="#000" stroke-opacity="0.55"/><line x1="33.0" y1="16.2" x2="33.0" y2="12.8" stroke="#000" stroke-opacity="0.25"/><line x1="35.39" y1="16.37" x2="35.87" y2="13.01" stroke="#000" stroke-opacity="0.55"/><line x1="37.73" y1="16.88" x2="38.69" y2="13.62" stroke="#000" stroke-opacity="0.25"/><line x1="39.98" y1="17.72" x2="41.39" y2="14.63" stroke="#000" stroke-opacity="0.55"/><line x1="42.08" y1="18.87" x2="43.92" y2="16.01" stroke="#000" stroke-opacity="0.25"/><line x1="44.0" y1="20.3" x2="46.23" y2="17.73" stroke="#000" stroke-opacity="0.55"/><line x1="45.7" y1="22.0" x2="48.27" y2="19.77" stroke="#000" stroke-opacity="0.25"/><line x1="47.13" y1="23.92" x2="49.99" y2="22.08" stroke="#000" stroke-opacity="0.55"/><line x1="48.28" y1="26.02" x2="51.37" y2="24.61" stroke="#000" stroke-opacity="0.25"/><line x1="49.12" y1="28.27" x2="52.38" y2="27.31" stroke="#000" stroke-opacity="0.55"/><line x1="49.63" y1="30.61" x2="52.99" y2="30.13" stroke="#000" stroke-opacity="0.25"/>
      <circle cx="33" cy="33" r="15.54" fill="url(#vkg-cap)" stroke="#000" stroke-opacity="0.8"/>
      <ellipse cx="33" cy="25.23" rx="8.55" ry="5.44" fill="#fff" opacity="0.06"/>
    </g>
    <g id="vkb-chrome">
      <circle cx="33" cy="35.5" r="21" fill="#000" opacity="0.6" filter="url(#vknob-shadow)"/>
      <circle cx="33" cy="33" r="21" fill="url(#vkg-chrome)"/><line x1="49.8" y1="33.0" x2="53.2" y2="33.0" stroke="#000" stroke-opacity="0.35"/><line x1="49.71" y1="34.76" x2="53.09" y2="35.11" stroke="#000" stroke-opacity="0.16"/><line x1="49.43" y1="36.49" x2="52.76" y2="37.2" stroke="#000" stroke-opacity="0.35"/><line x1="48.98" y1="38.19" x2="52.21" y2="39.24" stroke="#000" stroke-opacity="0.16"/><line x1="48.35" y1="39.83" x2="51.45" y2="41.22" stroke="#000" stroke-opacity="0.35"/><line x1="47.55" y1="41.4" x2="50.49" y2="43.1" stroke="#000" stroke-opacity="0.16"/><line x1="46.59" y1="42.87" x2="49.34" y2="44.87" stroke="#000" stroke-opacity="0.35"/><line x1="45.48" y1="44.24" x2="48.01" y2="46.52" stroke="#000" stroke-opacity="0.16"/><line x1="44.24" y1="45.48" x2="46.52" y2="48.01" stroke="#000" stroke-opacity="0.35"/><line x1="42.87" y1="46.59" x2="44.87" y2="49.34" stroke="#000" stroke-opacity="0.16"/><line x1="41.4" y1="47.55" x2="43.1" y2="50.49" stroke="#000" stroke-opacity="0.35"/><line x1="39.83" y1="48.35" x2="41.22" y2="51.45" stroke="#000" stroke-opacity="0.16"/><line x1="38.19" y1="48.98" x2="39.24" y2="52.21" stroke="#000" stroke-opacity="0.35"/><line x1="36.49" y1="49.43" x2="37.2" y2="52.76" stroke="#000" stroke-opacity="0.16"/><line x1="34.76" y1="49.71" x2="35.11" y2="53.09" stroke="#000" stroke-opacity="0.35"/><line x1="33.0" y1="49.8" x2="33.0" y2="53.2" stroke="#000" stroke-opacity="0.16"/><line x1="31.24" y1="49.71" x2="30.89" y2="53.09" stroke="#000" stroke-opacity="0.35"/><line x1="29.51" y1="49.43" x2="28.8" y2="52.76" stroke="#000" stroke-opacity="0.16"/><line x1="27.81" y1="48.98" x2="26.76" y2="52.21" stroke="#000" stroke-opacity="0.35"/><line x1="26.17" y1="48.35" x2="24.78" y2="51.45" stroke="#000" stroke-opacity="0.16"/><line x1="24.6" y1="47.55" x2="22.9" y2="50.49" stroke="#000" stroke-opacity="0.35"/><line x1="23.13" y1="46.59" x2="21.13" y2="49.34" stroke="#000" stroke-opacity="0.16"/><line x1="21.76" y1="45.48" x2="19.48" y2="48.01" stroke="#000" stroke-opacity="0.35"/><line x1="20.52" y1="44.24" x2="17.99" y2="46.52" stroke="#000" stroke-opacity="0.16"/><line x1="19.41" y1="42.87" x2="16.66" y2="44.87" stroke="#000" stroke-opacity="0.35"/><line x1="18.45" y1="41.4" x2="15.51" y2="43.1" stroke="#000" stroke-opacity="0.16"/><line x1="17.65" y1="39.83" x2="14.55" y2="41.22" stroke="#000" stroke-opacity="0.35"/><line x1="17.02" y1="38.19" x2="13.79" y2="39.24" stroke="#000" stroke-opacity="0.16"/><line x1="16.57" y1="36.49" x2="13.24" y2="37.2" stroke="#000" stroke-opacity="0.35"/><line x1="16.29" y1="34.76" x2="12.91" y2="35.11" stroke="#000" stroke-opacity="0.16"/><line x1="16.2" y1="33.0" x2="12.8" y2="33.0" stroke="#000" stroke-opacity="0.35"/><line x1="16.29" y1="31.24" x2="12.91" y2="30.89" stroke="#000" stroke-opacity="0.16"/><line x1="16.57" y1="29.51" x2="13.24" y2="28.8" stroke="#000" stroke-opacity="0.35"/><line x1="17.02" y1="27.81" x2="13.79" y2="26.76" stroke="#000" stroke-opacity="0.16"/><line x1="17.65" y1="26.17" x2="14.55" y2="24.78" stroke="#000" stroke-opacity="0.35"/><line x1="18.45" y1="24.6" x2="15.51" y2="22.9" stroke="#000" stroke-opacity="0.16"/><line x1="19.41" y1="23.13" x2="16.66" y2="21.13" stroke="#000" stroke-opacity="0.35"/><line x1="20.52" y1="21.76" x2="17.99" y2="19.48" stroke="#000" stroke-opacity="0.16"/><line x1="21.76" y1="20.52" x2="19.48" y2="17.99" stroke="#000" stroke-opacity="0.35"/><line x1="23.13" y1="19.41" x2="21.13" y2="16.66" stroke="#000" stroke-opacity="0.16"/><line x1="24.6" y1="18.45" x2="22.9" y2="15.51" stroke="#000" stroke-opacity="0.35"/><line x1="26.17" y1="17.65" x2="24.78" y2="14.55" stroke="#000" stroke-opacity="0.16"/><line x1="27.81" y1="17.02" x2="26.76" y2="13.79" stroke="#000" stroke-opacity="0.35"/><line x1="29.51" y1="16.57" x2="28.8" y2="13.24" stroke="#000" stroke-opacity="0.16"/><line x1="31.24" y1="16.29" x2="30.89" y2="12.91" stroke="#000" stroke-opacity="0.35"/><line x1="33.0" y1="16.2" x2="33.0" y2="12.8" stroke="#000" stroke-opacity="0.16"/><line x1="34.76" y1="16.29" x2="35.11" y2="12.91" stroke="#000" stroke-opacity="0.35"/><line x1="36.49" y1="16.57" x2="37.2" y2="13.24" stroke="#000" stroke-opacity="0.16"/><line x1="38.19" y1="17.02" x2="39.24" y2="13.79" stroke="#000" stroke-opacity="0.35"/><line x1="39.83" y1="17.65" x2="41.22" y2="14.55" stroke="#000" stroke-opacity="0.16"/><line x1="41.4" y1="18.45" x2="43.1" y2="15.51" stroke="#000" stroke-opacity="0.35"/><line x1="42.87" y1="19.41" x2="44.87" y2="16.66" stroke="#000" stroke-opacity="0.16"/><line x1="44.24" y1="20.52" x2="46.52" y2="17.99" stroke="#000" stroke-opacity="0.35"/><line x1="45.48" y1="21.76" x2="48.01" y2="19.48" stroke="#000" stroke-opacity="0.16"/><line x1="46.59" y1="23.13" x2="49.34" y2="21.13" stroke="#000" stroke-opacity="0.35"/><line x1="47.55" y1="24.6" x2="50.49" y2="22.9" stroke="#000" stroke-opacity="0.16"/><line x1="48.35" y1="26.17" x2="51.45" y2="24.78" stroke="#000" stroke-opacity="0.35"/><line x1="48.98" y1="27.81" x2="52.21" y2="26.76" stroke="#000" stroke-opacity="0.16"/><line x1="49.43" y1="29.51" x2="52.76" y2="28.8" stroke="#000" stroke-opacity="0.35"/><line x1="49.71" y1="31.24" x2="53.09" y2="30.89" stroke="#000" stroke-opacity="0.16"/>
      <circle cx="33" cy="33" r="15.54" fill="url(#vkg-chromecap)" stroke="#000" stroke-opacity="0.5"/><circle cx="33" cy="33" r="3.45" fill="none" stroke="#000" stroke-opacity=".07" stroke-width=".6"/><circle cx="33" cy="33" r="6.91" fill="none" stroke="#000" stroke-opacity=".07" stroke-width=".6"/><circle cx="33" cy="33" r="10.36" fill="none" stroke="#000" stroke-opacity=".07" stroke-width=".6"/><circle cx="33" cy="33" r="13.81" fill="none" stroke="#000" stroke-opacity=".07" stroke-width=".6"/>
    </g>
    <g id="vkb-wood">
      <circle cx="33" cy="35" r="21" fill="#000" opacity="0.6" filter="url(#vknob-shadow)"/>
      <circle cx="33" cy="33" r="21" fill="url(#vkg-wood)"/><ellipse cx="33.0" cy="33" rx="5.25" ry="5.04" fill="none" stroke="#000" stroke-opacity=".14"/><ellipse cx="34.2" cy="33" rx="7.56" ry="7.26" fill="none" stroke="#000" stroke-opacity=".14"/><ellipse cx="33.0" cy="33" rx="9.87" ry="9.48" fill="none" stroke="#000" stroke-opacity=".14"/><ellipse cx="34.2" cy="33" rx="12.18" ry="11.69" fill="none" stroke="#000" stroke-opacity=".14"/><ellipse cx="33.0" cy="33" rx="14.49" ry="13.91" fill="none" stroke="#000" stroke-opacity=".14"/><ellipse cx="34.2" cy="33" rx="16.8" ry="16.13" fill="none" stroke="#000" stroke-opacity=".14"/><ellipse cx="33.0" cy="33" rx="19.11" ry="18.35" fill="none" stroke="#000" stroke-opacity=".14"/>
      <circle cx="33" cy="33" r="21" fill="none" stroke="#000" stroke-opacity="0.55"/>
    </g>
    <g id="vkb-mecha">
      <polygon points="54.4,44.04 43.04,55.4 26.96,55.4 15.6,44.04 15.6,27.96 26.96,16.6 43.04,16.6 54.4,27.96" fill="#000"/>
      <polygon points="52.4,41.04 41.04,52.4 24.96,52.4 13.6,41.04 13.6,24.96 24.96,13.6 41.04,13.6 52.4,24.96" style="fill:var(--knob-body)"/>
      <polygon points="49.69,39.91 39.91,49.69 26.09,49.69 16.31,39.91 16.31,26.09 26.09,16.31 39.91,16.31 49.69,26.09" style="fill:var(--cyan)"/>
      <polygon points="49.69,39.91 39.91,49.69 26.09,49.69 16.31,39.91 16.31,26.09 26.09,16.31 39.91,16.31 49.69,26.09" fill="url(#vkg-hazard)"/>
      <polygon points="46.64,38.65 38.65,46.64 27.35,46.64 19.36,38.65 19.36,27.35 27.35,19.36 38.65,19.36 46.64,27.35" fill="url(#vkg-mecha)" stroke="#000" stroke-width="2"/>
      <polygon points="52.4,41.04 41.04,52.4 24.96,52.4 13.6,41.04 13.6,24.96 24.96,13.6 41.04,13.6 52.4,24.96" fill="none" stroke="#000" stroke-width="2"/>
    </g>
    <g id="vkb-blueprint">
      <circle cx="33" cy="33" r="21" fill="none" stroke="#fff" stroke-width="1.3"/>
      <circle cx="33" cy="33" r="15.54" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="0.8" stroke-dasharray="2 2"/>
      <circle cx="33" cy="33" r="2" fill="none" stroke="#fff" stroke-width="0.8"/>
      <path d="M8 33H26.7M39.3 33H58M33 8V26.7M33 39.3V58" stroke="#fff" stroke-opacity="0.55" stroke-width="0.6" stroke-dasharray="4 1.5 1 1.5"/>
    </g>
    <g id="vkb-porcelain">
      <circle cx="33" cy="36" r="21" fill="rgb(40,70,100)" opacity="0.35" filter="url(#vknob-soft)"/>
      <circle cx="33" cy="33" r="21" fill="url(#vkg-porc)" style="stroke:var(--border)"/>
      <circle cx="33" cy="33" r="15.54" fill="url(#vkg-porccap)" style="stroke:var(--border)" stroke-opacity="0.7" stroke-width="0.8"/>
    </g>
  </defs>
</svg>
`;
(function () {
  const st = document.createElement('style');
  st.textContent = `body.dialx .knob>u,body.dialx .knob>b,body.dialx .knob>i{display:none}
body.dialx .knob .kv{position:absolute;left:-11%;top:-11%;width:122%;height:122%;pointer-events:none;overflow:visible}
body.dialx .knob .kpc{fill:var(--led,#ffb23d)}body.dialx .knob:focus-visible{outline:2px solid var(--cyan);outline-offset:2px;border-radius:50%}
body.dialx .knob.learn{outline:2px dashed var(--cyan);border-radius:50%}`;
  document.head.appendChild(st);
})();
dialInit();
