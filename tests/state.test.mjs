// Vektur Drum — state (vektur-drum-state v1) tests in a real browser engine.
//   node tests/state.test.mjs        (needs Playwright + Chrome; CHROME=/path/to/chrome to override)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'url';
import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, '../web/dist/index.html');
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const fresh = async () => { const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.waitForSelector('.dm'); return { p, ctx, errs }; };
const canon = o => { const c = JSON.parse(JSON.stringify(o)); delete c.writer; delete c.library; return JSON.stringify(c); };

// 1 · a rich song round-trips exactly onto a fresh device (embedded sample, CC map, track count, tempo, step FM ratios)
const A = await fresh();
const saved = await A.p.evaluate(async () => {
  await presetApply('drums', DRUM_FACTORY.find(k => k.name === 'Jungle Metal Grain'));
  const d = drumState(); d.pats[3].tr[8].s[5] = [0.66, -0.4, 7, 3, 0.25, 0.5, 0.75, 0.6, 5.04]; d.pats[3].bars = 4; d.pats[3].tr[2].len = 7; d.pats[3].tr[2].div = 6;
  d.chain = [0, 3, 3, 1]; d.chainOn = true; d.sel = 3; d.ntr = 8; S.bpm = 172.5; drumSet('t5.fmfold', 0.42); drumSet('lfo2.div', 5); drumSet('dr.ch', 3);
  // a real WAV (0.1 s sine) as the track 2 sample
  const n = 4800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 48000, true); v.setUint32(28, 96000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 8) * 12000), true);
  const bytes = new Uint8Array(buf), key = dsmpKey(bytes);
  drumLib().push({ key, name: 'Test Sine', fmt: 'wav', data: ufontB64(bytes) }); drumSmp()[1] = key; drumSet('t2.engine', 1);
  ccAssign('drums:t9.fmindex', 71, 2);
  // NEW v2: slicer program, wires, a ring step
  drumSliceProg()[3] = [9, 12]; drumSliceProg()[7] = [4, 7]; drumSet('sl.on', 1); drumSet('sl.seed', 42);
  drumWires().push({ s: 4, k: 'sl.density', a: -0.35 }, { s: 3, k: 't2.decay', a: 0.8 });
  d.pats[3].tr[1].s[2] = [0.7, 0, 0, 1, 0, 0, 0, 1, 0, 1, 9, 5, 0.6, 880];
  d.pats[3].tr[2].s[1] = [0.9, 0, 0, 1, 0, 0, 0, 1, 0, 0, 12, 0, 1, 220, 0.55]; drumSet('t4.eq2g', 6.5); drumSet('t4.eq2f', 1200); drumSet('tp.wow', 0.3); drumSet('tp.dust', 0.2);   // v3
  return JSON.stringify(stateBuild({ embed: true }));
});
const B = await fresh();
const back = await B.p.evaluate(async s => { const r = stateApply(JSON.parse(s)); stateAfterApply(); return { warnings: r.warnings, state: JSON.stringify(stateBuild({ embed: true })) }; }, saved);
ok(canon(JSON.parse(saved)) === canon(JSON.parse(back.state)), 'song survives save → open on a fresh device, exactly');
ok(back.warnings.length === 0, 'no warnings with samples included: ' + back.warnings.join(' | '));
const S1 = JSON.parse(saved);
ok(S1.project.patterns[3].tracks[8].steps[5].join() === [0.66, -0.4, 7, 3, 0.25, 0.5, 0.75, 0.6, 5.04].join(), 'all 9 step values kept (crush, sends, chance, FM ratio)');
ok(S1.version === 6 && S1.project.params['t4.eq2g'] === 6.5 && S1.project.params['tp.wow'] === 0.3 && S1.project.patterns[3].tracks[2].steps[1].length === 15 && S1.project.patterns[3].tracks[2].steps[1][14] === 0.55 && JSON.stringify(S1.project.slicer[3]) === '[9,12]' && S1.project.wires.length === 2 && S1.project.wires[0].source === 'chaos', 'v2: slicer program and wires written');
ok(S1.project.patterns[3].tracks[1].steps[2].join() === '0.7,0,0,1,0,0,0,1,0,1,9,5,0.6,880', 'v2: ring step (14 values) kept');
const v1 = await B.p.evaluate(s => { const o = JSON.parse(s); o.version = 1; delete o.project.slicer; delete o.project.wires; o.project.patterns[3].tracks[1].steps[2] = o.project.patterns[3].tracks[1].steps[2].slice(0, 9);
  const r = stateApply(o); stateAfterApply(); const res = { w: r.warnings.length, sl: drumSliceProg().every((x, i) => x[0] === 0 && x[1] === i), wires: drumWires().length };
  stateApply(JSON.parse(s)); stateAfterApply(); return res; }, saved);   // then back to the v2 song
ok(v1.w === 0 && v1.sl && v1.wires === 0, 'a v1 file opens: clear slicer program, no wires, no warnings');
const NPAR = await A.p.evaluate(() => DRUM_PARAMS.length);
ok(Object.keys(S1.project.params).length === NPAR, 'every parameter written (' + NPAR + ')');
ok(S1.midi.ccMap['t9.fmindex'].cc === 71 && S1.midi.ccMap['t9.fmindex'].ch === 2, 'MIDI CC map travels with the song');
console.log(`      song with one 0.1 s sample: ${(saved.length / 1024).toFixed(1)} KB; without samples: ${(JSON.stringify({ ...S1, sampleData: undefined }).length / 1024).toFixed(1)} KB`);

// 2 · the restored song really plays the sample (bytes reached the engine)
await B.p.mouse.click(5, 5); await B.p.waitForTimeout(400);
const plays = await B.p.evaluate(async () => { await drumsSetOn(true); await new Promise(r => setTimeout(r, 1500)); drumHit(1, 120); await new Promise(r => setTimeout(r, 200)); return { lib: drumLib().length, engine: !!SYN.node, hits: SYN.dtel && SYN.dtel[4 + DRUM_TRACKS + 1] }; });
ok(plays.engine && plays.hits >= 1, 'restored sample track triggers in the engine: ' + JSON.stringify(plays));

// 3 · autosave: reload brings the same song back (sample bytes from IndexedDB)
await B.p.waitForTimeout(1500); await B.p.reload(); await B.p.waitForSelector('.dm'); await B.p.waitForTimeout(1500);
const auto = await B.p.evaluate(() => JSON.stringify(stateBuild({ embed: true })));
ok(canon(JSON.parse(auto)) === canon(JSON.parse(saved)), 'autosave → reload: identical song, sample bytes restored');

// 4 · without the samples, on a fresh device: opens, and says which sample is missing
const C = await fresh();
const noSmp = await C.p.evaluate(s => { const o = JSON.parse(s); delete o.sampleData; const r = stateApply(o); stateAfterApply(); return r.warnings; }, saved);
ok(noSmp.length === 1 && /Track 2/.test(noSmp[0]) && /Test Sine/.test(noSmp[0]), 'missing sample named: ' + noSmp.join(' | '));

// 5 · older formats
const legacy = await C.p.evaluate(() => {
  const old = { app: 'vektur-drum', version: 1, bpm: 133, drums: { on: true, ntr: 7, p: { 't1.tune': 5, 'dr.choke': 0 }, pats: [{ bars: 2, tr: [{ len: 12, div: 3, s: [[0.9, 0, 2, 2]] }] }], chain: [1, 0], chainOn: true, sel: 1, preset: 'Old', smp: [], user: [] } };
  stateApply(old); const a = stateBuild();
  const vj = { name: 'A VJ set', drums: { on: true, p: { 't2.decay': 1.5 }, pats: [{ bars: 1, tr: [null, { len: 16, div: 5, s: [null, [0.7, 0, 0, 1]] }] }], chain: [], chainOn: false, sel: 0 } };
  const r = stateApply(vj); const c = stateBuild();
  return { tempo: a.project.tempo, tracks: a.project.trackCount, tune: a.project.params['t1.tune'], step: a.project.patterns[0].tracks[0].steps[0], bars: a.project.patterns[0].bars,
    choke3: a.project.params['t3.choke'], vjDecay: c.project.params['t2.decay'], vjStep: c.project.patterns[0].tracks[1].steps[1], vjTracks: c.project.trackCount, vjWarn: r.warnings };
});
ok(legacy.tempo === 133 && legacy.tracks === 7 && legacy.tune === 5 && legacy.bars === 2 && legacy.step.join() === '0.9,0,2,2,0,0,0,1,0', 'earlier autosave format opens: ' + JSON.stringify(legacy));
ok(legacy.choke3 === 0, 'Pulse "hat choke off" → no choke group');
ok(legacy.vjDecay === 1.5 && legacy.vjStep.join() === '0.7,0,0,1,0,0,0,1,0' && legacy.vjTracks === 6 && legacy.vjWarn.length === 1, 'Vektur VJ set: its drums open');
const refusals = await C.p.evaluate(() => [null, 42, 'x', {}, { format: 'vektur-pulse-presets', presets: [] }].map(o => { try { stateApply(o); return 'accepted'; } catch (e) { return e.message; } }));
ok(refusals.every(m => m !== 'accepted'), 'non-songs refused with a message: ' + refusals.join(' | '));

// 5b · 0.8 migration: Warmth → TEMPER (value, CC map, modulation wires), HUMANISE default, old files without either
const mig = await C.p.evaluate(s => {
  const o = JSON.parse(s); o.version = 4; o.writer = 'Vektur Drum 0.7';
  delete o.project.params['dr.temper']; delete o.project.params['dr.human']; o.project.params['dr.warmth'] = 0.45;
  o.project.wires = [{ source: 'lfo1', param: 'dr.warmth', amount: 0.4 }]; o.midi = { ccMap: { 'dr.warmth': { cc: 12, ch: 0 } } };
  const r = stateApply(o); stateAfterApply(); const a = stateBuild();
  const o2 = JSON.parse(s); o2.version = 3; delete o2.project.params['dr.temper']; delete o2.project.params['dr.human']; delete o2.project.params['dr.warmth'];
  stateApply(o2); stateAfterApply(); const b = stateBuild();
  const kit = presetClean('drums', { name: 'old kit', p: { 'dr.warmth': 0.8, 't1.level': 0.5 }, pats: [] });
  return { t: a.project.params['dr.temper'], h: a.project.params['dr.human'], w: a.project.params['dr.warmth'], wire: a.project.wires[0], cc: PREFS.ccMap['drums:dr.temper'], ccOld: PREFS.ccMap['drums:dr.warmth'], warn: r.warnings.length,
    t2: b.project.params['dr.temper'], h2: b.project.params['dr.human'], kitT: kit.p['dr.temper'], kitW: kit.p['dr.warmth'], v: a.version };
}, saved);
ok(mig.t === -0.45 && mig.w === undefined && mig.h === 0 && mig.v === 6, 'v4 file: Warmth 0.45 opens as TEMPER −0.45 (warm), HUMANISE 0, no Warmth left ' + JSON.stringify(mig));
ok(mig.wire && mig.wire.param === 'dr.temper' && mig.wire.amount === -0.2 && mig.cc && mig.cc.cc === 12 && !mig.ccOld && mig.warn === 0, 'its LFO wire and CC 12 follow Warmth to TEMPER (same direction, same depth)');
ok(mig.t2 === 0 && mig.h2 === 0, 'a file with neither: neutral TEMPER, HUMANISE off');
ok(mig.kitT === -0.8 && mig.kitW === undefined, 'an old kit file: Warmth 0.8 → TEMPER −0.8');

// 6 · fuzz: 300 corrupted files — never a crash, never an out-of-range value
const fuzz = await C.p.evaluate(s => {
  let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const junk = () => [NaN, Infinity, -1e9, 1e9, 'x', null, undefined, [], {}, true, -0.5, 99, '7'][Math.floor(rnd() * 13)];
  const mutate = (o, depth = 0) => { if (!o || typeof o !== 'object' || depth > 6) return junk();
    for (const k of Object.keys(o)) { const r = rnd(); if (r < 0.04) delete o[k]; else if (r < 0.12) o[k] = junk(); else if (typeof o[k] === 'object') o[k] = mutate(o[k], depth + 1); }
    if (Array.isArray(o) && rnd() < 0.05) o.length = Math.floor(rnd() * 300); return o; };
  let crashes = 0, bad = 0; const errs = [];
  for (let i = 0; i < 300; i++) {
    const o = mutate(JSON.parse(s)); o.format = 'vektur-drum-state';
    try { stateApply(o); } catch (e) { crashes++; errs.push(e.message); continue; }
    const st = stateBuild();
    for (const q of DRUM_PARAMS) { const v = st.project.params[q[0]]; if (!(v >= q[4] && v <= q[5])) { bad++; errs.push(q[0] + '=' + v); } }
    const p = st.project; if (!(p.trackCount >= 6 && p.trackCount <= 12 && p.tempo >= 40 && p.tempo <= 240 && p.patterns.length === 8 && p.patterns.every(pt => [1, 2, 4].includes(pt.bars) && pt.tracks.length === 12 && pt.tracks.every(t => t.len >= 1 && t.len <= 16 && t.steps.length === 16)))) { bad++; errs.push('shape'); }
  }
  return { crashes, bad, errs: errs.slice(0, 5) };
}, saved);
ok(fuzz.crashes === 0 && fuzz.bad === 0, '300 corrupted files: no crash, everything in range ' + JSON.stringify(fuzz));
ok([A, B, C].every(x => x.errs.length === 0), 'no page errors: ' + [A, B, C].flatMap(x => x.errs).join(' | '));
console.log(`${checks} checks, ${fails} failed`);
await b.close(); process.exit(fails ? 1 : 0);
