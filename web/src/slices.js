/* ============================================================ VEKTUR DRUM 0.9 — per-track slices
   Every track has its own sample editor data (S.drums.sx[t]): the transient markers found in its sample (and the
   ones you added, moved or rejected), the slices made from them, each slice's own settings, the sample's tempo and
   the detector's settings. The engine gets a PREPARED buffer per track — every slice cut out, stretched (attack
   kept intact) to follow the tune mode, and joined — plus a table of slices; a step can then play any slice.

   Everything here runs on the main thread (analysis and stretching are done when something changes, never in the
   audio callback); the engine only reads a finished buffer.

   Marks:  { p: position (samples of the decoded sample), m: 1 = placed by hand, on: 1 = accepted, c: class }
   Slices: { s, e (samples), p: pitch st, g: gain, pan, a: attack ms, gate 0…1, r: reverse, st: stretch ×,
             stut: repeats 0–8, sd: stutter length (beats), m: Metalise −1 (= track) or 0…1, c: class, mode: 0 one-shot / 1 gate }
   Classes: 0 kick · 1 snare · 2 hat · 3 ghost · 4 other — a suggestion only; you assign slices freely. */
const SX_CLASSES = ['Kick', 'Snare', 'Hat', 'Ghost', 'Other'];
const SX_MODES = ['Transient', 'Equal', 'Beat', 'Bar', 'Grid'];
const SX_GRIDS = [['1/4', 1], ['1/8', .5], ['1/16', .25], ['1/32', .125], ['1/8T', 1 / 3], ['1/16T', 1 / 6]];   // beats per division
const SX_MAX = 32, SLF_N = 11;

function drumSxDef() { return { bpm: 0, sens: .5, gap: 50, mode: 0, div: 8, grid: 2, marks: [], slices: [] }; }
function drumSliceDef(s, e, c) { return { s, e, p: 0, g: 1, pan: 0, a: 0, gate: 1, r: 0, st: 1, stut: 0, sd: .125, m: -1, c: c == null ? 4 : c, mode: 0 }; }
function drumSx() {
  const d = drumState(); if (!Array.isArray(d.sx)) d.sx = [];
  for (let i = 0; i < DRUM_TRACKS; i++) if (!d.sx[i] || typeof d.sx[i] !== 'object') d.sx[i] = drumSxDef();
  d.sx.length = DRUM_TRACKS; return d.sx;
}
const sxNum = (v, a, b, def) => { v = +v; return isFinite(v) ? Math.min(Math.max(v, a), b) : def; };
function sxSliceClean(o) {
  const s = Math.max(0, Math.round(+o.s) || 0), e = Math.max(s + 2, Math.round(+o.e) || s + 2);
  return { s, e, p: sxNum(o.p, -24, 24, 0), g: sxNum(o.g, 0, 2, 1), pan: sxNum(o.pan, -1, 1, 0), a: sxNum(o.a, 0, 200, 0), gate: sxNum(o.gate, .02, 1, 1),
    r: o.r ? 1 : 0, st: sxNum(o.st, .25, 4, 1), stut: Math.round(sxNum(o.stut, 0, 8, 0)), sd: sxNum(o.sd, 1 / 32, 1, .125), m: +o.m >= 0 ? sxNum(o.m, 0, 1, 0) : -1,
    c: Math.round(sxNum(o.c, 0, 4, 4)), mode: o.mode ? 1 : 0 };
}
/** Any object (a saved kit's, a state file's sample entry, junk) → a valid slice record. */
function drumSxClean(o) {
  const x = drumSxDef(); if (!o || typeof o !== 'object') return x;
  x.bpm = sxNum(o.bpm, 0, 400, 0); x.sens = sxNum(o.sens, 0, 1, .5); x.gap = sxNum(o.gap, 5, 1000, 50);
  x.mode = Math.round(sxNum(o.mode, 0, SX_MODES.length - 1, 0)); x.div = Math.round(sxNum(o.div, 1, SX_MAX, 8)); x.grid = Math.round(sxNum(o.grid, 0, SX_GRIDS.length - 1, 2));
  x.marks = (Array.isArray(o.marks) ? o.marks : []).slice(0, 256).map(m => Array.isArray(m) ? { p: m[0], m: m[1], on: m[2], c: m[3] } : m)
    .filter(m => m && isFinite(+m.p) && +m.p >= 0).map(m => ({ p: Math.round(+m.p), m: m.m ? 1 : 0, on: m.on === 0 ? 0 : 1, c: Math.round(sxNum(m.c, 0, 4, 4)) }))
    .sort((a, b) => a.p - b.p);
  x.slices = (Array.isArray(o.slices) ? o.slices : []).slice(0, SX_MAX).filter(v => v && typeof v === 'object').map(sxSliceClean);
  return x;
}
/** Compact form for the state file / kit (defaults left out; marks as [p, manual, accepted, class]). Empty → {}. */
function drumSxOut(sx) {
  if (!sx || (!sx.marks.length && !sx.slices.length && !sx.bpm)) return {};
  const def = drumSliceDef(0, 2), o = { bpm: sx.bpm, sens: sx.sens, gap: sx.gap, mode: sx.mode, div: sx.div, grid: sx.grid, marks: sx.marks.map(m => [m.p, m.m, m.on, m.c]) };
  o.slices = sx.slices.map(v => { const r = { s: v.s, e: v.e }; for (const k in def) if (k !== 's' && k !== 'e' && v[k] !== def[k]) r[k] = v[k]; return r; });
  return o;
}

/* ---------------- analysis (pure functions: tests/slices.test.mjs runs them in Node) ---------------- */
function sxFFT(re, im) {   // in place, radix 2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const p = i + k, q = p + len / 2, xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr;
      re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
/** Onset strength per hop (spectral flux on log magnitudes + rise in energy), N = 1024, hop 256. (Magnitudes with sqrt,
    not Math.hypot: the same bits in C++, native vd_slice.cpp.) */
function sxOnsetCurve(d) {
  const N = 1024, H = 256, nf = Math.max(1, Math.floor((d.length - N) / H) + 1), win = new Float64Array(N), re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  let prev = new Float64Array(N / 2), pe = 0;
  const flux = new Float64Array(nf), en = new Float64Array(nf);
  for (let f = 0; f < nf; f++) {
    const o = f * H; let e = 0;
    for (let i = 0; i < N; i++) { const x = o + i < d.length ? d[o + i] : 0; re[i] = x * win[i]; im[i] = 0; e += x * x; }
    sxFFT(re, im);
    let fl = 0; const cur = new Float64Array(N / 2);
    for (let k = 1; k < N / 2; k++) { const m = Math.log(1 + 100 * Math.sqrt(re[k] * re[k] + im[k] * im[k])); cur[k] = m; const df = m - prev[k]; if (df > 0) fl += df * (k < 12 ? 1.5 : 1); }
    prev = cur; flux[f] = fl; const le = Math.log(1e-9 + e / N); en[f] = Math.max(0, le - pe); pe = le;
  }
  const nz = a => { let m = 0; for (const v of a) m = Math.max(m, v); return m > 0 ? a.map(v => v / m) : a; };
  const fN = nz(flux), eN = nz(en), c = new Float64Array(nf);
  for (let f = 0; f < nf; f++) c[f] = 0.7 * fN[f] + 0.3 * eN[f];
  return { c, H, N };
}
/** Transient positions (samples): adaptive median threshold from `sens` (0…1), peaks at least `gapMs` apart,
    each moved back to where its attack starts. */
function sxDetect(d, rate, sens, gapMs) {
  if (!d || d.length < 2048) return d && d.length ? [0] : [];
  const { c, H, N } = sxOnsetCurve(d), nf = c.length, gap = Math.max(1, Math.round((gapMs / 1000) * rate / H)), out = [];
  const delta = 0.02 + 0.2 * (1 - sens) * (1 - sens), mult = 1 + (1 - sens);
  let last = -1e9, lastV = 0;
  for (let f = 1; f < nf - 1; f++) {
    const lo = Math.max(0, f - 8), hi = Math.min(nf, f + 9), w = Array.from(c.subarray(lo, hi)).sort((a, b) => a - b), med = w[w.length >> 1];
    if (!(c[f] > med * mult + delta && c[f] >= c[f - 1] && c[f] >= c[f + 1])) continue;
    const p = f * H + N - N / 4;   // log flux peaks as an attack enters the frame's far side
    if (f - last >= gap) { out.push(p); last = f; lastV = c[f]; }
    else if (c[f] > lastV) { out[out.length - 1] = p; last = f; lastV = c[f]; }   // closer than the spacing: the stronger one wins
  }
  // refine: steepest rise of a 32-sample envelope near each peak, less a short pre-roll
  const env = new Float32Array(d.length); { let a = 0; for (let i = 0; i < d.length; i++) { a += Math.abs(d[i]) - (i >= 32 ? Math.abs(d[i - 32]) : 0); env[i] = a / 32; } }
  const pre = Math.round(0.002 * rate), res = [];
  for (const p0 of out) {
    const a = Math.max(1, p0 - N / 2 - H), b = Math.min(d.length - 1, p0 + N / 2); let best = a, bv = -1;
    for (let i = a; i < b; i += 4) { const v = env[i] - env[Math.max(0, i - 64)]; if (v > bv) { bv = v; best = i; } }
    const p = Math.max(0, best - 32 - pre);
    if (!res.length || p - res[res.length - 1] >= gap * H * 0.5) res.push(p);
  }
  let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
  let s0 = 0; for (let i = 0; i < Math.min(d.length, Math.round(0.01 * rate)); i++) s0 = Math.max(s0, Math.abs(d[i]));
  if (s0 > 0.1 * pk && (!res.length || res[0] > 0.02 * rate)) res.unshift(0);
  return res;
}
/** Suggested class of the hit at p: kick (mostly lows), hat (mostly highs), ghost (quiet), else snare. */
function sxClassify(d, rate, p, loud) {
  const n = Math.min(d.length - p, Math.round(0.06 * rate)); if (n < 16) return 4;
  const al = 1 - Math.exp(-2 * Math.PI * 150 / rate), ah = 1 - Math.exp(-2 * Math.PI * 5000 / rate);
  let l = 0, h = 0, el = 0, eh = 0, e = 0, pk = 0;
  for (let i = 0; i < n; i++) { const x = d[p + i]; l += (x - l) * al; h += (x - h) * ah; const hp = x - h; el += l * l; eh += hp * hp; e += x * x; pk = Math.max(pk, Math.abs(x)); }
  if (e <= 1e-12) return 4;
  const lowR = el / e, highR = eh / e;
  if (loud > 0 && pk < 0.3 * loud) return 3;
  if (lowR > 0.45) return 0;
  if (highR > 0.3 && lowR < 0.1) return 2;
  return 1;
}
/** NEW (0.9.1): classes for every hit of a break at once, each judged against the others. A real break has a ride or
    hats ringing over everything and tails overlapping, so fixed thresholds call nearly every hit a snare. Here each
    hit's brightness — log(high-band share / low-band share) over its first 50 ms, stopping short of the next hit — is
    split into up to three groups (three-level Otsu); groups closer than ×2.5 are merged. The darkest group is the kicks
    (if it really has lows), the brightest the hats (if it really has highs), the rest snares; quiet snares are ghosts.
    One group only (a loop of one kind of hit): the fixed thresholds of sxClassify decide. */
function sxFeatures(d, rate, p, end) {
  const n = Math.max(0, Math.min(d.length - p, Math.round(0.05 * rate), end - p - Math.round(0.001 * rate)));
  if (n < 16) return { lowR: 0, highR: 0, pk: 0, e: 0 };
  const al = 1 - Math.exp(-2 * Math.PI * 150 / rate), ah = 1 - Math.exp(-2 * Math.PI * 6000 / rate);
  let l1 = 0, l2 = 0, h1 = 0, h2 = 0, el = 0, eh = 0, e = 0, pk = 0;
  for (let i = 0; i < n; i++) { const x = d[p + i]; l1 += (x - l1) * al; l2 += (l1 - l2) * al; h1 += (x - h1) * ah; const y = x - h1; h2 += (y - h2) * ah; const hp = y - h2;
    el += l2 * l2; eh += hp * hp; e += x * x; pk = Math.max(pk, Math.abs(x)); }
  return e > 1e-12 ? { lowR: el / e, highR: eh / e, pk, e } : { lowR: 0, highR: 0, pk, e: 0 };
}
function sxClassifyAll(d, rate, ps) {
  const n = ps.length; if (!n) return [];
  const f = ps.map((p, i) => sxFeatures(d, rate, p, i + 1 < n ? ps[i + 1] : d.length)), loud = f.reduce((a, x) => Math.max(a, x.pk), 0);
  const out = new Array(n).fill(4), idx = f.map((x, i) => i).filter(i => f[i].e > 0);
  const b = idx.map(i => Math.log((f[i].highR + 1e-3) / (f[i].lowR + 1e-3)));
  const ord = idx.map((_, k) => k).sort((x, y) => b[x] - b[y] || x - y), v = ord.map(k => b[k]), m = v.length;
  let groups = [];
  if (m >= 3) {   // three-level Otsu: cuts i < j, groups [0, i) [i, j) [j, m)
    const pre = [0]; for (const x of v) pre.push(pre[pre.length - 1] + x);
    const mean = (a, c) => (pre[c] - pre[a]) / (c - a), tot = pre[m] / m;
    let best = -1, bi = 1, bj = 2;
    for (let i = 1; i < m - 1; i++) for (let j = i + 1; j < m; j++) { const a0 = mean(0, i) - tot, a1 = mean(i, j) - tot, a2 = mean(j, m) - tot, sc = i * a0 * a0 + (j - i) * a1 * a1 + (m - j) * a2 * a2; if (sc > best) { best = sc; bi = i; bj = j; } }
    groups = [[0, bi], [bi, bj], [bj, m]];
    for (let g = groups.length - 1; g > 0; g--) if (mean(groups[g][0], groups[g][1]) - mean(groups[g - 1][0], groups[g - 1][1]) < Math.log(2.5)) { groups[g - 1][1] = groups[g][1]; groups.splice(g, 1); }
  }
  if (groups.length < 2) { idx.forEach(i => { out[i] = sxClassify(d, rate, ps[i], loud); }); return out; }
  const avg = (g, key) => { let s = 0; for (let k = g[0]; k < g[1]; k++) s += f[idx[ord[k]]][key]; return s / (g[1] - g[0]); };
  const kickG = avg(groups[0], 'lowR') >= 0.15 ? 0 : -1, hatG = avg(groups[groups.length - 1], 'highR') >= 0.05 ? groups.length - 1 : -1;
  groups.forEach((g, gi) => { for (let k = g[0]; k < g[1]; k++) { const i = idx[ord[k]];
    out[i] = gi === kickG ? 0 : gi === hatG ? 2 : (loud > 0 && f[i].pk < 0.3 * loud ? 3 : 1); } });
  return out;
}
function sxPeak(d, p, n) { let m = 0; for (let i = p; i < Math.min(d.length, p + n); i++) m = Math.max(m, Math.abs(d[i])); return m; }
/** Tempo of a loop: autocorrelation of the onset curve over 70–190 BPM, folded into 80–180, then snapped to a whole
    number of bars of the loop's length when one is close. 0 when there is no clear pulse. */
function sxBpm(d, rate, hint) {
  if (!d || d.length < rate) return 0;
  const { c, H } = sxOnsetCurve(d), fr = rate / H, n = c.length;
  let best = 0, bv = 0;
  for (let bpm = 70; bpm <= 190; bpm += 0.5) {
    const lag = fr * 60 / bpm, L = Math.floor(lag), fl = lag - L; if (L + 1 >= n) continue;
    let s = 0; for (let i = 0; i + L + 1 < n; i++) s += c[i] * (c[i + L] * (1 - fl) + c[i + L + 1] * fl);
    s /= (n - L);
    if (s > bv) { bv = s; best = bpm; }
  }
  if (!best) return 0;
  const acf = bpm => { const lag = fr * 60 / bpm, L = Math.floor(lag), fl = lag - L; if (L + 1 >= n) return 0; let s = 0; for (let i = 0; i + L + 1 < n; i++) s += c[i] * (c[i + L] * (1 - fl) + c[i + L + 1] * fl); return s / (n - L); };
  while (best < 80) best *= 2; while (best > 180) best /= 2;
  const cand = [0.5, 1, 2].map(k => best * k).filter(v => v >= 70 && v <= 190).map(v => ({ v, d: hint > 0 ? Math.abs(Math.log2(v / hint)) : 9 })).sort((a, b) => a.d - b.d);
  if (hint > 0 && cand.length > 1 && cand[1].d - cand[0].d > 0.25) best = cand[0].v;   // the project's tempo picks the octave when it clearly points to one
  else if (best * 2 <= 180 && acf(best * 2) >= 0.35 * acf(best)) best *= 2;   // else a busy break: prefer the faster pulse when it holds up
  const sec = d.length / rate;
  for (const bars of [1, 2, 4, 8, 16]) { const b = bars * 4 * 60 / sec; if (Math.abs(b - best) / best < 0.04) return Math.round(b * 100) / 100; }   // a whole number of bars
  let bb = 0, bv2 = 0;   // not near one: a loop is usually whole bars — take the bar tempo with the strongest pulse if it holds up
  for (const bars of [1, 2, 4, 8, 16]) { const b = bars * 4 * 60 / sec; if (b < 70 || b > 190) continue; const v = acf(b); if (v > bv2) { bv2 = v; bb = b; } }
  if (bb && bv2 >= 0.5 * acf(best)) return Math.round(bb * 100) / 100;
  return Math.round(best * 100) / 100;
}

/* ---------------- slices from marks / grids ---------------- */
/** Re-detect: new detected marks replace detected ones; marks you placed by hand stay. */
function sxRedetect(sx, m) {
  const det = sxDetect(m.d, m.rate, sx.sens, sx.gap);
  const keep = sx.marks.filter(k => k.m), near = Math.round(0.01 * m.rate);
  const marks = keep.slice();
  det.forEach(p => { if (!keep.some(k => Math.abs(k.p - p) < near)) marks.push({ p, m: 0, on: 1, c: 4 }); });
  marks.sort((a, b) => a.p - b.p);
  const cls = sxClassifyAll(m.d, m.rate, marks.map(k => k.p));   // 0.9.1: judged together
  marks.forEach((k, i) => { if (!k.m || k.c === 4) k.c = cls[i]; });
  sx.marks = marks;
  if (!sx.bpm) sx.bpm = sxBpm(m.d, m.rate, typeof S !== 'undefined' && S.bpm || 0);
}
/** Cuts the sample into slices by the editor's mode; a slice that starts where an old one started keeps its settings. */
function sxMakeSlices(sx, m) {
  const n = m.d.length, bpm = sx.bpm > 0 ? sx.bpm : 0, beat = bpm ? 60 / bpm * m.rate : 0;
  let pts = [];
  if (sx.mode === 0) pts = sx.marks.filter(k => k.on).map(k => k.p);
  else if (sx.mode === 1) for (let i = 0; i < sx.div; i++) pts.push(Math.round(i * n / sx.div));
  else {
    const step = sx.mode === 2 ? beat : sx.mode === 3 ? beat * 4 : beat * SX_GRIDS[sx.grid][1];
    if (step > 16) for (let p = 0; p < n - 16; p += step) pts.push(Math.round(p));
    else for (let i = 0; i < sx.div; i++) pts.push(Math.round(i * n / sx.div));   // no tempo yet: equal divisions
  }
  pts = [...new Set(pts.filter(p => p >= 0 && p < n - 8))].sort((a, b) => a - b).slice(0, SX_MAX);
  if (!pts.length) pts = [0];
  const old = sx.slices, near = Math.round(0.01 * m.rate);
  sx.slices = pts.map((s, i) => {
    const e = i + 1 < pts.length ? pts[i + 1] : n, mk = sx.marks.find(k => Math.abs(k.p - s) < near);
    const o = old.find(v => Math.abs(v.s - s) < near);
    const r = o ? Object.assign({}, o, { s, e }) : drumSliceDef(s, e, mk ? mk.c : 4);
    if (!o && mk) r.c = mk.c; return r;
  });
}

/* ---------------- transient-aware time-stretch (WSOLA) ---------------- */
/** x stretched by `f` (output length ≈ f × input). The first 12 ms (the attack) is copied as it is, then blended
    into the overlap-added frames; frames are 25 ms, half overlapping, aligned within ±4 ms by correlation. */
function sxStretch(x, f, rate) {
  const n = x.length; if (n < 8 || Math.abs(f - 1) < 1e-3) return Float32Array.from(x);
  const W = Math.max(64, Math.round(0.025 * rate) & ~1), H = W >> 1, S = Math.round(0.004 * rate), outN = Math.max(8, Math.round(n * f));
  const out = new Float32Array(outN + W), wsum = new Float32Array(outN + W), win = new Float32Array(W);
  for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / W);
  const at = (i) => i >= 0 && i < n ? x[i] : 0;
  let prevIn = 0;
  for (let k = 0; k * H < outN; k++) {
    const op = k * H, nom = Math.round(op / f);
    let pos = nom;
    if (k > 0) {
      const tpl = prevIn + H; let best = -Infinity;
      for (let dlt = -S; dlt <= S; dlt += 2) { const c0 = nom + dlt; if (c0 < 0) continue; let s = 0; for (let i = 0; i < W; i += 4) s += at(c0 + i) * at(tpl + i); if (s > best) { best = s; pos = c0; } }
    }
    for (let i = 0; i < W; i++) { out[op + i] += at(pos + i) * win[i]; wsum[op + i] += win[i]; }
    prevIn = pos;
  }
  for (let i = 0; i < outN; i++) out[i] = wsum[i] > 1e-3 ? out[i] / wsum[i] : out[i];
  const A = Math.min(n, outN, Math.round(0.012 * rate)), R = Math.round(0.003 * rate);
  for (let i = 0; i < Math.min(outN, A + R); i++) { const g = i < A ? 0 : (i - A) / R; out[i] = x[Math.min(i, n - 1)] * (1 - g) + out[i] * g; }
  const T = Math.min(outN, Math.round(0.003 * rate)); for (let i = 0; i < T; i++) out[outN - 1 - i] *= i / T;
  return out.subarray(0, outN);
}

/* ---------------- prepared buffer for the engine ---------------- */
/** Every slice cut out, stretched by its own Stretch × the track's Tune mode, joined; with the engine's slice table.
    Tune mode RATE: pitch changes length (stretch × only). STRETCH: the track's Stretch, length kept when you retune.
    TEMPO LOCK: follows the master tempo from the sample's own BPM. Returns null for "play the sample as it is". */
function sxPrepare(m, sx, o) {
  if (!m || !sx) return null;
  const mode = o.tsmode | 0, lock = mode === 2 && sx.bpm > 0 ? sx.bpm / o.bpm : 1;
  const sl = sx.slices.length ? sx.slices : (mode ? [drumSliceDef(0, m.d.length)] : null);
  if (!sl) return null;
  const parts = [], tab = new Float32Array(sl.length * SLF_N); let len = 0;
  sl.forEach((v, i) => {
    const s = Math.min(v.s, m.d.length - 2), e = Math.min(Math.max(v.e, s + 2), m.d.length), seg = m.d.subarray(s, e);
    const pc = mode ? Math.pow(2, (o.tune + v.p) / 12) : 1, f = v.st * (mode ? o.stretch * lock * pc : 1);
    const y = Math.abs(f - 1) < 1e-3 ? seg : sxStretch(seg, f, m.rate);
    const t = i * SLF_N;
    tab[t] = len; tab[t + 1] = y.length; tab[t + 2] = v.p; tab[t + 3] = v.g; tab[t + 4] = v.pan; tab[t + 5] = v.a / 1000; tab[t + 6] = v.gate;
    tab[t + 7] = v.r; tab[t + 8] = v.stut; tab[t + 9] = v.sd * 60 / Math.max(o.bpm, 20); tab[t + 10] = v.m;
    parts.push(y); len += y.length;
  });
  const d = new Float32Array(len); let p = 0; for (const y of parts) { d.set(y, p); p += y.length; }
  return { d, rate: m.rate, table: tab };
}
function sxPrepOpts(t) { return { tsmode: Math.round(drumVal(`t${t + 1}.tsmode`)), stretch: drumVal(`t${t + 1}.stretch`), tune: drumVal(`t${t + 1}.tune`), bpm: S.bpm || 120 }; }
function sxSig(t) {
  const sx = drumSx()[t], o = sxPrepOpts(t); if (!sx.slices.length && !o.tsmode) return '';
  const uses = o.tsmode || sx.slices.some(v => v.stut); return JSON.stringify([sx.slices, o.tsmode, o.tsmode ? o.stretch : 1, o.tsmode ? o.tune : 0, uses ? o.bpm : 0, o.tsmode === 2 ? sx.bpm : 0]);
}
