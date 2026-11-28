// Vektur Drum 0.9 — vd_slice.cpp ↔ web/src/slices.js: transients, classes, tempo, stretch and prepared buffers must match.
//   node tests/native_slice/run.js   (after building slice_cpp: see tests/run_native.sh)
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const here = __dirname, SRC = fs.readFileSync(path.join(here, '../../web/src/slices.js'), 'utf8');
const SX = new Function('drumState', 'drumVal', 'S', SRC + '\nreturn { sxDetect, sxClassify, sxClassifyAll, sxBpm, sxStretch, sxPrepare, sxPeak, drumSliceDef };')(() => ({}), () => 0, { bpm: 0 });
let q = 99; const rnd = () => { q = (q * 1103515245 + 12345) >>> 0; return q / 4294967296 * 2 - 1; };
function breakLoop(bpm, rate, bars, seed) {
  q = seed; const beat = 60 / bpm * rate, n = Math.round(4 * bars * beat), d = new Float32Array(n);
  const put = (p, cls, g) => { p = Math.round(p); let hp = 0; for (let i = 0; i < Math.round(0.18 * rate) && p + i < n; i++) { const t = i / rate; let x;
    if (cls === 0) x = Math.sin(2 * Math.PI * (55 + 120 * Math.exp(-t * 40)) * t) * Math.exp(-t * 18) * .9;
    else if (cls === 1) x = (rnd() * .6 + Math.sin(2 * Math.PI * 190 * t) * .4) * Math.exp(-t * 22) * .8;
    else if (cls === 2) { const r = rnd(); x = (r - hp) * Math.exp(-t * 70) * .35; hp = r; } else x = (rnd() * .6) * Math.exp(-t * 30) * .12;
    d[p + i] += x * g; } };
  for (let b = 0; b < bars; b++) { const o = b * 4 * beat; [0, 2.5].forEach(x => put(o + x * beat, 0, 1)); [1, 3].forEach(x => put(o + x * beat, 1, 1)); [.5, 1.5, 3.5].forEach(x => put(o + x * beat, 2, .8 + .2 * rnd())); put(o + (2.25 + (b % 2) * .5) * beat, 3, 1); }
  return d;
}
const cases = [[170, 48000, 2, 1, .5, 50, 0, 1.25], [87, 44100, 1, 2, .7, 40, 90, 0.8], [174, 48000, 4, 3, .3, 60, 172, 2], [136, 44100, 2, 4, .9, 25, 0, 0.6], [120, 96000, 1, 5, .5, 50, 120, 1.5]];
function amen(bpm, rate, seed){ let q=seed; const rnd=()=>{q=(q*1103515245+12345)>>>0;return q/4294967296*2-1;};
 const beat=60/bpm*rate,n=Math.round(8*beat),d=new Float32Array(n),hits=[];
 // ride: continuous metallic noise, every 8th note re-struck
 let hp=0,hp2=0;
 const put=(p0,c,g)=>{const p=Math.round(p0);hits.push({p,c});let a=0,b=0,lp=0;for(let i=0;i<Math.round(.35*rate)&&p+i<n;i++){const t=i/rate;let x=0;
  if(c===0){x=Math.sin(2*Math.PI*(50+90*Math.exp(-t*30))*t)*Math.exp(-t*9)*.85+(i<200?rnd()*.4*Math.exp(-i/40):0);}
  else if(c===1||c===3){const nz=rnd();lp+=(nz-lp)*.35;x=(lp*.9+Math.sin(2*Math.PI*185*t)*.5+Math.sin(2*Math.PI*330*t)*.25)*Math.exp(-t*14);}
  else{const r=rnd();a+=(r-a)*.9;x=(r-a)*Math.exp(-t*25)*1.4;}
  d[p+i]+=x*g;}};
 for(let b=0;b<2;b++){const o=b*4*beat;
  put(o,0,1);put(o+.5*beat,0,.95);put(o+1*beat,1,1);put(o+1.75*beat,3,.3);put(o+2.25*beat,1,.35);put(o+2.5*beat,0,1);put(o+3*beat,1,1);put(o+3.75*beat,3,.32);
  for(let k=0;k<8;k++){const pos=o+k*beat/2; if(![0,.5,1,2.5,3].some(x=>Math.abs(o+x*beat-pos)<1))put(pos,2,.45);}}
 // continuous ride wash
 for(let i=0;i<n;i++){const r=rnd();hp+= (r-hp)*.85;const x=r-hp;hp2+=(x-hp2)*.3;d[i]+=(x-hp2)*.06;}
 hits.sort((a,b)=>a.p-b.p);return {d,hits};}
cases.push([136, 44100, 2, 3, .5, 30, 0, 1.3], [170, 48000, 2, 9, .5, 30, 170, 0.75]);   // 0.9.1: breaks with a ride over everything
const sigs = cases.map((c, i) => i < 5 ? breakLoop(c[0], c[1], c[2], c[3]) : amen(c[0], c[1], c[3]).d);
let off = 0; const lines = [];
sigs.forEach((s, i) => { const c = cases[i]; lines.push(`${off} ${s.length} ${c[1]} ${c[4]} ${c[5]} ${c[6]} ${c[7]}`); off += s.length; });
const all = new Float32Array(off); { let o = 0; for (const s of sigs) { all.set(s, o); o += s.length; } }
fs.writeFileSync(path.join(here, 'in.f32'), Buffer.from(all.buffer)); fs.writeFileSync(path.join(here, 'cases.txt'), lines.join('\n') + '\n');
execFileSync('/tmp/vd_slice_cpp', [], { cwd: here });
const out = fs.readFileSync(path.join(here, 'out.txt'), 'utf8').trim().split('\n'), bin = fs.readFileSync(path.join(here, 'out.f32')), fb = new Float32Array(bin.buffer, bin.byteOffset, bin.length / 4);
let fails = 0, checks = 0, li = 0, bo = 0; const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } };
sigs.forEach((d, i) => {
  const [, rate, , , sens, gap, hint, fct] = cases[i];
  const det = SX.sxDetect(d, rate, sens, gap), loud = det.reduce((a, p) => Math.max(a, SX.sxPeak(d, p, Math.round(0.06 * rate))), 0);
  const cD = out[li++].split(' ').slice(1).map(Number), cC = out[li++].split(' ').slice(1).map(Number), cB = +out[li++].split(' ')[1];
  ok(JSON.stringify(cD) === JSON.stringify(det), `case ${i + 1}: transients identical (${det.length}) ${JSON.stringify(cD.slice(0, 6))} vs ${JSON.stringify(det.slice(0, 6))}`);
  ok(JSON.stringify(cC) === JSON.stringify(SX.sxClassifyAll(d, rate, det)), `case ${i + 1}: classes identical (${cC.join('')})`);
  const bpm = SX.sxBpm(d, rate, hint); ok(Math.abs(cB - bpm) < 1e-9, `case ${i + 1}: tempo identical (${cB} vs ${bpm})`);
  const sn = Math.min(d.length, Math.floor(rate * 0.4)), st = SX.sxStretch(d.subarray(0, sn), fct, rate), sk = +out[li++].split(' ')[1];
  let md = 0; for (let k = 0; k < Math.min(sk, st.length); k++) md = Math.max(md, Math.abs(fb[bo + k] - st[k])); bo += sk;
  ok(sk === st.length && md <= 1e-6, `case ${i + 1}: stretch ×${fct} identical (${sk} vs ${st.length} frames, max diff ${md.toExponential(1)})`);
  const sx = { bpm, slices: det.slice(0, 32).map((p, k) => Object.assign(SX.drumSliceDef(p, k + 1 < det.length ? det[k + 1] : d.length), { p: (k % 5) - 2, st: k % 3 === 1 ? 1.37 : 1, r: k % 4 === 3 ? 1 : 0 })) };
  const pr = SX.sxPrepare({ d, rate }, sx, { tsmode: fct > 1 ? 2 : 1, stretch: 1.1, tune: 3, bpm: bpm > 0 ? bpm * .8 : 120 });
  const pl = out[li++].split(' ').slice(1).map(Number), pn = pl[0], ptab = pl.slice(1);
  let pd = 0; for (let k = 0; k < Math.min(pn, pr.d.length); k++) pd = Math.max(pd, Math.abs(fb[bo + k] - pr.d[k])); bo += pn;
  const tabOk = ptab.length === pr.table.length && ptab.every((v, k) => Math.abs(v - pr.table[k]) <= 1e-6 * Math.max(1, Math.abs(v)));
  ok(pn === pr.d.length && pd <= 1e-6 && tabOk, `case ${i + 1}: prepared buffer and slice table identical (${pn} vs ${pr.d.length} frames, diff ${pd.toExponential(1)})`);
});
['in.f32', 'cases.txt', 'out.txt', 'out.f32'].forEach(f => fs.unlinkSync(path.join(here, f)));
console.log(`vd_slice ↔ slices.js: ${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
