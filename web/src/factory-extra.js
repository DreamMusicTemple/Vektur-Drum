/* ============================================================ Vektur Drum — new factory kits (9 tracks, FM, glitch)
   Patterns are written as 16-character strings, one per track:
     x = hit (0.8)   X = accent (1.0)   o = ghost (0.5)   2 3 4 = ratchet (0.7)   - = off
   `ratios` gives FM tracks a per-step modulator ratio (same 16 positions; null = the track's ratio). */
function kitPattern(rows, ratios = {}, bars = 1) {
  const pt = drumEmptyPattern(); pt.bars = bars;
  rows.forEach((r, t) => { for (let k = 0; k < 16; k++) {
    const c = r[k] || '-'; if (c === '-') continue;
    const step = c === 'X' ? [1, 0, 0, 1] : c === 'o' ? [.5, 0, 0, 1] : /[234]/.test(c) ? [.7, 0, 0, +c] : [.8, 0, 0, 1];
    const fr = ratios[t] && ratios[t][k]; if (fr) step.push(0, 0, 0, 1, fr);
    pt.tr[t].s[k] = step; } });
  return pt;
}
DRUM_FACTORY.push({
  name: 'Jungle Metal Grain', cat: 'Jungle', ntr: 9,
  p: { 't1.model': 0, 't1.tune': 1, 't1.decay': 0.35, 't1.tone': 0.55, 't1.snap': 0.55, 't1.level': 0.95,
    't2.model': 1, 't2.tune': 3, 't2.decay': 0.2, 't2.tone': 0.65, 't2.snap': 0.75, 't2.level': 0.85, 't2.rev': 0.15,
    't3.model': 2, 't3.decay': 0.04, 't3.tone': 0.75, 't3.level': 0.42, 't3.pan': 0.2,
    't4.model': 3, 't4.decay': 0.22, 't4.level': 0.38, 't4.pan': 0.2,
    't5.model': 1, 't5.tune': 7, 't5.decay': 0.09, 't5.snap': 0.9, 't5.level': 0.4, 't5.pan': -0.15,
    't6.engine': 2, 't6.fmalgo': 0, 't6.fmfreq': 48, 't6.fmratio': 0.5, 't6.fmindex': 1.2, 't6.fmidec': 0.15, 't6.decay': 1.4, 't6.level': 0.7, 't6.sweep': 7, 't6.swtime': 0.04,
    't7.model': 6, 't7.decay': 0.06, 't7.level': 0.45, 't7.pan': -0.3,
    't8.engine': 2, 't8.fmalgo': 3, 't8.fmfreq': 610, 't8.fmratio': 1.41, 't8.fmratio2': 3.17, 't8.fmindex': 3.5, 't8.fmidec': 0.06, 't8.fmfold': 0.35, 't8.decay': 0.18, 't8.level': 0.32, 't8.pan': 0.35, 't8.dly': 0.25,
    't9.engine': 2, 't9.fmalgo': 1, 't9.fmfreq': 180, 't9.fmratio': 2.01, 't9.fmratio2': 0.5, 't9.fmindex': 5, 't9.fmidec': 0.03, 't9.decay': 0.25, 't9.level': 0.42, 't9.sweep': -12, 't9.swtime': 0.12, 't9.rev': 0.2,
    'dr.swing': 0.08, 'dr.temper': -0.4, 'dr.dlydiv': 3, 'dr.dlyfb': 0.45,
    'gl.on': 1, 'gl.mode': 2, 'gl.mix': 0.35, 'gl.size': 0.3, 'gl.speed': 0.45,
    'lfo1.shape': 1, 'lfo1.depth': 0.3, 'lfo1.dest': 1, 'lfo1.sync': 1, 'lfo1.div': 2,
    'lfo2.shape': 4, 'lfo2.depth': 0.35, 'lfo2.dest': 2, 'lfo2.sync': 1, 'lfo2.div': 4,
    'lfo3.shape': 3, 'lfo3.depth': 0.35, 'lfo3.dest': 0, 'lfo3.sync': 1, 'lfo3.div': 1 },
  pats: [
    kitPattern(['X-x-------x-----', '----X-------X---', 'x-x-x-x-x-x-x-x-', '-----------x----', '-o----o--o----o-', 'X---------X-----', '---------o------', '--x-----x-------', '-------x-------x']),
    kitPattern(['X-x-------x-x---', '----X--o----X-3-', 'x-x-x-x-x-x-x3x-', '-------x--------', '-o--o-o--o--o-oo', 'X---------X--x--', '---o-----o------', 'x-x---x-x---x-x-', '-------x---x--x-'],
      { 7: { 0: 1.41, 2: 2.76, 6: 3.5, 8: 1.41, 12: 5.4, 14: 2.1 } }),
  ],
  chain: [0, 0, 0, 1], chainOn: true,
});
DRUM_FACTORY.push({
  name: 'FM Percussion Lab', cat: 'FM', ntr: 9,
  p: { 't1.engine': 2, 't1.fmalgo': 0, 't1.fmfreq': 46, 't1.fmratio': 1, 't1.fmindex': 2, 't1.fmidec': 0.04, 't1.decay': 0.5, 't1.sweep': 24, 't1.swtime': 0.035, 't1.level': 0.95, 't1.snap': 0.4,
    't2.engine': 2, 't2.fmalgo': 2, 't2.fmfreq': 190, 't2.fmratio': 1.6, 't2.fmratio2': 3.9, 't2.fmindex': 6, 't2.fmidec': 0.05, 't2.fmnoise': 0.55, 't2.decay': 0.2, 't2.level': 0.75,
    't3.engine': 2, 't3.fmalgo': 3, 't3.fmfreq': 2400, 't3.fmratio': 1.43, 't3.fmratio2': 2.37, 't3.fmindex': 4, 't3.fmidec': 0.02, 't3.fmnoise': 0.3, 't3.decay': 0.045, 't3.level': 0.35, 't3.pan': 0.2,
    't4.engine': 2, 't4.fmalgo': 3, 't4.fmfreq': 2400, 't4.fmratio': 1.43, 't4.fmratio2': 2.37, 't4.fmindex': 4, 't4.fmidec': 0.2, 't4.fmnoise': 0.3, 't4.decay': 0.35, 't4.level': 0.3, 't4.pan': 0.2,
    't5.model': 4, 't5.level': 0.55, 't5.rev': 0.25,
    't6.engine': 2, 't6.fmalgo': 0, 't6.fmfreq': 120, 't6.fmratio': 1.5, 't6.fmindex': 3, 't6.fmidec': 0.06, 't6.sweep': 10, 't6.swtime': 0.08, 't6.decay': 0.35, 't6.level': 0.6, 't6.pan': -0.25,
    't7.engine': 2, 't7.fmalgo': 1, 't7.fmfreq': 820, 't7.fmratio': 3.5, 't7.fmratio2': 1.0, 't7.fmindex': 2, 't7.fmidec': 0.01, 't7.decay': 0.05, 't7.level': 0.5, 't7.pan': -0.35,
    't8.engine': 2, 't8.fmalgo': 0, 't8.fmfreq': 440, 't8.fmratio': 3.5, 't8.fmindex': 2.2, 't8.fmidec': 0.4, 't8.fmfold': 0.25, 't8.decay': 0.6, 't8.level': 0.38, 't8.pan': 0.35, 't8.dly': 0.3, 't8.rev': 0.25,
    't9.engine': 2, 't9.fmalgo': 0, 't9.fmfreq': 65, 't9.fmratio': 2, 't9.fmindex': 1.5, 't9.fmidec': 0.3, 't9.fmfold': 0.6, 't9.decay': 0.6, 't9.level': 0.5,
    'dr.swing': 0.12, 'dr.temper': -0.3, 'dr.dlydiv': 4, 'dr.dlyfb': 0.4, 'dr.revsize': 0.7,
    'gl.on': 0, 'gl.mode': 0, 'gl.mix': 0.6, 'gl.size': 0.4,
    'lfo1.shape': 4, 'lfo1.depth': 0.4, 'lfo1.dest': 1, 'lfo1.sync': 1, 'lfo1.div': 4, 'lfo2.depth': 0.25, 'lfo2.dest': 2, 'lfo2.rate': 0.4 },
  pats: [
    kitPattern(['X-----x---x-----', '----X-------X---', 'x-xox-xox-xox-xo', '------x-------x-', '-------------x--', '---x------x---x-', 'o--o--o--o--o-o-', 'x--x--x---x--x--', 'x-------x-x-----'],
      { 7: { 0: 3.5, 3: 2.0, 6: 5.04, 10: 1.5, 13: 7.0 } }),
    kitPattern(['X-----x---x--x--', '----X-------X--o', 'x-xox-xox-xox3xo', '------x-----x---', '----x--------x--', '---x--x---x--3--', 'o-oo--o--o-oo-o-', 'x--x--x---x--x-x', 'x-------x-x---x-'],
      { 7: { 0: 3.5, 3: 2.0, 6: 5.04, 10: 1.5, 13: 7.0, 15: 0.5 }, 5: { 3: 1.0, 6: 2.5, 10: 0.75, 13: 3.0 } }),
  ],
  chain: [0, 0, 0, 1], chainOn: true,
});
