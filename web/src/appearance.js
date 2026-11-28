/* ============================================================ Vektur Drum — NEW (0.7): colours (SETTINGS → APPEARANCE)
   13 themes, or your own: LED colour (lit buttons, steps, pads, dial lights), display colour (the OLEDs, selection),
   dial arc colour, chassis tone and top strip. Saved on this device. tools/gen_manual.js copies THEMES / CHASSIS / STRIPS
   into the native app (VekturDrumCore/Appearance+Generated.swift), so both apps offer the same colours. */
const THEMES = [
  ['amber', 'Amber', { led: '#ffb23d', disp: '#3dd6ff', arc: '#ffb23d', chassis: 'graphite', strip: 'alu' }],
  ['cyanlab', 'Cyan Lab', { led: '#3dd6ff', disp: '#7dffcf', arc: '#3dd6ff', chassis: 'blue', strip: 'dark' }],
  ['magenta', 'Magenta', { led: '#ff4fd8', disp: '#ffb3f0', arc: '#ff4fd8', chassis: 'graphite', strip: 'dark' }],
  ['lime', 'Lime Acid', { led: '#b6ff3d', disp: '#e8ff9a', arc: '#b6ff3d', chassis: 'black', strip: 'dark' }],
  ['ice', 'Ice', { led: '#bfe9ff', disp: '#ffffff', arc: '#8fd3ff', chassis: 'blue', strip: 'alu' }],
  ['sunset', 'Sunset', { led: '#ff6a3d', disp: '#ffd23d', arc: '#ff8a3d', chassis: 'warm', strip: 'copper' }],
  ['ocean', 'Ocean', { led: '#2fe0c4', disp: '#6fb8ff', arc: '#2fe0c4', chassis: 'blue', strip: 'dark' }],
  ['ruby', 'Ruby', { led: '#ff3d55', disp: '#ff9aa8', arc: '#ff3d55', chassis: 'black', strip: 'dark' }],
  ['gold', 'Gold & Ink', { led: '#e8c46a', disp: '#e8c46a', arc: '#e8c46a', chassis: 'black', strip: 'gold' }],
  ['neon', 'Neon Night', { led: '#ff2fd0', disp: '#2ff4ff', arc: '#2ff4ff', chassis: 'purple', strip: 'dark' }],
  ['forest', 'Forest', { led: '#7fdc6a', disp: '#c8f08c', arc: '#7fdc6a', chassis: 'green', strip: 'dark' }],
  ['mono', 'Mono', { led: '#e8e8e8', disp: '#c8c8c8', arc: '#e8e8e8', chassis: 'graphite', strip: 'alu' }],
  ['temple', 'Dream Temple', { led: '#c98bff', disp: '#ffd27a', arc: '#c98bff', chassis: 'purple', strip: 'gold' }],
];
// chassis: top, upper, body, section top, section bottom, page
const CHASSIS = {
  graphite: ['Graphite', '#2a2c30', '#1c1d20', '#18191b', '#111214', '#16171a', '#0c0d0e'],
  black: ['Black', '#1b1b1c', '#111112', '#0d0d0e', '#080809', '#0e0e10', '#050506'],
  blue: ['Midnight blue', '#252b35', '#1a1f27', '#161a21', '#0e1218', '#141922', '#0a0d12'],
  warm: ['Warm walnut', '#2f2a25', '#211d1a', '#1b1816', '#13110f', '#191614', '#0e0c0b'],
  purple: ['Plum', '#2a2433', '#1d1926', '#18151f', '#100e16', '#16131e', '#0b0910'],
  green: ['Moss', '#232b25', '#18201a', '#141a15', '#0d120e', '#121914', '#090c0a'],
};
// top strip: light, mid, dark, lettering
const STRIPS = {
  alu: ['Brushed aluminium', '#7d8086', '#55585d', '#45484c', '#1a1b1d'],
  dark: ['Dark anodised', '#3a3d43', '#2a2c31', '#222428', '#d8d4c8'],
  copper: ['Copper', '#a86a45', '#7a4a2f', '#5c3824', '#1a1210'],
  gold: ['Gold', '#b89a55', '#8a7038', '#6a5428', '#17130b'],
};
function themeOf() {
  const t = PREFS.theme && typeof PREFS.theme === 'object' ? PREFS.theme : {};
  const base = (THEMES.find(x => x[0] === t.id) || THEMES[0])[2];
  const hex = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : null;
  return { id: t.id || 'amber', led: hex(t.led) || base.led, disp: hex(t.disp) || base.disp, arc: hex(t.arc) || base.arc,
    chassis: CHASSIS[t.chassis] ? t.chassis : base.chassis, strip: STRIPS[t.strip] ? t.strip : base.strip };
}
function mixHex(a, b, k) {   // a → b by k
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
function applyTheme() {
  const th = themeOf(), c = CHASSIS[th.chassis], s = STRIPS[th.strip];
  let st = document.getElementById('vdTheme'); if (!st) { st = document.createElement('style'); st.id = 'vdTheme'; }
  document.head.appendChild(st);   // always last: wins over the panel's own colours
  st.textContent = `body,body .dm{--led:${th.led};--ledlo:${mixHex(th.led, '#000000', .78)};--cyan:${th.disp};--ice:${mixHex(th.disp, '#ffffff', .6)};--accent:${th.led};--accentText:#111}
body .knob{--kled:${th.arc}}
${th.led === '#ffb23d' ? '' : `body .dm .st.on::before{box-shadow:0 0 5px ${th.led}b3}body .dm .st.acc::before{background:${mixHex(th.led, '#ffffff', .35)};box-shadow:0 0 7px ${th.led}}`}
body .dm .pad.hit i{background:${th.led};box-shadow:0 0 6px ${th.led}}
html,body{background:${c[6]}}
body #drumModal .dm{background:linear-gradient(180deg,${c[1]} 0,${c[2]} .5rem,${c[3]} 100%)}
body .dm .dmsec{background:linear-gradient(var(--zt,transparent),var(--zt,transparent)),linear-gradient(180deg,${c[4]},${c[5]})}
body .dm .dmtop{background:repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px),linear-gradient(180deg,${s[1]},${s[2]} 55%,${s[3]})}
body .dm .dmbrand,body .dm .dmbrand small,body .dm .dmpre,body .dm .dmtc b{color:${s[4]}}
body .sheet{background:${c[3]};border-color:${mixHex(c[3], '#ffffff', .12)}}
body .modbar{background:linear-gradient(180deg,${s[1]},${s[3]})}body .modbar>b{color:${s[4]}}`;
  document.documentElement.style.colorScheme = 'dark';
  try { DIAL.color = th.arc; if (drumsOpen() && DIAL.style !== 'classic') renderDrums(); } catch (e) { }   // dials.js loads after this module
}
function setAppearance(b) {
  const th = themeOf();
  const s0 = sec('DIALS'); b.appendChild(s0);   // NEW (0.8): dial designs from Vektur Vocal and Vektur Vortex
  const dg = el('div', 'thgrid dialgrid');
  DIAL_STYLES.forEach(([id, name, from]) => {
    const btn = el('button', 'thtile dialtile' + (DIAL.style === id ? ' on' : '')); btn.style.cssText = `--l:${th.led};--c:#15171a`;
    const kh = el('div', 'dialprev'); btn.appendChild(kh); btn.appendChild(el('b', null, name)); btn.appendChild(el('small', null, from === 'Drum' ? 'Vektur Drum' : 'from Vektur ' + from));
    btn.onclick = () => { dialSet(id); renderSettings(); };
    dg.appendChild(btn);
    const keep = DIAL.style; DIAL.style = id; const was = document.body.className;   // a live preview dial in each tile
    if (id !== 'classic') document.body.classList.add('dialx');
    const k = el('div', 'knob'); k.append(el('u'), el('b'), el('i')); k.style.setProperty('--a', '45deg'); k.style.setProperty('--s', '0deg'); k.style.setProperty('--e', '180deg'); kh.appendChild(k);
    k.style.width = k.style.height = '2.6rem'; if (id !== 'classic') { k.classList.add('prevx'); dialPaint(k, .67, 0, false); }
    DIAL.style = keep; document.body.className = was;
  });
  s0.appendChild(dg);
  const sS = sec('STEP DESIGN'); b.appendChild(sS);   // NEW (0.9.1): three looks for the sequencer steps
  const sg = el('div', 'thgrid dialgrid');
  STEP_STYLES.forEach(([id, name, desc]) => {
    const btn = el('button', 'thtile dialtile' + (stepStyle() === id ? ' on' : '')); btn.style.cssText = `--l:${th.led};--c:#15171a`;
    const pv = el('div', 'stepprev steps-' + id); [1, 0, 2, 1].forEach(v => { const c = el('div', 'st' + (v === 1 ? ' on' : v === 2 ? ' on acc' : '')); pv.appendChild(c); });
    btn.append(pv, el('b', null, name), el('small', null, desc));
    btn.onclick = () => { PREFS.steps = id; prefsSave(); stepStyleApply(); renderSettings(); }; sg.appendChild(btn);
  });
  sS.appendChild(sg);
  const s1 = sec('THEMES'); b.appendChild(s1);
  const g = el('div', 'thgrid');
  THEMES.forEach(([id, name, t]) => {
    const btn = el('button', 'thtile' + (th.id === id ? ' on' : '')), c = CHASSIS[t.chassis], s = STRIPS[t.strip];
    btn.style.cssText = `--l:${t.led};--d:${t.disp};--a:${t.arc};--c:${c[4]};--s:${s[1]}`;
    btn.innerHTML = `<i class="thstrip"></i><span class="thsw"><i style="background:var(--l)"></i><i style="background:var(--d)"></i><i style="background:var(--a)"></i></span><b>${name}</b>`;
    btn.onclick = () => { PREFS.theme = { id }; prefsSave(); applyTheme(); renderSettings(); };
    g.appendChild(btn);
  });
  s1.appendChild(g);
  const s2 = sec('YOUR COLOURS'); b.appendChild(s2);
  const pick = (key, title, desc) => {
    const inp = document.createElement('input'); inp.type = 'color'; inp.value = th[key]; inp.className = 'thcol'; inp.setAttribute('aria-label', title);
    inp.oninput = () => { PREFS.theme = Object.assign({}, PREFS.theme, { id: th.id, [key]: inp.value }); applyTheme(); };
    inp.onchange = () => { prefsSave(); };
    setRow(s2, title, desc, inp);
  };
  pick('led', 'LED colour', 'Lit buttons, steps, pads, dial values and the playhead.');
  pick('disp', 'Display colour', 'The displays, selections and the second LED colour.');
  pick('arc', 'Dial arc colour', 'The lit ring on every dial.');
  const choice = (key, table, title, desc) => {
    const row = el('div', 'setchoice');
    Object.entries(table).forEach(([k, v]) => row.appendChild(hbtn(v[0].toUpperCase(), 'sm' + (th[key] === k ? ' on' : ''), () => { PREFS.theme = Object.assign({}, PREFS.theme, { id: th.id, [key]: k }); prefsSave(); applyTheme(); renderSettings(); }, true)));
    setRow(s2, title, desc, row);
  };
  choice('chassis', CHASSIS, 'Chassis', 'The body and the panel sections.');
  choice('strip', STRIPS, 'Top strip', 'The bar with the name and the main buttons.');
  const rs = el('div', 'setchoice'); rs.appendChild(hbtn('RESET TO THE THEME', 'sm', () => { PREFS.theme = { id: th.id }; prefsSave(); applyTheme(); renderSettings(); }));
  setRow(s2, 'Reset', 'Back to the chosen theme’s own colours.', rs);
}
(function () {
  const st = document.createElement('style');
  st.textContent = `.thgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(7.4rem,1fr));gap:.35rem}
.thtile{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:.25rem;padding:.9rem .45rem .4rem;border:1px solid #3a3d44;border-radius:.45rem;background:var(--c);color:#e4e1d8;text-align:left;overflow:hidden}
.thtile .thstrip{position:absolute;left:0;right:0;top:0;height:.45rem;background:var(--s)}.thtile b{font-size:.7rem;letter-spacing:.04em}
.thtile .thsw{display:flex;gap:.2rem}.thtile .thsw i{width:.9rem;height:.9rem;border-radius:50%;box-shadow:0 0 5px currentColor}
.thtile.on{outline:2px solid var(--l);outline-offset:1px}
.dialgrid{grid-template-columns:repeat(auto-fill,minmax(6.4rem,1fr))}.dialtile{align-items:center;padding:.45rem .3rem .35rem}.dialtile small{font-size:.5rem;opacity:.6}
.dialprev{height:3.4rem;display:flex;align-items:center;justify-content:center}.dialprev .knob.prevx>u,.dialprev .knob.prevx>b,.dialprev .knob.prevx>i{display:none}.dialprev .knob .kv{position:absolute;left:-15%;top:-15%;width:130%;height:130%;pointer-events:none}.dialprev .knob .kpc{fill:var(--l)}
.thcol{width:3.2rem;height:1.9rem;border:1px solid #3a3d44;border-radius:.3rem;background:#111;padding:.1rem}`;
  document.head.appendChild(st);
})();
/** NEW (0.9.1): step designs — Classic (LED strip on a key), Glass (lit glass tiles), Neon ring (glowing rings). */
const STEP_STYLES = [['classic', 'Classic', 'LED strip on a key'], ['glass', 'Glass', 'lit glass tiles'], ['neon', 'Neon ring', 'glowing rings']];
function stepStyle() { return STEP_STYLES.some(x => x[0] === PREFS.steps) ? PREFS.steps : 'classic'; }
function stepStyleApply() { STEP_STYLES.forEach(([id]) => document.body.classList.toggle('steps-' + id, id === stepStyle() && id !== 'classic')); }
(function () {
  const st = document.createElement('style');
  const G = 'body.steps-glass .dm .st,.stepprev.steps-glass .st', N = 'body.steps-neon .dm .st,.stepprev.steps-neon .st';
  const g = (sfx) => G.split(',').map(x => x + sfx).join(','), n = (sfx) => N.split(',').map(x => x + sfx).join(',');
  st.textContent = `${G}{background:linear-gradient(180deg,rgba(255,255,255,.13),rgba(255,255,255,.035) 55%,rgba(0,0,0,.18));border:1px solid rgba(255,255,255,.13);border-radius:.45rem;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 .1rem .2rem rgba(0,0,0,.55)}
${g('::before')}{left:12%;right:12%;top:auto;bottom:.28rem;height:.16rem;border-radius:.1rem;background:rgba(255,255,255,.08);box-shadow:none}
${g('.on')}{background:linear-gradient(180deg,color-mix(in srgb,var(--led,#ffb23d) 62%,#fff 8%),color-mix(in srgb,var(--led,#ffb23d) 22%,transparent) 70%,rgba(0,0,0,.2));border-color:color-mix(in srgb,var(--led,#ffb23d) 70%,#fff 10%);box-shadow:0 0 11px color-mix(in srgb,var(--led,#ffb23d) 45%,transparent),inset 0 1px 0 rgba(255,255,255,.45)}
${g('.on::before')}{background:rgba(255,255,255,.75);box-shadow:0 0 6px #fff}
${g('.acc')}{box-shadow:0 0 16px color-mix(in srgb,var(--led,#ffb23d) 75%,transparent),inset 0 0 0 1px #fff,inset 0 1px 0 rgba(255,255,255,.6)}
${g('.ph')}{background:linear-gradient(180deg,rgba(255,255,255,.4),rgba(255,255,255,.12))}
${N}{background:radial-gradient(circle at 50% 42%,#191b20,#0b0c0f 75%);border:1px solid #1d1f24;border-radius:.4rem;box-shadow:inset 0 0 0 1px rgba(255,255,255,.03)}
${n('::before')}{left:50%;right:auto;top:42%;width:1.05rem;height:1.05rem;transform:translate(-50%,-50%);border-radius:50%;background:transparent;border:2px solid #30333a;box-shadow:none}
${n('.on::before')}{border-color:var(--led,#ffb23d);background:radial-gradient(circle,color-mix(in srgb,var(--led,#ffb23d) 55%,transparent),transparent 72%);box-shadow:0 0 9px var(--led,#ffb23d),inset 0 0 5px var(--led,#ffb23d)}
${n('.acc::before')}{border-width:3px;border-color:#fff;box-shadow:0 0 12px var(--led,#ffb23d),0 0 3px #fff,inset 0 0 7px var(--led,#ffb23d)}
${n('.ph')}{background:radial-gradient(circle at 50% 42%,#2c2f37,#14151a 75%)}${n('.ph::before')}{border-color:#fff;box-shadow:0 0 8px #fff}
.stepprev{display:grid;grid-template-columns:repeat(4,1.05rem);gap:.18rem;height:3.4rem;align-items:center}.stepprev .st{height:1.9rem;pointer-events:none;--led:var(--l)}
.stepprev.steps-classic .st::before{left:18%;right:18%}`;
  document.head.appendChild(st);
})();
applyTheme(); stepStyleApply();
