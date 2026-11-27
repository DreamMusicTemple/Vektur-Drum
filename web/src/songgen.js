/* ============================================================ VEKTUR DRUM 0.9 — SONG GENERATOR
   GENERATE builds a whole song in one go: a kit voiced for the genre, the tempo, eight patterns (intro, groove,
   variation, fill, breakdown, build, drop, outro) and a chain that plays them as an arrangement. Every press rolls a
   new seed, so the same genre never comes out the same twice (the seed is shown, and AGAIN with the same seed repeats
   it). A break loaded and sliced in the BREAK LAB is used on the breakbeat genres: tempo-locked, chopped from its own
   slices, varied from part to part.
   Genres: DnB · Jungle · Dub Techno · TripHop · Hip Hop · Trance · House. */
const SONG_GENRES = ['DnB', 'Jungle', 'Dub Techno', 'TripHop', 'Hip Hop', 'Trance', 'House'];
const SG = { seed: 0, genre: 0, useBreak: true };
// track roles (the default kit order): 0 kick · 1 snare · 2 closed hat · 3 open hat · 4 clap · 5 tom · 6 rim · 7 FM metal · 8 FM tom · 9 high tom · 10 ride · 11 shaker
const SG_DEF = {
  'DnB': { bpm: [172, 176], swing: .04, p: { 't1.tune': -2, 't1.decay': .45, 't2.tune': 3, 't2.decay': .2, 't2.snap': .75, 't3.decay': .04, 't11.level': .22, 'dr.revsize': .45, 't2.rev': .12, 't8.dly': .3, 'dr.dlydiv': 5 },
    groove: { 0: 'x.........x.....', 1: '....x.......x...', 2: 'x.x.x.x.x.x.x.x.', 10: 'xxxxxxxxxxxxxxxx', 6: '.......x.....x..' }, ghost: 1, fill: [1, 9, 5] },
  'Jungle': { bpm: [160, 168], swing: .06, p: { 't1.tune': -3, 't1.decay': .6, 't2.decay': .24, 't2.snap': .7, 't2.metal': .35, 't3.decay': .05, 't4.decay': .35, 'dr.temper': -.25, 'tp.dust': .1, 't2.rev': .15, 'dr.revsize': .5, 't8.dly': .35, 'dr.dlydiv': 4 },
    groove: { 0: 'x.x.......x..x..', 1: '....x..x.x..x..x', 2: 'x.x.x.x.x.x.x.x.', 3: '..............x.', 10: 'x...x...x...x...' }, ghost: 1, fill: [1, 5, 9], metal: true },
  'Dub Techno': { bpm: [118, 124], swing: .08, p: { 't1.tune': -4, 't1.decay': .7, 't1.tone': .3, 't4.decay': .5, 't4.dly': .35, 't7.dly': .7, 't7.rev': .5, 't8.dly': .6, 't8.rev': .4, 'dr.dlyfb': .72, 'dr.dlydiv': 3, 'dr.dlytone': .3, 'dr.revtype': 1, 'dr.revsize': .85, 'tp.wow': .25, 'tp.dust': .15, 'dr.temper': -.35 },
    groove: { 0: 'x...x...x...x...', 3: '..x...x...x...x.', 2: 'x.x.x.x.x.x.x.x.', 6: '...x.......x..x.', 7: '......x.......x.', 11: 'x.xxx.xxx.xxx.xx' }, ghost: 0, fill: [6, 7] },
  'TripHop': { bpm: [80, 92], swing: .32, p: { 't1.tune': -3, 't1.decay': .55, 't2.tune': -2, 't2.decay': .32, 't2.bits': 11, 't2.rev': .3, 't3.bits': 12, 'tp.dust': .35, 'tp.wow': .35, 'tp.flutter': .2, 'dr.temper': -.5, 'dr.revsize': .7 },
    groove: { 0: 'x......x..x.....', 1: '....x.......x...', 2: 'x.x.x.x.x.x.x.x.', 6: '..........x....x', 5: '.............x..' }, ghost: 1, fill: [1, 5] },
  'Hip Hop': { bpm: [86, 96], swing: .26, p: { 't1.tune': -1, 't1.decay': .5, 't2.decay': .26, 't2.snap': .65, 't3.decay': .05, 't7.level': .45, 'dr.temper': -.3, 'tp.dust': .2, 't2.rsmp': .3, 't1.rsmp': .2 },
    groove: { 0: 'x..x....x.x.....', 1: '....x.......x...', 2: 'x.x.x.x.x.x.x.x.', 6: '.......x........', 3: '..............x.' }, ghost: 1, fill: [1, 0] },
  'Trance': { bpm: [136, 140], swing: 0, p: { 't1.tune': -1, 't1.decay': .5, 't1.snap': .6, 't4.decay': .25, 't5.rev': .3, 't5.decay': .3, 'dr.revsize': .7, 't11.level': .3, 't8.dly': .4, 'dr.dlydiv': 4 },
    groove: { 0: 'x...x...x...x...', 3: '..x...x...x...x.', 4: '....x.......x...', 2: 'xxxxxxxxxxxxxxxx', 10: '..x...x...x...x.' }, ghost: 0, fill: [1, 4], roll: true },
  'House': { bpm: [122, 126], swing: .14, p: { 't1.tune': -2, 't1.decay': .42, 't4.decay': .3, 't5.decay': .28, 't5.rev': .2, 't12.level': .4, 't7.level': .45 },
    groove: { 0: 'x...x...x...x...', 4: '....x.......x...', 3: '..x...x...x...x.', 11: 'xxxxxxxxxxxxxxxx', 6: '...x..x.......x.', 2: 'x.x.x.x.x.x.x.x.' }, ghost: 0, fill: [4, 6] },
};
function sgModal() { let m = $('#sgModal'); if (!m) { m = el('div', 'modal'); m.id = 'sgModal'; m.appendChild(el('div', 'sheet sgsheet')); m.onclick = e => { if (e.target === m) closeSongGen(); }; document.body.appendChild(m); } return m; }
function openSongGen() { const m = sgModal(); document.body.appendChild(m); m.classList.add('open'); renderSongGen(); }
function closeSongGen() { const m = $('#sgModal'); if (m) m.classList.remove('open'); }
function sgBreakTrack() { const sx = drumSx(); for (let t = 0; t < DRUM_TRACKS; t++) if (drumSmp()[t] && sx[t].slices.length >= 4) return t; return -1; }
function renderSongGen() {
  const sh = sgModal().querySelector('.sheet'); sh.innerHTML = '';
  const h = el('h2'); h.appendChild(el('span', null, 'GENERATE A SONG')); h.appendChild(el('span', 'spacer')); const x = el('button', 'cbtn', 'Close'); x.onclick = closeSongGen; h.appendChild(x); sh.appendChild(h);
  sh.appendChild(el('div', 'clhelp', 'Pick a genre: a kit, tempo, eight patterns and an arranged chain replace the current song (your samples stay in the set). Each press is a new seed.'));
  const g = el('div', 'sggenres');
  SONG_GENRES.forEach((n, i) => { const b = el('button', 'sggenre' + (i === SG.genre ? ' sel' : '')); b.append(el('b', null, n), el('span', null, SG_DEF[n].bpm.join('–') + ' BPM'));
    b.onclick = () => { SG.genre = i; SG.seed = (Math.random() * 1e9) >>> 0; songGenerate(n, SG.seed); renderSongGen(); }; g.appendChild(b); });
  sh.appendChild(g);
  const bt = sgBreakTrack(), r = el('div', 'dmchain');
  if (bt >= 0) r.appendChild(hbtn(SG.useBreak ? `USE BREAK (TRACK ${bt + 1}) ✓` : `USE BREAK (TRACK ${bt + 1})`, 'sm cy' + (SG.useBreak ? ' on' : ''), () => { SG.useBreak = !SG.useBreak; renderSongGen(); }, true));
  else r.appendChild(el('span', 'dmnote', 'Tip: load and slice a break in the BREAK LAB and DnB, Jungle, TripHop and Hip Hop will chop it in.'));
  if (SG.seed) { r.appendChild(el('i', 'dmsep')); r.appendChild(el('span', 'dmnote', `Last: ${SONG_GENRES[SG.genre]} · seed ${SG.seed}`)); r.appendChild(hbtn('AGAIN (SAME SEED)', 'sm', () => songGenerate(SONG_GENRES[SG.genre], SG.seed)));
    r.appendChild(hbtn('NEW SEED', 'sm', () => { SG.seed = (Math.random() * 1e9) >>> 0; songGenerate(SONG_GENRES[SG.genre], SG.seed); renderSongGen(); })); }
  sh.appendChild(r);
}
/** The song as data (pure: tests call it): { bpm, swing, p, pats, chain }. */
function songBuild(genre, seed, brk) {
  const G = SG_DEF[genre], r = blRng((seed >>> 0) * 2654435761 + 17), ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const bpm = Math.round((G.bpm[0] + r() * (G.bpm[1] - G.bpm[0])) * 2) / 2;
  const step = (vel, rat) => [Math.round(clamp(vel, .1, 1) * 100) / 100, 0, 0, rat || 1];
  const lane = (str, accent) => Array.from(str, (c, k) => c === 'x' ? step(accent && k % 4 === 0 ? .95 : .82 - (k % 2) * .12 + (r() - .5) * .08) : null);
  const part = (name) => {
    const pt = drumEmptyPattern();
    const on = (t, a) => { pt.tr[t].s = a; };
    const gr = G.groove;
    const keep = { intro: [0, 2, 11, 10], groove: null, var: null, fill: null, break: [2, 3, 6, 7, 10, 11], build: [0, 1, 4, 2], drop: null, outro: [0, 2] }[name];
    for (const k in gr) { const t = +k; if (keep && !keep.includes(t)) continue; let a = lane(gr[k], t === 0);
      if (name === 'var' || name === 'drop') a = a.map((s, i) => s || (t === 2 && r() < .25 ? step(.45) : null)).map(s => s && t !== 0 && r() < .08 ? null : s);
      if (name === 'break' && t === 0) a = a.map(() => null);
      on(t, a); }
    if (G.ghost && (name === 'groove' || name === 'var' || name === 'drop')) for (let k = 0; k < 16; k++) if (!pt.tr[1].s[k] && k % 2 && r() < .22) pt.tr[1].s[k] = step(.3 + r() * .12);
    if (name === 'fill' || (name === 'build' && G.roll)) { const tr = G.fill[0]; for (let k = 8; k < 16; k++) if (r() < (name === 'build' ? .9 : .55)) pt.tr[tr].s[k] = step(.5 + k / 32, name === 'build' && k > 11 ? 2 : (r() < .25 ? 2 : 1));
      (G.fill.slice(1)).forEach(t => { const k = ri(10, 15); pt.tr[t].s[k] = step(.8); }); }
    if (name === 'build') { pt.tr[1].s = pt.tr[1].s.map((s, k) => s || step(.35 + k / 24)); }
    if (name === 'drop' && G.metal) pt.tr[1].s = pt.tr[1].s.map(s => { if (!s) return s; const v = drumStepFull(s.slice(), DRUM_STEP_N); v[20] = .6; return drumTrimStep(v); });
    if (name === 'drop') pt.tr[0].s[0] && (pt.tr[0].s[0][0] = 1);
    // the break, chopped from its own slices
    if (brk && ['groove', 'var', 'drop', 'fill'].includes(name)) { const n = brk.n, ext = { groove: .1, var: .35, fill: .6, drop: .5 }[name];
      for (let k = 0; k < 16; k++) { let sl = (k % n) + 1; if (r() < ext) sl = ri(1, n); if (name === 'groove' && r() < .1) continue;
        const v = drumStepFull([.85, 0, 0, 1], DRUM_STEP_N); v[21] = sl; if (name !== 'groove') { v[22] = ext * .25; v[23] = ext * .3; } pt.tr[brk.t].s[k] = drumTrimStep(v); }
      if (name !== 'drop') for (const t of [0, 1, 2]) pt.tr[t].s = pt.tr[t].s.map((s, k) => s && (t !== 0 || k % 8 === 0) ? s : null);   // the break carries the groove
    }
    if (name === 'build' || name === 'fill') pt.sl = genre === 'Jungle' || genre === 'DnB' ? 1 : -1;
    return pt;
  };
  const names = ['intro', 'groove', 'var', 'fill', 'break', 'build', 'drop', 'outro'];
  const pats = names.map(part);
  const forms = [[0, 1, 1, 2, 3, 4, 5, 6, 6, 2, 3, 7], [0, 1, 2, 1, 3, 4, 4, 5, 6, 6, 1, 7], [0, 0, 1, 2, 1, 3, 4, 5, 6, 2, 6, 7]];
  const chain = forms[ri(0, forms.length - 1)].slice(0, 16);
  return { bpm, swing: G.swing, p: Object.assign({ 'dr.swing': G.swing }, G.p), pats, chain };
}
function songGenerate(genre, seed) {
  const d = drumState(), bt = SG.useBreak ? sgBreakTrack() : -1, breakG = ['DnB', 'Jungle', 'TripHop', 'Hip Hop'].includes(genre);
  const brk = bt >= 0 && breakG ? { t: bt, n: Math.min(16, drumSx()[bt].slices.length) } : null;
  const song = songBuild(genre, seed, brk), ch = d.p['dr.ch'];
  d.p = Object.assign({}, song.p); if (ch != null) d.p['dr.ch'] = ch;
  for (let t = 0; t < DRUM_TRACKS; t++) if (drumSmp()[t] && (!brk || t !== brk.t)) d.p[`t${t + 1}.engine`] = 0;   // the kit plays the synth; samples stay in the set
  if (brk) { d.p[`t${brk.t + 1}.engine`] = 1; d.p[`t${brk.t + 1}.tsmode`] = 2; d.p[`t${brk.t + 1}.decay`] = 3; d.p[`t${brk.t + 1}.level`] = .85;
    if (genre === 'Jungle') { d.p[`t${brk.t + 1}.rsmp`] = .45; d.p[`t${brk.t + 1}.smodel`] = 0; d.p[`t${brk.t + 1}.rsmode`] = 0; }
    if (genre === 'Hip Hop' || genre === 'TripHop') { d.p[`t${brk.t + 1}.rsmp`] = .35; d.p[`t${brk.t + 1}.smodel`] = 3; } }
  d.pats = song.pats; d.chain = song.chain; d.chainOn = true; d.sel = 1; d.ntr = DRUM_TRACKS; d.preset = `${genre} · ${seed}`;
  d.slice = drumSliceClean(Array.from({ length: SL_SLOTS }, (_, i) => [i % 8 === 6 ? 2 : i % 8 === 7 ? 3 : 0, i])); d.wires = [];
  if (genre === 'Jungle' || genre === 'DnB') d.p['sl.on'] = 0;
  setBpm(song.bpm);
  if (!d.on) drumsSetOn(true); else drumPushAll();
  drumSamplesPush(true); dirty(); if (drumsOpen()) renderDrums();
  toast(`${genre} at ${song.bpm} BPM — ${song.chain.length} parts in the chain`);
}
(function sgCSS() {
  const st = document.createElement('style');
  st.textContent = `.sgsheet{max-width:min(720px,94vw)}.sggenres{display:grid;grid-template-columns:repeat(auto-fill,minmax(9rem,1fr));gap:.45rem;margin:.6rem 0}
.sggenre{all:unset;cursor:pointer;border:1px solid #33363c;border-radius:.5rem;padding:.7rem .8rem;background:#17181c;display:flex;flex-direction:column;gap:.2rem}
.sggenre:hover,.sggenre:focus-visible{border-color:#5a5e66}.sggenre.sel{border-color:#ffd23d;background:#24251c}.sggenre b{font:700 1rem system-ui;color:#e8e9ec}.sggenre span{font:600 .6rem system-ui;letter-spacing:.1em;color:#9a9ea6}`;
  document.head.appendChild(st);
})();
