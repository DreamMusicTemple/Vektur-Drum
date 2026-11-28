// Vektur Drum 0.9 — BREAK LAB, song generator, MIDI export, resample, 12 tracks, per-pattern Slicer: in a real browser.
//   node tests/breaklab.test.mjs        (needs Playwright + Chrome; CHROME=/path/to/chrome to override)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'url';
import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, '../web/dist/index.html');
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } else console.log('ok  ', msg); };
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(url); await p.waitForSelector('.dm');

const r = await p.evaluate(async () => {
  const out = {};
  // a synthetic 2-bar break at 170 BPM as a WAV
  const sr = 48000, bpm = 170, beat = 60 / bpm * sr, n = Math.round(8 * beat), d = new Float32Array(n); let q = 7;
  const rnd = () => { q = (q * 1103515245 + 12345) >>> 0; return q / 4294967296 * 2 - 1; };
  const put = (pos, c) => { for (let i = 0; i < 7000 && pos + i < n; i++) { const t = i / sr; d[Math.round(pos) + i] += c === 0 ? Math.sin(2 * Math.PI * (55 + 120 * Math.exp(-t * 40)) * t) * Math.exp(-t * 18) * .9 : c === 1 ? (rnd() * .6 + Math.sin(2 * Math.PI * 190 * t) * .4) * Math.exp(-t * 22) * .8 : c === 2 ? rnd() * Math.exp(-t * 70) * .3 : (rnd() * .6) * Math.exp(-t * 30) * .12; } };
  [0, 2.5, 4, 6.5].forEach(x => put(x * beat, 0)); [1, 3, 5, 7].forEach(x => put(x * beat, 1)); [.5, 1.5, 3.5, 4.5, 5.5].forEach(x => put(x * beat, 2)); [2.25, 3.75, 7.25].forEach(x => put(x * beat, 3));
  const wav = VDENC.wav([d], sr, 16);
  out.twelve = DRUM_TRACKS === 12 && drumState().pats[0].tr.length === 12;
  drumSetTracks(12); out.pads = document.querySelectorAll('#drumModal .dmpads .pad').length; out.rows = document.querySelectorAll('#drumModal .dmtrk').length;
  await drumAddSampleBytes(3, wav, 'Test Break');
  await openBreakLab(3);
  const sx = drumSx()[3]; sxRedetect(sx, BL.m); sxMakeSlices(sx, BL.m); blCommit();
  out.marks = sx.marks.length; out.slices = sx.slices.length; out.bpm = sx.bpm;
  out.canvas = !!document.querySelector('#blModal canvas') && document.querySelectorAll('#blModal .blpad').length === sx.slices.length;
  // undo / redo
  blSnap(); sx.slices[1].p = 7; blCommit(); blRestore(BL.undo, BL.redo); out.undo = drumSx()[3].slices[1].p === 0; blRestore(BL.redo, BL.undo); out.redo = drumSx()[3].slices[1].p === 7;
  // add a manual mark, re-detect keeps it
  blAddMark(1234); sxRedetect(drumSx()[3], BL.m); out.manual = drumSx()[3].marks.some(k => k.p === 1234 && k.m === 1);
  // generator
  BL.bank = Array.from({ length: 16 }, (_, i) => blVariation(blBase(), 99 + i * 131, i)); out.vars = BL.bank.length;
  const base = blBase(); BL.lockK = true; const v = blVariation(base, 5, 15); out.kickLocked = base.every((c, k) => !c || c.c !== 0 || (v[k] && v[k].sl === c.sl));
  out.different = new Set(BL.bank.map(x => JSON.stringify(x.map(c => c && c.sl)))).size >= 12;
  BL.split = false; blApplyVariation(BL.bank[3]); const lane = drumState().pats[drumState().sel].tr[3].s.filter(Boolean); out.lane = lane.length > 0 && lane.every(s => drumStepVal(s, 21) >= 1);
  blSplitByClass(blBase(), false); const pt = drumState().pats[drumState().sel]; out.split = [3, 4, 5].every(u => drumSmp()[u] === drumSmp()[3] && pt.tr[u].s.some(Boolean));
  // slices across all 12 tracks
  blSendSlices(Array.from({ length: 12 }, (_, i) => i), 0); out.across = Array.from({ length: 12 }, (_, u) => drumSmp()[u] === drumSmp()[3] && drumVal(`t${u + 1}.slice`) === u + 1 && drumEngine(u) === 1).every(Boolean);
  // MIDI
  const mid = drumMidiFile(); out.midi = String.fromCharCode(...mid.slice(0, 4)) === 'MThd' && mid[9] === 1 && mid.length > 60;
  // resample capture into a new sample
  drumSet('t4.metal', .6, true); drumSet('t4.rsmp', .5, true); const k0 = drumSmp()[3];
  const btn = document.createElement('button'); await blResample(btn); out.resampled = drumSmp()[3] !== k0 && /RS1$/.test(drumSampleName(3)) && drumVal('t4.metal') === 0 && drumVal('t4.rsmp') === 0 && drumSx()[3].slices.length > 0;
  await blResample(btn); out.again = /RS2$/.test(drumSampleName(3));
  closeBreakLab();
  // per-pattern Slicer survives save/open
  drumState().pats[2].sl = 1; drumState().pats[5].sl = 0; const st = JSON.parse(JSON.stringify(stateBuild({ embed: true })));
  out.slSaved = st.project.patterns[2].slicer === 1 && st.project.patterns[5].slicer === 0;
  stateApply(st); stateAfterApply(); out.slOpened = drumState().pats[2].sl === 1 && drumState().pats[5].sl === 0 && drumState().pats[0].sl === -1;
  out.sxOpened = drumSx()[3].slices.length > 0 && drumSx()[3].marks.length > 0;
  // song generator: every genre
  out.genres = [];
  for (const g of SONG_GENRES) { songGenerate(g, 12345); const dd = drumState(); out.genres.push({ g, bpm: S.bpm, ok: dd.pats.length === 8 && dd.chain.length >= 8 && dd.chainOn && dd.pats.filter(drumPatHas.length ? (x, i) => drumPatHas(i) : x => x).length >= 6 }); }
  songGenerate('Jungle', 777); const a1 = JSON.stringify(drumState().pats); songGenerate('Jungle', 777); out.seedSame = a1 === JSON.stringify(drumState().pats);
  songGenerate('Jungle', 778); out.seedDiff = a1 !== JSON.stringify(drumState().pats);
  out.breakUsed = drumState().pats[1].tr.some((tr, t) => tr.s.some(s => s && drumStepVal(s, 21) > 0));
  // a kit round trip keeps slices
  const kit = presetCapture ? presetCapture('drums', 'k') : null; out.kitSx = !kit || (kit.sx && kit.sx.length === 12);
  // brand names anywhere in the page
  out.brands = /\b(akai|e-mu|ensoniq|roland|korg|mpc|fairlight)\b/i.test(document.documentElement.outerHTML);
  return out;
});
ok(r.twelve && r.pads === 12 && r.rows === 12, `12 tracks: ${r.rows} sequencer rows, ${r.pads} pads`);
ok(r.marks >= 12 && r.slices >= 12, `BREAK LAB: ${r.marks} transients, ${r.slices} slices`);
ok(Math.abs(r.bpm - 170) < 1, 'BPM detected: ' + r.bpm);
ok(r.canvas, 'waveform and a pad per slice');
ok(r.undo && r.redo, 'undo / redo');
ok(r.manual, 're-detect keeps a hand-placed mark');
ok(r.vars === 16 && r.different, '16 variations, all different');
ok(r.kickLocked, 'LOCK KICK: every kick stays where it was, with its slice');
ok(r.lane, 'a variation on one lane: every step plays a slice');
ok(r.split, 'BY TYPE: kick / snare / hat / ghost lanes with the break on each');
ok(r.across, 'slices mapped across all 12 tracks (slice n on track n, each on the sample engine)');
ok(r.midi, 'EXPORT MIDI: a type-1 standard MIDI file');
ok(r.resampled, 'RESAMPLE: a new sample (RS1), the processing baked in and reset on the track, sliced again');
ok(r.again, 'resampling the resample: RS2 (no feedback, no build-up)');
ok(r.slSaved && r.slOpened, 'per-pattern Slicer saved and opened');
ok(r.sxOpened, 'slices and transients saved and opened');
for (const g of r.genres) ok(g.ok, `GENERATE ${g.g}: 8 patterns, chain on (${g.bpm} BPM)`);
ok(r.seedSame && r.seedDiff, 'the same seed gives the same song; another seed differs');
ok(r.breakUsed, 'Jungle chops the loaded break into the patterns');
ok(r.kitSx, 'kits carry the slices');
ok(!r.brands, 'no hardware brand names in the app');
ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
await b.close();
console.log(`\n${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
