const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1600); }
let midiLearn = false, learnPath = null;
function slider(host, o) {
  // o: {get,set,min,max,def,path,fmt,label,mod:{obj,name}}  ·  knob: true → hardware rotary knob (bipolar: arc from the centre)
  if (o.knob) return knobCtl(host, o);
  const row = el('div', 'prow');
  if (o.label != null) row.appendChild(el('label', null, o.label));
  const sl = el('div', o.dial ? 'dial' : 'sl' + (o.big ? ' big' : '')); const fill = el('i'), knob = el('b'), mark = el('em');
  sl.append(fill, knob, mark); row.appendChild(sl);
  if (o.dial) { row.classList.add('dialrow'); sl.setAttribute('role', 'slider'); sl.setAttribute('aria-label', o.label || 'Dial'); }
  const pv = o.label != null ? el('span', 'pv mono') : null; if (pv) row.appendChild(pv);
  const fmt = o.fmt || (v => Math.abs(o.max - o.min) >= 20 ? v.toFixed(0) : v.toFixed(2));
  const paint = () => {
    const v = o.get(), t = (v - o.min) / (o.max - o.min);
    if (o.dial) { knob.style.transform = `rotate(${clamp(t, 0, 1) * 360 - 180}deg)`; sl.setAttribute('aria-valuenow', v.toFixed(0)); }
    else { fill.style.width = clamp(t, 0, 1) * 100 + '%'; knob.style.left = clamp(t, 0, 1) * 100 + '%'; }
    if (pv) pv.textContent = fmt(v);
    if (o.mod) { const m = o.mod.obj.mods[o.mod.name]; if (m && m.src !== 'none') { const ev = effVal(o.mod.obj, o.mod.def); mark.style.display = 'block'; if (o.dial) mark.style.transform = `rotate(${(ev - o.min) / (o.max - o.min) * 360 - 180}deg)`; else mark.style.left = (ev - o.min) / (o.max - o.min) * 100 + '%'; } else mark.style.display = 'none'; }
    sl.classList.toggle('learn', midiLearn && learnPath === o.path);
  };
  let lastTap = 0;
  sl.addEventListener('pointerdown', e => {
    audioEnsure();
    if (macroCatch(o.path)) return;
    if (midiLearn && o.path) { learnPath = o.path; toast('Move a MIDI control to map'); return; }
    const nowT = performance.now(); if (nowT - lastTap < 300 && o.def != null) { o.set(o.def); paint(); dirty(); lastTap = 0; return; } lastTap = nowT;
    sl.setPointerCapture(e.pointerId);
    const move = o.dial
      ? ev => { const r = sl.getBoundingClientRect(); const a = Math.atan2(ev.clientX - r.left - r.width / 2, -(ev.clientY - r.top - r.height / 2)); o.set(o.min + clamp((a / Math.PI + 1) / 2, 0, 1) * (o.max - o.min)); paint(); }
      : ev => { const r = sl.getBoundingClientRect(); const t = clamp((ev.clientX - r.left) / r.width, 0, 1); o.set(o.min + t * (o.max - o.min)); paint(); };
    move(e);
    sl.onpointermove = move;
    sl.onpointerup = sl.onpointercancel = () => { sl.onpointermove = null; dirty(); };
  });
  host.appendChild(row); paint();
  return { row, paint };
}
/** Hardware rotary knob (same contract as slider(): get / set / min / max / def / path / fmt / label).
    270° sweep with a lit value arc (from the centre when bipolar), a raised cap lit from above, a turning pointer.
    Drag up / down (fine control the further you drag); double-tap returns to default; arrow keys step. It repaints
    only when its value changes — nothing animates on its own. */
function knobCtl(host, o) {
  const cell = el('div', 'kcell' + (o.big ? ' big' : '')); if (o.cls) cell.classList.add(o.cls);
  if (o.label != null) cell.appendChild(el('span', 'klbl', o.label));
  const k = el('div', 'knob'); const ind = el('i'); k.append(el('u'), el('b'), ind, el('s', 'kmod')); cell.appendChild(k);   // s: where modulation has the dial now
  k.tabIndex = 0; k.setAttribute('role', 'slider'); k.setAttribute('aria-label', o.label || 'Knob');
  const pv = el('span', 'kval'); cell.appendChild(pv);
  const bip = o.bipolar != null ? o.bipolar : (o.min < 0 && o.max > 0);
  const fmt = o.fmt || (v => Math.abs(o.max - o.min) >= 20 ? v.toFixed(0) : v.toFixed(2));
  let last = null;
  const paint = () => {
    const v = o.get(); if (v === last && !midiLearn) return; last = v;
    const t = clamp((v - o.min) / (o.max - o.min), 0, 1), c = bip ? (o.center != null ? o.center : clamp((0 - o.min) / (o.max - o.min), 0, 1)) : 0;
    k.style.setProperty('--a', (t * 270 - 135) + 'deg');
    k.style.setProperty('--s', Math.min(t, c) * 270 + 'deg'); k.style.setProperty('--e', Math.max(t, c) * 270 + 'deg');
    pv.textContent = fmt(v); k.setAttribute('aria-valuenow', String(+v.toFixed(3))); k.setAttribute('aria-valuetext', fmt(v));
    k.classList.toggle('learn', midiLearn && learnPath === o.path);
    if (typeof dialPaint === 'function') dialPaint(k, t, c, bip);   // NEW: the chosen dial design (dials.js)
  };
  const setV = v => { o.set(clamp(v, o.min, o.max)); paint(); };
  let lastTap = 0;
  k.addEventListener('pointerdown', e => {
    audioEnsure();
    if (macroCatch(o.path)) return;
    if (midiLearn && o.path) { learnPath = o.path; toast('Move a MIDI control to map'); paint(); return; }
    const nowT = performance.now(); if (nowT - lastTap < 300 && o.def != null) { setV(o.def); dirty(); lastTap = 0; return; } lastTap = nowT;
    k.setPointerCapture(e.pointerId); k.classList.add('turn');
    const y0 = e.clientY, v0 = o.get();
    k.onpointermove = ev => setV(v0 + (y0 - ev.clientY) / 160 * (o.max - o.min));
    k.onpointerup = k.onpointercancel = () => { k.onpointermove = null; k.classList.remove('turn'); dirty(); };
  });
  k.addEventListener('keydown', e => {
    const st = o.step || (o.max - o.min) / 100;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { setV(o.get() + st); dirty(); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { setV(o.get() - st); dirty(); e.preventDefault(); }
  });
  host.appendChild(cell); paint();
  return { row: cell, paint };
}
function synthNorm(q, v) { const [, , , , mn, mx, , sc] = q; if (sc === 'log') return mn > 0 ? Math.log(v / mn) / Math.log(mx / mn) : Math.cbrt(clamp(v / mx, 0, 1)); return (v - mn) / (mx - mn); }
function synthDenorm(q, t) { const [, , , , mn, mx, , sc] = q; t = clamp(t, 0, 1); if (sc === 'log') return mn > 0 ? mn * Math.pow(mx / mn, t) : mx * t * t * t; return mn + t * (mx - mn); }
function synthFmt(q, v) {
  const u = q[8];
  if (q[3] === 'int') return Math.round(v) + (u ? ' ' + u : '');
  if (u === 'Hz') return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' kHz' : v.toFixed(v < 10 ? 2 : 0) + ' Hz';
  if (u === 's') return v < 1 ? (v * 1000).toFixed(v < .01 ? 1 : 0) + ' ms' : v.toFixed(2) + ' s';
  if (u === 'ct') return (v > 0 ? '+' : '') + v.toFixed(0) + ' ct';
  if (q[1] === 'Pan' || q[1].endsWith(' pan')) return Math.abs(v) < .01 ? 'C' : (v < 0 ? 'L ' : 'R ') + Math.round(Math.abs(v) * 100);
  return v.toFixed(2);
}
function ufontB64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function ufontBytes(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
