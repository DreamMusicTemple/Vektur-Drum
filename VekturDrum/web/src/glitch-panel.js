/* ============================================================ Vektur Drum — GLITCH panel (new)
   Global glitch on the master bus, after delay and reverb: STUTTER (repeats the slice that just played, re-captured
   every beat), REVERSE (each slice plays the previous one backwards), METAL STRETCH (cyclic time-stretch: short grains
   replayed from a slowly advancing source, which rings metallic at the grain rate — the 90s jungle sampler sound).
   Mix, Size and Speed are the targets of three LFOs (free Hz or synced to the beat). */
const GL_SLICE_NAMES = ['1/32', '1/16', '1/8', '1/4', '1/2'];

/** NEW (0.8): the Glitch section is gone from the main screen. Its metal-stretch engine lives on as METALISE in the Slicer
    window (renderMetalise); the three LFOs keep their row here and modulate Metalise's Mix / Grain / Stretch. */
function renderGlitch(root) {
  const row = el('div', 'dmrow dmlforow');
  DRM.els.lfo = [];
  for (let i = 1; i <= 3; i++) {
    const k = `lfo${i}`, s = sec('LFO ' + i, LFO_DESTS[Math.round(drumVal(k + '.dest'))].toUpperCase()); s.classList.add('dmlfo', 'z-mod');
    const led = el('i', 'dmlfoled'); s.appendChild(led); DRM.els.lfo.push(led);
    { const c = modChip(i - 1); c.classList.add('dmlfochip'); c.title = 'NEW: drag LFO ' + i + ' onto any dial to modulate it'; s.appendChild(c); }
    const kk = el('div', 'dmknobs');
    if (drumVal(k + '.sync')) {
      const dd = el('div', 'kcell'); dd.appendChild(el('span', 'klbl', 'Division')); const dsel = el('select'); dsel.setAttribute('aria-label', `LFO ${i} division`);
      LFO_DIVS.forEach((n, j) => { const o = new Option(n, j); if (j === Math.round(drumVal(k + '.div'))) o.selected = true; dsel.appendChild(o); });
      dsel.onchange = () => drumSet(k + '.div', +dsel.value); const ol = el('div', 'oled'); ol.style.cssText = 'min-width:0;padding:.1rem'; ol.appendChild(dsel); dd.appendChild(ol); kk.appendChild(dd);
    } else dKnob(kk, k + '.rate', 'Rate');
    dKnob(kk, k + '.depth', 'Depth');
    s.appendChild(kk);
    const opts = el('div', 'dmlfoopts');
    const pick = (key, list, label) => { const se = el('select'); se.setAttribute('aria-label', `LFO ${i} ${label}`);
      list.forEach((n, j) => { const o = new Option(n, j); if (j === Math.round(drumVal(key))) o.selected = true; se.appendChild(o); });
      se.onchange = () => { drumSet(key, +se.value); renderDrums(); }; const ol = el('div', 'oled'); ol.style.cssText = 'min-width:0;padding:.1rem'; ol.appendChild(se); return ol; };
    opts.append(pick(k + '.shape', LFO_SHAPES, 'shape'), pick(k + '.dest', LFO_DESTS.map(n => '→ ' + n.replace('Metal ', '').toUpperCase()), 'Metalise destination'));
    const sy = hbtn('SYNC', 'sm cy' + (drumVal(k + '.sync') ? ' on' : ''), () => { drumSet(k + '.sync', drumVal(k + '.sync') ? 0 : 1); renderDrums(); }, true);
    sy.title = 'Sync to the beat (divisions) instead of a free rate in Hz'; opts.appendChild(sy);
    s.appendChild(opts);
    if (Math.round(drumVal(k + '.shape')) === 5) s.appendChild(lfoDrawEditor(i - 1, 168, 48));   // NEW (0.9.1): DRAW
    row.appendChild(s);
  }
  root.appendChild(row);
}
/** METALISE (Slicer window): the glitch engine in its metal-stretch mode — cyclic time-stretch whose grain length rings as a
    pitch. ON forces the metal mode (kits saved with the old Stutter / Reverse glitch keep playing it until Metalise is pressed). */
function renderMetalise(host, after) {
  const box = el('div', 'slmetal');
  const on = !!drumVal('gl.on'), mode = Math.round(drumVal('gl.mode')), metal = on && mode === 2;
  const hd = el('div', 'slmetalhd'); hd.appendChild(el('b', null, 'METALISE'));
  const b = hbtn(metal ? 'ON' : 'OFF', 'sm rec' + (metal ? ' on' : ''), () => { if (metal) drumSet('gl.on', 0); else { drumSet('gl.mode', 2); drumSet('gl.on', 1); } renderSlicer(); if (drumsOpen()) renderDrums(); }, true);
  b.setAttribute('aria-label', 'Metalise on or off — touch and hold to automate it'); b.dataset.modKey = 'gl.on';   // 0.9.1: hold → LFO or chance
  if (drumWiredKeys().has('gl.on') || drumVal('gl.chance') > 0) b.classList.add('wired');
  b.title = 'Touch and hold: automate ON / OFF with an LFO, or give it a chance'; hd.appendChild(b); box.appendChild(hd);
  if (drumVal('gl.chance') > 0) hd.appendChild(el('small', 'slmetalch', Math.round(drumVal('gl.chance') * 100) + '% / ' + GL_CHDIVS[Math.round(drumVal('gl.chdiv'))]));
  if (on && mode !== 2) box.appendChild(el('div', 'slmetalold', 'this kit plays the old ' + GLITCH_MODES[mode].toUpperCase() + ' glitch — tap OFF→ON for Metalise'));
  const kn = el('div', 'dmknobs');
  dKnob(kn, 'gl.mix', 'Mix', { fmt: t => Math.round(t * 100) + '%' });
  dKnob(kn, 'gl.size', 'Grain', { fmt: t => (3 * Math.pow(20, t)).toFixed(t < .4 ? 1 : 0) + ' ms' });
  dKnob(kn, 'gl.speed', 'Stretch', { fmt: t => Math.round((0.25 + 0.75 * t) * 100) + '%' });
  box.appendChild(kn);
  box.title = 'Metalise: grains replay from a source that falls behind and jumps back — the grain length rings as a pitch. Short grains = higher, harsher metal; lower Stretch = slower, more smeared. LFO 1–3 can move Mix, Grain and Stretch.';
  if (after && after.nextSibling) host.insertBefore(box, after.nextSibling); else host.appendChild(box);
  return box;
}
/** LFO LEDs follow the audio thread's LFO values (only while the glitch is on). */
function paintGlitchLive(tel) {
  const L = DRM.els && DRM.els.lfo; if (!L || !L.length) return;
  for (let i = 0; i < 3; i++) { const v = tel[4 + 3 * DRUM_TRACKS + i] || 0, a = (0.15 + 0.85 * (v * 0.5 + 0.5)).toFixed(2);
    if (L[i].dataset.a !== a) { L[i].dataset.a = a; L[i].style.opacity = a; } }
}
(function glitchCSS() {
  const st = document.createElement('style');
  st.textContent = `.dmtc{display:flex;align-items:center;gap:.2rem;margin-right:.4rem}.dmtc b{font-size:.55rem;letter-spacing:.18em;color:#2c2e31;margin-right:.2rem}
.dmeng{display:flex;flex-wrap:wrap;gap:.25rem;align-items:center;margin-bottom:.35rem}.dmeng>.hb{min-width:4.2rem}
.dmchoke{display:flex;gap:.18rem;align-items:center;margin-left:auto}.dmchoke b{font-size:.55rem;letter-spacing:.16em;color:var(--print);margin-right:.15rem}.dmchoke .hb{min-width:1.9rem}
.dmfm{padding:.25rem 0 .35rem;margin-bottom:.3rem;border-bottom:1px solid #26282c}
.slmetal{display:flex;flex-direction:column;gap:.15rem;padding:.25rem .35rem .2rem;border-radius:.45rem;background:rgba(0,0,0,.45);box-shadow:inset 0 0 0 1px #ffffff12;margin:0 .2rem}
.slmetalhd{display:flex;align-items:center;gap:.35rem}.slmetalhd b{font:800 .68rem system-ui;letter-spacing:.18em;color:var(--print);padding-left:.4rem;border-left:3px solid var(--led);filter:brightness(1.35)}.slmetalold{font-size:.55rem;color:#c98a4a;max-width:11rem}.slmetalch{font:700 .55rem ui-monospace,monospace;color:var(--cyan)}
.slpats{display:flex;flex-wrap:wrap;gap:.3rem;align-items:center;margin:.1rem 0 .5rem}.slpats .klbl{margin-right:.3rem}.slpat{display:flex;flex-direction:column;align-items:center;min-width:2.6rem;line-height:1.05;padding:.2rem .3rem!important}.slpat small{font-size:.45rem;letter-spacing:.1em;opacity:.75}.slpat.own small{color:var(--cyan);opacity:1}.slpat.cur{outline:1px solid var(--cyan);outline-offset:1px}
.dmlfo{min-width:11.5rem}.dmlfoopts{display:flex;gap:.25rem;align-items:center;flex-wrap:wrap;margin-top:.3rem}.dmlfoopts select{font-size:.66rem;max-width:6.4rem}
.dmlfoled{position:absolute;right:.55rem;top:.35rem;width:.45rem;height:.45rem;border-radius:50%;background:var(--cyan);box-shadow:0 0 6px var(--cyan);opacity:.15}`;
  document.head.appendChild(st);
})();
(function () { const st = document.createElement('style'); st.textContent = '.dmlfo .modchip.dmlfochip{position:absolute;right:1.3rem;top:.12rem;min-width:0;padding:.08rem .4rem;font-size:.5rem;line-height:1.1}'; document.head.appendChild(st); })();
