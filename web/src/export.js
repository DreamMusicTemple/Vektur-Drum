/* ============================================================ Vektur Drum — NEW (0.8): EXPORT (master and stems)
   Renders offline — faster than real time, in its own engine, never touching what you hear — and saves WAV
   (16 / 24-bit, 32-bit float), FLAC (16 / 24-bit) or MP3 (128–320 kbps). What is rendered:
     · CHAIN on (and a chain set): the whole chain once, position by position;
     · otherwise: the selected pattern, once.
   Then, if TAIL is RING OUT, the delay, reverb and effects ring on until silence (at most 30 s); CUT stops exactly at
   the end (loop-ready). STEMS renders the same performance once per track with every other track muted, so each stem
   carries its own share of the delay, reverb, Metalise, Slicer, tape and TEMPER; stems are saved together in a .zip.
   The random parts (chance, HUMANISE ghosts, chaos) are seeded, so master and stems line up sample for sample. */
const EXPORT_PREFS_KEY = 'vekturdrum.export.v1';
const EXP = Object.assign({ what: 'master', fmt: 'wav', wav: 24, flac: 24, mp3: 320, sr: 48000, tail: 'ring' },
  (() => { try { return JSON.parse(localStorage.getItem(EXPORT_PREFS_KEY) || '{}'); } catch (e) { return {}; } })());
EXP.busy = false;
function exportPrefsSave() { const { what, fmt, wav, flac, mp3, sr, tail } = EXP; try { localStorage.setItem(EXPORT_PREFS_KEY, JSON.stringify({ what, fmt, wav, flac, mp3, sr, tail })); } catch (e) { } }

/** What will be rendered: { chain: bool, order: [pattern…], beats, seconds, label }. */
function exportPlan() {
  const d = drumState(), chain = !!d.chainOn && d.chain.length > 0, order = chain ? d.chain.slice(0, 16) : [d.sel];
  const beats = order.reduce((s, p) => s + 4 * (d.pats[p] ? d.pats[p].bars : 1), 0), seconds = beats * 60 / S.bpm;
  const label = chain ? 'Chain ' + order.map(p => p + 1).join(' · ') : 'Pattern ' + (d.sel + 1);
  return { chain, order, beats, seconds, label };
}
/** Tracks that play something in the rendered patterns (and aren't muted): the stems. */
function exportStemTracks(plan) {
  const d = drumState(), out = [];
  for (let t = 0; t < d.ntr; t++) {
    if (drumVal(`t${t + 1}.mute`)) continue;
    if (plan.order.some(p => d.pats[p] && d.pats[p].tr[t] && d.pats[p].tr[t].s.some(Boolean))) out.push(t);
  }
  return out;
}
/** Every message that makes an engine play the current song (the same ones the live engine receives). */
function exportOps() {
  const d = drumState(), ops = [];
  ops.push(['ps', Float32Array.from(DRUM_PARAMS, q => drumVal(q[0]))]);
  for (let p = 0; p < 8; p++) ops.push(['P', p, drumPatternArray(d.pats[p])]);
  DRUM_TAP.ops = ops; try { drumPushSlicer(); drumPushWires(); drumPushLfoPts(); drumPushChain(); } finally { DRUM_TAP.ops = null; }
  ops.push(['n', d.ntr], ['y', d.sel], ['e', 1]);
  return ops;
}
const EXPORT_TAIL_MAX = 30, EXPORT_SILENCE = 1e-4;   // −80 dBFS for half a second ends the tail
/** One offline render. solo: a track index (every other track muted), or −1 for the master. */
async function exportRender(sr, plan, solo, samples, onProgress) {
  const Drums = drumsMakeEngine(DRUM_PARAMS, DRUM_DIV_BEATS, DRUM_NOTES, DRUM_DEF_DIV), r = new Drums(sr);
  r.enabledFlag = 1; r.tempo = Math.fround(S.bpm);
  for (const a of exportOps()) r.op(a);
  samples.forEach((m, t) => { if (m) r.setSample(t, m.table ? m.d : m.d.slice(), m.rate, m.table || undefined); });   // 0.9: prepared slices
  if (solo >= 0) for (let t = 0; t < DRUM_TRACKS; t++) { r.setParam(DP_ID[`t${t + 1}.mute`], t === solo ? 0 : 1); r.setParam(DP_ID[`t${t + 1}.solo`], 0); }
  r.prepare(sr);   // every dial starts where it is (no glide from the defaults)
  r.play(1);
  const body = Math.round(plan.seconds * sr), maxTail = EXP.tail === 'ring' ? EXPORT_TAIL_MAX * sr : 0, cap = body + maxTail;
  let L = new Float32Array(cap), R = new Float32Array(cap), n = 0, quiet = 0, stopped = false;
  const BLK = 1024; let lastYield = performance.now();
  while (n < cap) {
    if (!stopped && n >= body) { r.play(0); stopped = true; if (!maxTail) break; }
    const f = Math.min(BLK, (stopped ? cap : body) - n);
    r.render(L.subarray(n, n + f), R.subarray(n, n + f), f);
    if (stopped) { let pk = 0; for (let i = n; i < n + f; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > pk) pk = a; if (b > pk) pk = b; }
      quiet = pk < EXPORT_SILENCE ? quiet + f : 0; }
    n += f;
    if (stopped && quiet >= sr * 0.5) { n -= quiet - Math.round(sr * 0.05); break; }   // keep 50 ms of the silence
    if (performance.now() - lastYield > 40) { onProgress && onProgress(Math.min(1, n / (body + (EXP.tail === 'ring' ? sr * 2 : 0)))); await new Promise(res => setTimeout(res, 0)); lastYield = performance.now(); }
  }
  return [L.subarray(0, n), R.subarray(0, n)];
}
function exportEncode(ch, sr) {
  if (EXP.fmt === 'flac') return VDENC.flac(ch, sr, EXP.flac);
  if (EXP.fmt === 'mp3') return VDENC.mp3(ch, sr, EXP.mp3);
  return VDENC.wav(ch, sr, EXP.wav);
}
const exportSafe = s => String(s || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
async function exportRun(status) {
  if (EXP.busy) return; EXP.busy = true;
  const plan = exportPlan(), sr = EXP.sr, ext = EXP.fmt, d = drumState();
  const base = 'Vektur Drum' + (d.preset ? ' - ' + exportSafe(d.preset) : '') + ' - ' + (plan.chain ? 'Chain' : 'Pattern ' + (d.sel + 1));
  const say = t => { if (status) status.textContent = t; };
  try {
    const samples = []; for (let t = 0; t < DRUM_TRACKS; t++) { const k = drumSmp()[t], f = k && drumLib().find(x => x.key === k); const m = f ? await dsmpMono(f) : null; samples.push(m ? (sxPrepare(m, drumSx()[t], sxPrepOpts(t)) || m) : null); }
    if (EXP.what === 'master') {
      const ch = await exportRender(sr, plan, -1, samples, p => say(`Rendering… ${Math.round(p * 100)}%`));
      say('Encoding ' + ext.toUpperCase() + '…'); await new Promise(res => setTimeout(res, 0));
      const bytes = exportEncode(ch, sr), name = base + ' - Master.' + ext;
      const r = await vdSaveFile(name, bytes); say(r === 'saved' ? `Saved ${name} (${(ch[0].length / sr).toFixed(1)} s, ${(bytes.length / 1048576).toFixed(1)} MB)` : r === 'declined' ? 'Not saved' : 'Could not save');
    } else {
      const tracks = exportStemTracks(plan); if (!tracks.length) { say('Nothing to export: the rendered patterns have no steps.'); return; }
      const files = [];
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        const ch = await exportRender(sr, plan, t, samples, p => say(`Stem ${i + 1} of ${tracks.length} (track ${t + 1}): ${Math.round(p * 100)}%`));
        files.push({ name: `${String(t + 1).padStart(2, '0')} ${exportSafe(drumTrackName(t)) || 'Track ' + (t + 1)}.${ext}`, ch });
      }
      // every stem the same length (the longest tail), so they line up from 0 in any DAW
      const len = Math.max(...files.map(f => f.ch[0].length));
      for (let i = 0; i < files.length; i++) { say(`Encoding stem ${i + 1} of ${files.length}…`); await new Promise(res => setTimeout(res, 0));
        const ch = files[i].ch.map(c => { const a = new Float32Array(len); a.set(c); return a; }); files[i].data = exportEncode(ch, sr); files[i].ch = null; }
      say('Packing ' + files.length + ' stems…');
      const zip = VDENC.zip(files.map(f => ({ name: base + ' - ' + f.name, data: f.data })));
      const r = await vdSaveFile(base + ' - Stems.zip', zip); say(r === 'saved' ? `Saved ${files.length} stems (${(zip.length / 1048576).toFixed(1)} MB)` : r === 'declined' ? 'Not saved' : 'Could not save');
    }
  } catch (e) { say('Export failed: ' + (e && e.message || e)); }
  finally { EXP.busy = false; }
}

// ---------------------------------------------------------------- the EXPORT window
function exportModal() { let m = $('#exportModal'); if (!m) { m = el('div', 'modal'); m.id = 'exportModal'; m.appendChild(el('div', 'sheet exsheet')); m.onclick = e => { if (e.target === m && !EXP.busy) closeExport(); }; document.body.appendChild(m); } return m; }
function openExport() { const m = exportModal(); m.classList.add('open'); renderExport(); }
function closeExport() { const m = $('#exportModal'); if (m) m.classList.remove('open'); }
function renderExport() {
  const sh = exportModal().querySelector('.sheet'); sh.innerHTML = '';
  const h = el('h2'); h.appendChild(el('span', null, 'EXPORT')); h.appendChild(el('span', 'spacer'));
  const x = el('button', 'cbtn', 'Close'); x.onclick = () => { if (!EXP.busy) closeExport(); }; h.appendChild(x); sh.appendChild(h);
  const plan = exportPlan(), row = (label, opts, key, after) => {
    const r = el('div', 'exrow'); r.appendChild(el('b', null, label));
    opts.forEach(([v, t]) => r.appendChild(hbtn(t, 'sm cy' + (EXP[key] === v ? ' on' : ''), () => { EXP[key] = v; exportPrefsSave(); renderExport(); if (after) after(); }, true)));
    sh.appendChild(r); return r; };
  const info = el('div', 'exinfo');
  const tail = EXP.tail === 'ring' ? ' + the effects ringing out (until silence, at most 30 s)' : ' — cut at the end (loop-ready)';
  info.innerHTML = `<b>${plan.label}</b> — ${plan.beats / 4} bar${plan.beats === 4 ? '' : 's'}, ${plan.seconds.toFixed(1)} s at ${S.bpm} BPM${tail}.<br>` +
    (plan.chain ? 'CHAIN is on, so the whole chain is exported once.' : 'CHAIN is off, so the selected pattern is exported once — turn CHAIN on to export the chain.');
  sh.appendChild(info);
  row('EXPORT', [['master', 'MASTER'], ['stems', 'STEMS']], 'what');
  if (EXP.what === 'stems') { const st = exportStemTracks(plan); sh.appendChild(el('div', 'exnote', st.length ? `${st.length} stems: ` + st.map(t => (t + 1) + ' ' + drumTrackName(t)).join(' · ') + ' — each with its own share of the effects, saved together in a .zip.' : 'No track plays in the rendered patterns.')); }
  row('FORMAT', [['wav', 'WAV'], ['flac', 'FLAC'], ['mp3', 'MP3']], 'fmt');
  if (EXP.fmt === 'wav') row('BITS', [[16, '16-bit'], [24, '24-bit'], [32, '32-bit float']], 'wav');
  if (EXP.fmt === 'flac') row('BITS', [[16, '16-bit'], [24, '24-bit']], 'flac');
  if (EXP.fmt === 'mp3') row('BITRATE', [[128, '128'], [192, '192'], [256, '256'], [320, '320 kbps']], 'mp3');
  row('RATE', [[44100, '44.1 kHz'], [48000, '48 kHz']], 'sr');
  row('TAIL', [['ring', 'RING OUT'], ['cut', 'CUT']], 'tail');
  const go = el('div', 'exgo'), status = el('div', 'exstatus', EXP.busy ? 'Exporting…' : '');
  const b = el('button', 'cbtn exbtn', EXP.what === 'stems' ? 'Export stems' : 'Export master');
  b.onclick = async () => { if (EXP.busy) return; b.disabled = true; await exportRun(status); b.disabled = false; };
  go.append(b, status); sh.appendChild(go);
  sh.appendChild(el('div', 'exnote', 'Rendered offline: faster than real time, and the music keeps playing while it works. Tempo, swing, HUMANISE, chance and every effect are as you hear them. MP3 files carry a gapless tag, so they start and end on the exact sample.' + (VD_FRAMED ? ' In this preview, audio files are saved inside a .zip.' : '')));
}
(function exportCSS() {
  const st = document.createElement('style');
  st.textContent = `#exportModal{z-index:67}.exsheet{width:min(36rem,96vw);padding:.7rem .9rem}.exsheet h2{margin:0 0 .4rem;font-size:1.1rem;display:flex;align-items:center;gap:.4rem}
.exrow{display:flex;flex-wrap:wrap;gap:.3rem;align-items:center;margin:.35rem 0}.exrow>b{font:800 .66rem system-ui;letter-spacing:.16em;color:var(--print);width:5.2rem;padding-left:.4rem;border-left:3px solid var(--led);filter:brightness(1.35)}
.exinfo{font-size:.74rem;line-height:1.4;padding:.45rem .55rem;border-radius:.4rem;background:#0b0c0e;margin-bottom:.3rem}.exinfo b{color:var(--led)}
.exnote{font-size:.64rem;opacity:.75;line-height:1.35;margin:.2rem 0 .3rem 5.6rem}.exgo{display:flex;align-items:center;gap:.6rem;margin:.6rem 0 .4rem}.exbtn{font-weight:700}
.exstatus{font-size:.72rem;color:var(--led)}@media (max-width:560px){.exnote{margin-left:0}}`;
  document.head.appendChild(st);
})();
