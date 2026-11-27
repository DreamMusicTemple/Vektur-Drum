/* ============================================================ VEKTUR PULSE — samples on tracks
   Touch and hold a track name or a pad (or right-click it, or use SAMPLE… in SOUND) to import a WAV or FLAC file
   for that track. The track then plays the sample in place of its drum model — tune, decay (full = play to the end),
   tone (low-pass), level, pan, crush and sends still apply — and shows the file's name in place of Kick, Snare…
   The files are stored in the set (S.drumSamples = [{ key, name, fmt, data: base64 }]; tracks refer to them in
   S.drums.smp), so an exported set — and the iPad app — opens with them. The browser's autosave keeps the bytes in
   IndexedDB instead of localStorage, like imported fonts. */
const DSMP = { mono: new Map(), sent: '', busy: false, stored: new Set() };   // key → { d: Float32Array, rate } (decoded once)
const DSMP_BYTES = 20000000, DSMP_TYPES = ['wav', 'wave', 'flac'];

function drumLib() { if (!Array.isArray(S.drumSamples)) S.drumSamples = []; return S.drumSamples; }
function drumSmp() { const d = drumState(); if (!Array.isArray(d.smp)) d.smp = []; while (d.smp.length < DRUM_TRACKS) d.smp.push(null); return d.smp; }
function drumSampleName(t) { const k = drumSmp()[t]; if (!k) return null; const f = drumLib().find(x => x.key === k); return f ? f.name : null; }
function dsmpKey(bytes) { let h = 0x811c9dc5; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; } return 's' + h.toString(16).padStart(8, '0'); }

/** WAV / FLAC bytes → mono Float32Array at the file's own rate (or the context's), at most 30 s. */
async function dsmpDecode(bytes) {
  const ctx = A.ctx || new (window.AudioContext || window.webkitAudioContext)();
  const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(bytes.slice().buffer, res, rej); if (p && p.catch) p.catch(rej); });
  const n = Math.min(buf.length, Math.floor(buf.sampleRate * 30)), d = new Float32Array(n), ch = buf.numberOfChannels;
  for (let c = 0; c < ch; c++) { const x = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] += x[i]; }
  if (ch > 1) for (let i = 0; i < n; i++) d[i] /= ch;
  return { d, rate: buf.sampleRate };
}
async function dsmpMono(f) {
  if (DSMP.mono.has(f.key)) return DSMP.mono.get(f.key);
  if (!f.data) return null;
  try { const m = await dsmpDecode(ufontBytes(f.data)); DSMP.mono.set(f.key, m); return m; } catch (e) { return null; }
}
/** Sends the tracks' samples to the engine (all of them with `force`, e.g. after the engine was made again).
    0.9: a track with slices (or a Tune mode other than Rate) gets its prepared buffer and slice table. */
async function drumSamplesPush(force) {
  if (!SYN.node) return;
  const smp = drumSmp(), sigs = smp.map((k, t) => (k || '-') + (k ? sxSig(t) : '')), sig = sigs.join('|');
  if (!force && sig === DSMP.sent) return;
  const was = (DSMP.sentEach || []);
  DSMP.sent = sig; DSMP.sentEach = sigs;
  for (let t = 0; t < DRUM_TRACKS; t++) {
    if (!force && was[t] === sigs[t]) continue;
    const k = smp[t], f = k && drumLib().find(x => x.key === k);
    const m = f ? await dsmpMono(f) : null;
    if (m) {
      const pr = sxPrepare(m, drumSx()[t], sxPrepOpts(t));
      const copy = pr ? pr.d : m.d.slice();
      SYN.node.port.postMessage({ dr: ['w', t, copy, m.rate, pr ? pr.table : null] }, [copy.buffer]);
    } else SYN.node.port.postMessage({ dr: ['w', t, null, 0] });
  }
}
/** Keeps only files a track or one of your saved kits still uses. */
function drumSamplesPrune() {
  const used = new Set(drumSmp().filter(Boolean));
  (drumState().user || []).forEach(pr => (pr && pr.smp || []).forEach(k => { if (k) used.add(k); }));
  S.drumSamples = drumLib().filter(f => used.has(f.key));
  for (const k of [...DSMP.mono.keys()]) if (!used.has(k)) DSMP.mono.delete(k);
}
async function drumImportSample(t, file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!DSMP_TYPES.includes(ext)) { toast('Choose a WAV or FLAC file'); return; }
  if (file.size > DSMP_BYTES) { toast('That file is larger than 20 MB'); return; }
  audioEnsure();
  const bytes = new Uint8Array(await file.arrayBuffer()), key = dsmpKey(bytes);
  let f = drumLib().find(x => x.key === key);
  if (!f) {
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 40) || 'Sample';
    f = { key, name, fmt: ext === 'flac' ? 'flac' : 'wav', data: ufontB64(bytes) };
    try { DSMP.mono.set(key, await dsmpDecode(bytes)); } catch (e) { toast("That file isn't a WAV or FLAC this browser can read"); return; }
    drumLib().push(f);
    try { await filePut('dsmp:' + key, new Blob([bytes]), f.name); DSMP.stored.add(key); } catch (e) { }
  }
  drumSmp()[t] = key; drumState().preset = ''; drumSet(`t${t + 1}.engine`, 1, true);   // loading a sample selects the Sample engine
  drumSamplesPrune(); dirty();
  await drumSamplesPush(); renderDrums();
  toast(`Track ${t + 1} plays ${f.name} — saved inside the set`);
}
function drumRemoveSample(t) { if (!drumSmp()[t]) return; drumSmp()[t] = null; drumSet(`t${t + 1}.engine`, 0, true); drumSamplesPrune(); dirty(); drumSamplesPush(); renderDrums(); }
function drumPickSample(t) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.wav,.wave,.flac,audio/wav,audio/x-wav,audio/flac,audio/x-flac';
  inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) drumImportSample(t, f); };
  inp.click();
}
/** The small menu by a track name / pad / SAMPLE… button. */
function drumSampleMenu(t, anchor) {
  const old = $('#dsmpMenu'); if (old) old.remove();
  const m = el('div', 'dsmpmenu'); m.id = 'dsmpMenu'; m.setAttribute('role', 'menu');
  m.appendChild(el('b', null, `TRACK ${t + 1}` + (drumSampleName(t) ? ' · ' + drumSampleName(t) : '')));
  const add = (txt, f) => { const b = el('button', null, txt); b.setAttribute('role', 'menuitem'); b.onclick = () => { m.remove(); f(); }; m.appendChild(b); };
  add(drumSampleName(t) ? 'Replace sample (WAV or FLAC)…' : 'Import sample (WAV or FLAC)…', () => drumPickSample(t));
  if (drumSampleName(t)) add('Remove sample — back to the drum synth (' + DRUM_MODELS[Math.round(drumVal(`t${t + 1}.model`))] + ')', () => drumRemoveSample(t));
  add('Cancel', () => { });
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
  m.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + 'px';
  setTimeout(() => { const off = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
}
/** Touch and hold (550 ms, without moving) or right-click → the sample menu. Marks the element so its tap is ignored. */
function drumLongPress(node, t) {
  let timer = null, x = 0, y = 0;
  node.addEventListener('pointerdown', e => { x = e.clientX; y = e.clientY; clearTimeout(timer); timer = setTimeout(() => { node.dataset.lp = '1'; drumSampleMenu(t, node); }, 550); });
  const stop = () => clearTimeout(timer);
  node.addEventListener('pointermove', e => { if (Math.abs(e.clientX - x) + Math.abs(e.clientY - y) > 10) stop(); });
  node.addEventListener('pointerup', stop); node.addEventListener('pointercancel', stop); node.addEventListener('pointerleave', stop);
  node.addEventListener('contextmenu', e => { e.preventDefault(); stop(); drumSampleMenu(t, node); });
}
/** Restores sample bytes from IndexedDB after an autosave reload (and stores new ones), then sends them. Once a second. */
async function drumSamplesSync() {
  if (DSMP.busy || !S.drums) return;
  DSMP.busy = true;
  try {
    for (const f of drumLib()) {
      if (!f.data) { const r = await fileGet('dsmp:' + f.key); if (r && r.blob) { f.data = ufontB64(new Uint8Array(await r.blob.arrayBuffer())); DSMP.stored.add(f.key); } }
      else if (!DSMP.stored.has(f.key)) { if (!(await fileGet('dsmp:' + f.key))) await filePut('dsmp:' + f.key, new Blob([ufontBytes(f.data)]), f.name); DSMP.stored.add(f.key); }
    }
    await drumSamplesPush();
  } finally { DSMP.busy = false; }
}
setInterval(() => { try { drumSamplesSync(); } catch (e) { } }, 1000);
(function dsmpCSS() {
  const st = document.createElement('style');
  st.textContent = `.dsmpmenu{position:fixed;z-index:90;min-width:15rem;display:flex;flex-direction:column;padding:.35rem;border-radius:.5rem;background:#1b1c1f;border:1px solid #3a3c41;box-shadow:0 10px 30px #000a}
.dsmpmenu b{font-size:.62rem;letter-spacing:.12em;color:#9a9ea6;padding:.35rem .5rem}
.dsmpmenu button{all:unset;cursor:pointer;padding:.55rem .6rem;border-radius:.35rem;font-size:.85rem;color:#e8e9ec}
.dsmpmenu button:hover,.dsmpmenu button:focus-visible{background:#2b2d32}`;
  document.head.appendChild(st);
})();
