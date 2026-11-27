/* ============================================================ Vektur Drum — SETTINGS
   Audio engine (sample rate, latency), power (battery saving, don't sleep, background audio), MIDI (input, learn,
   CC map), the parameter & MIDI CC list, the user manual and About. Preferences are this device's (localStorage),
   not part of the project or kits. */
const APP_VERSION = '0.9.1 (web test build)';
const PREFS_KEY = 'vekturdrum.prefs.v1';
const LATENCY = [['interactive', 'Low', 'Shortest buffer: tightest pads and MIDI. Uses the most power; may crackle on a busy device.'],
  ['balanced', 'Balanced', 'A middle buffer: safe for most devices.'],
  ['playback', 'Stable', 'Longest buffer: the most robust and battery-friendly; pads and MIDI respond later.']];
const RATES = [[0, 'Device default'], [44100, '44.1 kHz'], [48000, '48 kHz'], [88200, '88.2 kHz'], [96000, '96 kHz']];

/* Factory MIDI CC map (any channel). MIDI Learn replaces or adds to it; "Reset CC map" restores it. */
function ccFactory() {
  const m = {}, put = (cc, key) => { m['drums:' + key] = { cc, ch: 0 }; };
  for (let t = 1; t <= 9; t++) { put(19 + t, `t${t}.level`); put(29 + t, `t${t}.tune`); put(39 + t, `t${t}.decay`); put(101 + t, `t${t}.pan`); }
  put(7, 'dr.level'); put(9, 'dr.swing'); put(12, 'dr.temper'); put(16, 'dr.human'); put(13, 'dr.dlyfb'); put(14, 'dr.revsize'); put(15, 'dr.dlytone');
  put(50, 'gl.on'); put(51, 'gl.mix'); put(52, 'gl.size'); put(53, 'gl.speed'); put(54, 'gl.mode');
  put(55, 'lfo1.depth'); put(56, 'lfo2.depth'); put(57, 'lfo3.depth'); put(58, 'lfo1.rate'); put(59, 'lfo2.rate'); put(60, 'lfo3.rate');
  put(61, 'sl.on'); put(62, 'sl.mix'); put(63, 'sl.density'); put(64, 'sl.evolve'); put(65, 'sl.hold'); put(66, 'sl.seed'); put(67, 'sl.pitch'); put(68, 'env.gain'); put(69, 'ch.rate');   // NEW: Slicer, env follower, chaos
  return m;
}
const PREFS = (() => {
  const d = { sampleRate: 0, latency: 'interactive', battery: false, noSleep: false, background: false, midiIn: true, ccMap: ccFactory() };
  try { const o = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); if (o && typeof o === 'object') Object.assign(d, o); } catch (e) { }
  if (!LATENCY.some(l => l[0] === d.latency)) d.latency = 'interactive';
  if (!RATES.some(r => r[0] === d.sampleRate)) d.sampleRate = 0;
  if (!d.ccMap || typeof d.ccMap !== 'object') d.ccMap = ccFactory();
  if (d.ccMap['drums:dr.warmth'] && !d.ccMap['drums:dr.temper']) { d.ccMap['drums:dr.temper'] = d.ccMap['drums:dr.warmth']; } delete d.ccMap['drums:dr.warmth'];   // 0.8: Warmth → TEMPER
  return d;
})();
function prefsSave() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(PREFS)); } catch (e) { } }
const SET = { tab: 'audio', learnKey: null, ccDirty: false, lastCC: null, midiPorts: [], wake: null, idleSince: 0, sleeping: false, ccIndex: null };

// ---- audio engine: sample rate and latency need a new audio context (the engine is rebuilt, the music is kept)
function audioContextOptions() { const o = { latencyHint: PREFS.latency }; if (PREFS.sampleRate) o.sampleRate = PREFS.sampleRate; return o; }
async function rebuildAudio() {
  const wasPlaying = !!(SYN.dtel && SYN.dtel[0] > 0);
  if (A.ctx) { try { await A.ctx.close(); } catch (e) { } }
  A.ctx = null; SYN.node = null; SYN.loading = null; SYN.dtel = null; DRM.tel = null; DSMP.sent = '';
  audioEnsure(); const ok = await synthStart();
  if (ok && wasPlaying) drumPost(['z', 1]);
  toast(ok ? `Audio engine: ${(A.ctx.sampleRate / 1000).toFixed(1)} kHz, ${LATENCY.find(l => l[0] === PREFS.latency)[1].toLowerCase()} latency` : 'The audio engine could not restart');
  if (settingsOpen()) renderSettings();
}
function latencyText() {
  if (!A.ctx) return 'Starts on your first tap.';
  const b = A.ctx.baseLatency, o = A.ctx.outputLatency, ms = x => (x * 1000).toFixed(1) + ' ms';
  return `Running at ${(A.ctx.sampleRate / 1000).toFixed(1)} kHz · buffer ${b ? ms(b) : '—'}${o ? ' · output ' + ms(o) : ''} · engine: ${SYN.mode === 'worklet' ? 'AudioWorklet (audio thread)' : SYN.mode === 'script' ? 'compatibility (main thread)' : '—'}`;
}

// ---- power
async function wakeLockApply() {
  if (PREFS.noSleep && !document.hidden) {
    if (SET.wake) return;
    if (!('wakeLock' in navigator)) { toast("This browser can't keep the screen awake"); return; }
    try { SET.wake = await navigator.wakeLock.request('screen'); SET.wake.addEventListener('release', () => { SET.wake = null; }); }
    catch (e) { toast('Keeping the screen awake was refused here'); }
  } else if (!PREFS.noSleep && SET.wake) { try { await SET.wake.release(); } catch (e) { } SET.wake = null; }
}
function mediaSessionApply() {
  try { if ('mediaSession' in navigator && PREFS.background) navigator.mediaSession.metadata = new MediaMetadata({ title: 'Vektur Drum', artist: 'DMT Cymatics — Dream Music Temple' }); } catch (e) { }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (!PREFS.background && A.ctx && A.ctx.state === 'running') A.ctx.suspend().catch(() => { }); }
  else { if (A.ctx && !SET.sleeping) audioEnsure(); wakeLockApply(); }
});
/** Battery saving: LEDs at a quarter of the frame rate; audio sleeps after 20 s stopped and silent (wakes on a tap or a note). */
function batteryTick(now) {
  if (!PREFS.battery || !A.ctx) { SET.idleSince = 0; return; }
  const tel = SYN.dtel, idle = !tel || (tel[0] === 0 && tel[3] < 0.002);
  if (!idle || SET.sleeping) { if (!idle) SET.idleSince = 0; return; }
  if (!SET.idleSince) SET.idleSince = now;
  if (now - SET.idleSince > 20000 && A.ctx.state === 'running') { SET.sleeping = true; A.ctx.suspend().catch(() => { }); }
}
function audioWake() { if (SET.sleeping) { SET.sleeping = false; SET.idleSince = 0; } }
document.addEventListener('pointerdown', audioWake, true);

// ---- MIDI: notes on the drum channel play the drums; CCs move mapped parameters; MIDI Learn maps the next CC
function ccIndex() {
  if (SET.ccIndex) return SET.ccIndex;
  const ix = {}; for (const [path, m] of Object.entries(PREFS.ccMap)) { const k = m.cc; (ix[k] = ix[k] || []).push([path, m.ch]); }
  return (SET.ccIndex = ix);
}
function ccAssign(path, cc, ch) {
  for (const [p, m] of Object.entries(PREFS.ccMap)) if (m.cc === cc && (m.ch === ch || !m.ch || !ch)) delete PREFS.ccMap[p];   // one control → one parameter
  PREFS.ccMap[path] = { cc, ch }; SET.ccIndex = null; prefsSave();
}
function ccClear(path) { delete PREFS.ccMap[path]; SET.ccIndex = null; prefsSave(); }
function vdMidi(st, d1, d2) {
  if (!PREFS.midiIn) return;
  if (st >= 0xF0) return;
  const type = st & 0xF0, ch = (st & 0x0F) + 1;
  if (type === 0xB0) {
    SET.lastCC = { cc: d1, ch, v: d2 };
    const target = SET.learnKey || (midiLearn ? learnPath : null);
    if (target) {
      ccAssign(target, d1, 0); toast(`CC ${d1} → ${paramLabel(target.slice(6))}`);
      SET.learnKey = null; learnPath = null; if (settingsOpen()) renderSettings(); SET.ccDirty = true; return;
    }
    const hits = ccIndex()[d1]; if (!hits) return;
    for (const [path, mch] of hits) if (!mch || mch === ch) { drumSetNorm(path.slice(6), d2 / 127); SET.ccDirty = true; }
    return;
  }
  if (type === 0x90 && d2 > 0) { audioWake(); if (A.ctx && A.ctx.state !== 'running') audioEnsure(); }
  drumsTakeMidi(st, d1, d2);
}
function midiPortsUpdate(acc) { SET.midiPorts = []; acc.inputs.forEach(i => SET.midiPorts.push(i.name || 'MIDI input')); if (settingsOpen() && SET.tab === 'midi') renderSettings(); }

// ---- names
function paramLabel(key) {
  const q = DRUM_PARAMS[DP_ID[key]]; if (!q) return key;
  const m = key.match(/^t(\d)\./); return m ? `Track ${m[1]} · ${q[1]}` : `${q[2] === 'Master' ? '' : q[2] + ' · '}${q[1]}`;
}
function paramRange(q) {
  if (q[3] === 'enum') return q[9].join(' / ');
  if (q[3] === 'bool') return 'off / on';
  return `${drumFmt(q, q[4])} … ${drumFmt(q, q[5])}`;
}

// ---- the panel
function settingsModal() { let m = $('#setModal'); if (!m) { m = el('div', 'modal'); m.id = 'setModal'; m.appendChild(el('div', 'sheet setsheet')); m.onclick = e => { if (e.target === m) closeSettings(); }; document.body.appendChild(m); } return m; }
function settingsOpen() { const m = $('#setModal'); return !!(m && m.classList.contains('open')); }
function openSettings(tab) { if (tab) SET.tab = tab; const m = settingsModal(); document.body.appendChild(m); m.classList.add('open'); renderSettings(); }
function closeSettings() { const m = $('#setModal'); if (m) m.classList.remove('open'); SET.learnKey = null; }

function renderSettings() {
  const sh = settingsModal().querySelector('.sheet'); const keep = sh.querySelector('.setbody'); const y = keep ? keep.scrollTop : 0;
  sh.innerHTML = '';
  const root = el('div', 'dm setdm'); sh.appendChild(root);
  const top = el('div', 'dmtop'); top.appendChild(el('span', 'dmbrand', 'SETTINGS')); top.appendChild(el('span', 'sp'));
  top.appendChild(hbtn('CLOSE', 'sm', closeSettings)); root.appendChild(top);
  const tabs = el('div', 'settabs');
  [['audio', 'AUDIO & POWER'], ['appearance', 'APPEARANCE'], ['project', 'PROJECT'], ['midi', 'MIDI'], ['cc', 'PARAMETERS & CC'], ['manual', 'MANUAL'], ['about', 'ABOUT']].forEach(([k, n]) =>
    tabs.appendChild(hbtn(n, 'sm cy' + (SET.tab === k ? ' on' : ''), () => { SET.tab = k; renderSettings(); $('#setModal .setbody').scrollTop = 0; }, true)));
  root.appendChild(tabs);
  const body = el('div', 'setbody'); root.appendChild(body);
  ({ audio: setAudio, appearance: b => setAppearance(b), project: setProject, midi: setMidi, cc: setCC, manual: setManual, about: setAbout })[SET.tab](body);
  body.scrollTop = y;
}
function setRow(host, title, desc, control) {
  const r = el('div', 'setrow'); const t = el('div', 'settxt'); t.appendChild(el('b', null, title)); if (desc) t.appendChild(el('span', null, desc));
  r.append(t, control); host.appendChild(r); return r;
}
function setToggle(on, f, label) { const b = hbtn(on ? 'ON' : 'OFF', 'wide' + (on ? ' on' : ''), f, true); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', label); return b; }

function setAudio(b) {
  const s1 = sec('AUDIO ENGINE'); b.appendChild(s1);
  const rates = el('div', 'setchoice');
  RATES.forEach(([v, n]) => rates.appendChild(hbtn(n, 'sm' + (PREFS.sampleRate === v ? ' on' : ''), () => { PREFS.sampleRate = v; prefsSave(); rebuildAudio(); }, true)));
  setRow(s1, 'Sample rate', 'Higher rates cost more battery; the drums sound the same at all of them. Changing it restarts the engine (your music is kept).', rates);
  const lat = el('div', 'setchoice');
  LATENCY.forEach(([v, n, d]) => { const x = hbtn(n.toUpperCase(), 'sm' + (PREFS.latency === v ? ' on' : ''), () => { PREFS.latency = v; prefsSave(); rebuildAudio(); }, true); x.title = d; lat.appendChild(x); });
  setRow(s1, 'Latency', LATENCY.find(l => l[0] === PREFS.latency)[2], lat);
  s1.appendChild(el('div', 'oled setoled', latencyText()));
  // NEW (0.8): the insert — run any sound through the Slicer, glitch, tape, delay and reverb (the iOS app's AUv3 effect does
  // this for another app's audio; here, the device's audio input — a line in, an interface or the microphone)
  const si = sec('INSERT INPUT'); b.appendChild(si);
  setRow(si, 'Process an audio input', 'Runs the input through the delay and reverb sends, the glitch, the Slicer and tape, with the drums or without. Use headphones with a microphone.',
    setToggle(!!INS.stream, () => (INS.stream ? insertStop() : insertStart()).then(() => renderSettings()), 'Insert input'));
  const ik = el('div', 'dmknobs'); dKnob(ik, 'in.level', 'Input'); dKnob(ik, 'in.dly', 'Delay'); dKnob(ik, 'in.rev', 'Reverb');
  ik.appendChild(hbtn(drumVal('in.drums') ? 'DRUMS ON' : 'DRUMS OFF', 'sm' + (drumVal('in.drums') ? ' on' : ''), () => { drumSet('in.drums', drumVal('in.drums') ? 0 : 1); renderSettings(); }, true));
  setRow(si, 'Input mix', 'Input level, its delay and reverb sends, and whether the drums play too.', ik);
  const s2 = sec('POWER'); b.appendChild(s2);
  setRow(s2, 'Battery saving mode', 'Lights update less often, and the audio engine sleeps after 20 seconds stopped and silent. A tap or a MIDI note wakes it.',
    setToggle(PREFS.battery, () => { PREFS.battery = !PREFS.battery; prefsSave(); if (!PREFS.battery && SET.sleeping) { audioWake(); audioEnsure(); } renderSettings(); }, 'Battery saving mode'));
  setRow(s2, "Don't sleep", 'Keeps the screen on while Vektur Drum is in front (for performing). Uses more battery.',
    setToggle(PREFS.noSleep, () => { PREFS.noSleep = !PREFS.noSleep; prefsSave(); wakeLockApply(); renderSettings(); }, "Don't sleep"));
  setRow(s2, 'Background audio', 'Keeps playing when you switch to another app or lock the screen, as far as the browser allows (iPadOS may still pause web audio). Off: audio pauses in the background and resumes when you return. The App Store app plays in the background properly.',
    setToggle(PREFS.background, () => { PREFS.background = !PREFS.background; prefsSave(); mediaSessionApply(); renderSettings(); }, 'Background audio'));
}
function setMidi(b) {
  const s = sec('MIDI'); b.appendChild(s);
  setRow(s, 'Enable MIDI input', navigator.requestMIDIAccess ? 'Notes on the drum channel play the tracks (and record while REC is lit); CCs move the parameters in the CC list.' : 'This browser has no Web MIDI (Safari on iPad does not): MIDI works in the App Store app.',
    setToggle(PREFS.midiIn, () => { PREFS.midiIn = !PREFS.midiIn; prefsSave(); if (PREFS.midiIn) midiInit(); renderSettings(); }, 'Enable MIDI input'));
  setRow(s, 'Enable MIDI learn', 'On: tap a knob (it lights cyan), then move a control on your MIDI device — that CC now moves the knob. Or use LEARN in the Parameters & CC list.',
    setToggle(midiLearn, () => { midiLearn = !midiLearn; learnPath = null; renderSettings(); if (drumsOpen()) renderDrums(); toast(midiLearn ? 'MIDI learn on: tap a knob, then move a MIDI control' : 'MIDI learn off'); }, 'Enable MIDI learn'));
  const chs = el('select'); chs.setAttribute('aria-label', 'Drum MIDI channel');
  for (let c = 0; c <= 16; c++) { const o = new Option(c ? 'Channel ' + c : 'Any channel', c); if (c === Math.round(drumVal('dr.ch'))) o.selected = true; chs.appendChild(o); }
  chs.onchange = () => drumSet('dr.ch', +chs.value); const co = el('div', 'oled'); co.style.cssText = 'min-width:0;padding:.1rem'; co.appendChild(chs);
  setRow(s, 'Drum note channel', 'The channel whose notes play the drums (saved with the kit\'s project). CCs are taken on any channel.', co);
  const st = el('div', 'oled setoled');
  st.textContent = (SET.midiPorts.length ? 'Inputs: ' + SET.midiPorts.join(', ') : 'No MIDI inputs found yet.') + (SET.lastCC ? `\nLast CC: ${SET.lastCC.cc} = ${SET.lastCC.v} (channel ${SET.lastCC.ch})` : '');
  s.appendChild(st);
}
function setCC(b) {
  const s0 = sec('MIDI NOTES'); b.appendChild(s0);
  const nt = el('table', 'settab'); nt.innerHTML = '<tr><th>Track</th><th>Note</th><th>Sound now</th></tr>' + DRUM_NOTES.map((n, t) => `<tr><td>Track ${t + 1}</td><td>${n} (${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][n % 12]}${Math.floor(n / 12) - 1})</td><td>${drumTrackName(t)}</td></tr>`).join('');
  s0.appendChild(nt); s0.appendChild(el('div', 'dmnote', `On channel ${Math.round(drumVal('dr.ch')) || 'any'}. Notes from 36 upwards that aren't listed wrap round the tracks.`));
  const s = sec('PARAMETERS & MIDI CC'); b.appendChild(s);
  const bar = el('div', 'setchoice');
  bar.appendChild(hbtn('RESET CC MAP', 'sm', () => { if (!confirm('Restore the factory CC map? Your learned CCs are removed.')) return; PREFS.ccMap = ccFactory(); SET.ccIndex = null; prefsSave(); renderSettings(); }));
  bar.appendChild(hbtn('CLEAR ALL CCs', 'sm', () => { if (!confirm('Remove every CC assignment?')) return; PREFS.ccMap = {}; SET.ccIndex = null; prefsSave(); renderSettings(); }));
  if (SET.learnKey) bar.appendChild(el('span', 'setlearn', `Move a MIDI control for ${paramLabel(SET.learnKey.slice(6))}…`));
  s.appendChild(bar);
  s.appendChild(el('div', 'dmnote', 'Every parameter, its range and its MIDI CC. LEARN: the next CC you move is assigned. Assignments are this device\'s, for any channel.'));
  const groups = [];
  for (let t = 1; t <= 9; t++) groups.push([`Track ${t} · ${drumTrackName(t - 1)}`, DRUM_PARAMS.filter(q => q[0].startsWith(`t${t}.`))]);
  groups.push(['Master, delay and reverb', DRUM_PARAMS.filter(q => q[0].startsWith('dr.'))], ['Glitch and LFOs', DRUM_PARAMS.filter(q => /^(gl|lfo)/.test(q[0]))],
    ['Slicer', DRUM_PARAMS.filter(q => q[0].startsWith('sl.'))], ['Envelope follower and chaos', DRUM_PARAMS.filter(q => /^(env|ch)\./.test(q[0]))]);   // NEW
  const seen = new Set(groups.flatMap(g => g[1].map(q => q[0]))), rest = DRUM_PARAMS.filter(q => !seen.has(q[0]));
  if (rest.length) groups.push(['Other', rest]);   // never leave a parameter out of the list
  groups.forEach(([name, qs], gi) => {
    const det = el('details', 'setgrp'); if (gi === 0 || gi >= 9) det.open = true;
    const mapped = qs.filter(q => PREFS.ccMap['drums:' + q[0]]).length;
    det.appendChild(el('summary', null, `${name}<em>${mapped ? mapped + ' on CC' : ''}</em>`));
    const tb = el('table', 'settab'); tb.innerHTML = '<tr><th>Parameter</th><th>Range</th><th>Default</th><th>CC</th><th></th></tr>';
    qs.forEach(q => {
      const path = 'drums:' + q[0], m = PREFS.ccMap[path], tr = el('tr');
      tr.innerHTML = `<td>${q[1]}</td><td>${paramRange(q)}</td><td>${q[3] === 'enum' ? q[9][q[6]] : q[3] === 'bool' ? (q[6] ? 'on' : 'off') : drumFmt(q, q[6])}</td><td class="mono">${m ? 'CC ' + m.cc + (m.ch ? ' ch ' + m.ch : '') : '—'}</td>`;
      const td = el('td', 'setcc');
      const lb = hbtn(SET.learnKey === path ? 'LISTENING' : 'LEARN', 'sm cy' + (SET.learnKey === path ? ' on' : ''), () => { SET.learnKey = SET.learnKey === path ? null : path; renderSettings(); }, true);
      lb.setAttribute('aria-label', 'Learn a MIDI CC for ' + paramLabel(q[0])); td.appendChild(lb);
      if (m) { const x = hbtn('✕', 'sm', () => { ccClear(path); renderSettings(); }); x.setAttribute('aria-label', 'Remove the CC from ' + paramLabel(q[0])); td.appendChild(x); }
      tr.appendChild(td); tb.appendChild(tr);
    });
    det.appendChild(tb); s.appendChild(det);
  });
}
function setAbout(b) {
  const s = sec('ABOUT'); b.appendChild(s);
  const a = el('div', 'setabout');
  a.innerHTML = `<img class="setlogo" src="${DMT_LOGO_256}" alt="DMT Cymatics logo"><h3>VEKTUR DRUM</h3><p class="mono">Hybrid drum machine · Version ${APP_VERSION}</p>
<p>Vektur Drum is created by <b>DMT Cymatics — Dream Music Temple</b>.</p>
<p>Bug reports or questions: <a href="mailto:DMTcymatics@humanoid.net">DMTcymatics@humanoid.net</a></p>
<p>Website: <a href="https://DreamMusicTemple.com" target="_blank" rel="noopener">DreamMusicTemple.com</a></p>
<p class="setcopy">© 2026 DMT Cymatics / Dream Music Temple. All rights reserved.</p>`;
  s.appendChild(a);
  const t = sec('THIS DEVICE'); b.appendChild(t);
  t.appendChild(el('div', 'oled setoled', latencyText() + `\nMIDI: ${navigator.requestMIDIAccess ? (PREFS.midiIn ? 'on' : 'off') : 'not available in this browser'} · Screen lock: ${'wakeLock' in navigator ? 'supported' : 'not supported'}`));
}

function setManual(b) {
  const s = sec('USER MANUAL'); b.appendChild(s);
  const toc = el('div', 'settoc'); MANUAL.forEach(([t], i) => { const a = hbtn(t.toUpperCase(), 'sm', () => { const h = $('#man' + i); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); toc.appendChild(a); });
  s.appendChild(toc);
  const doc = el('div', 'setman');
  MANUAL.forEach(([t, html], i) => { const h = el('h3', null, t); h.id = 'man' + i; doc.appendChild(h); const d = el('div'); d.innerHTML = html; doc.appendChild(d); });
  s.appendChild(doc);
}

(function settingsCSS() {
  const st = document.createElement('style');
  st.textContent = `#setModal{z-index:75}#setModal .setsheet{width:min(56rem,98vw);max-height:94dvh;padding:0;background:none;border:0;overflow:hidden;display:flex}
.setdm{display:flex;flex-direction:column;width:100%;max-height:94dvh;border-radius:.7rem}
.settabs{display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.5rem}
.setbody{overflow:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:.5rem;padding-bottom:.4rem}
.setrow{display:flex;gap:.8rem;align-items:center;justify-content:space-between;padding:.45rem .1rem;border-bottom:1px solid #222428}
.setrow:last-of-type{border-bottom:0}.settxt{display:flex;flex-direction:column;gap:.15rem;max-width:34rem}
.settxt b{font-size:.78rem;letter-spacing:.08em;color:#e4e1d8}.settxt span{font-size:.68rem;color:var(--print);line-height:1.4}
.setchoice{display:flex;gap:.25rem;flex-wrap:wrap;justify-content:flex-end;align-items:center}
.setoled{white-space:pre-wrap;margin-top:.35rem;font-size:.66rem;min-width:0}
.setlearn{font-size:.68rem;color:var(--cyan);margin-left:.4rem}
.setgrp{margin:.25rem 0;border-radius:.35rem;background:#0d0e10;padding:.3rem .5rem}
.setgrp summary{cursor:pointer;font-size:.72rem;letter-spacing:.1em;color:#e4e1d8;padding:.25rem 0}.setgrp summary em{font-style:normal;color:var(--led);margin-left:.6rem;font-size:.62rem}
.settab{width:100%;border-collapse:collapse;font-size:.68rem;color:#d8d4c8}
.settab th{text-align:left;font-size:.56rem;letter-spacing:.14em;color:var(--print);padding:.25rem .3rem;border-bottom:1px solid #26282c}
.settab td{padding:.22rem .3rem;border-bottom:1px solid #1a1b1e;vertical-align:middle}.settab td.mono{font-family:ui-monospace,Menlo,monospace;color:var(--cyan)}
.setcc{white-space:nowrap;text-align:right}.setcc .hb{height:1.6rem;min-width:0}
.setabout{padding:.3rem .2rem;color:#e4e1d8;font-size:.8rem;line-height:1.55}.setabout .setlogo{display:block;width:min(11rem,55vw);height:auto;aspect-ratio:1;margin:.4rem auto .6rem;border-radius:50%;box-shadow:0 0 22px rgba(120,90,255,.35)}.setabout h3{letter-spacing:.35em;margin:.2rem 0;color:#e4e1d8}
.setabout a,.setman a{color:var(--cyan)}.setcopy{color:var(--print);font-size:.7rem}
.settoc{display:flex;flex-wrap:wrap;gap:.25rem;margin-bottom:.4rem}.settoc .hb{height:1.7rem;font-size:.52rem}
.setman{color:#d8d4c8;font-size:.78rem;line-height:1.55;max-width:46rem}.setman h3{font-size:.78rem;letter-spacing:.18em;text-transform:uppercase;color:var(--led);margin:1rem 0 .3rem}
.setman ul{padding-left:1.1rem;margin:.3rem 0}.setman li{margin:.2rem 0}.setman p{margin:.35rem 0}
@media (max-width:640px){.setrow{flex-direction:column;align-items:flex-start}.setchoice{justify-content:flex-start}}`;
  document.head.appendChild(st);
})();

/* NEW (0.8): the insert input (web): the device's audio input into the engine's input. */
const INS = { stream: null, src: null };
async function insertStart() {
  try {
    if (!(await synthStart()) || !SYN.node || SYN.mode !== 'worklet') { toast('The insert needs the AudioWorklet engine'); return; }
    INS.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } });
    INS.src = A.ctx.createMediaStreamSource(INS.stream); INS.src.connect(SYN.node);
    if (!drumState().on) await drumsSetOn(true);
    toast('Insert on: the input runs through the effects');
  } catch (e) { INS.stream = null; toast('No audio input: ' + (e.message || e)); }
}
async function insertStop() { try { if (INS.src) INS.src.disconnect(); if (INS.stream) INS.stream.getTracks().forEach(tr => tr.stop()); } catch (e) { } INS.src = INS.stream = null; toast('Insert off'); }
