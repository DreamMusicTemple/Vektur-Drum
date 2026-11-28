// C++ encoders vs the web app's: WAV and FLAC byte-identical, MP3 decodes (ffmpeg) to the right length and quality.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.join(__dirname, '../..'), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vdenc-'));
const VDENC = new Function(fs.readFileSync(path.join(ROOT, 'web/src/encoders.js'), 'utf8') + '; return VDENC;')();
let fails = 0;
for (const sr of [44100, 48000]) {
  const n = Math.round(sr * 1.7) + 333, L = new Float32Array(n), R = new Float32Array(n); let q = 3;
  for (let i = 0; i < n; i++) { const t = i / sr; q = (q * 1103515245 + 12345) >>> 0; L[i] = .45 * Math.sin(2 * Math.PI * 220 * t) * Math.exp(-(i % 9000) / 3000) + .08 * (q / 2 ** 31 - 1); R[i] = .35 * Math.sin(2 * Math.PI * 1320 * t) + .1 * Math.sin(2 * Math.PI * 60 * t); }
  const raw = new Float32Array(2 * n); for (let i = 0; i < n; i++) { raw[2 * i] = L[i]; raw[2 * i + 1] = R[i]; }
  fs.writeFileSync(path.join(TMP, 'in.f32'), Buffer.from(raw.buffer)); cp.execFileSync('/tmp/vd_encode_cpp', [path.join(TMP, 'in.f32'), String(sr), TMP]);
  const js = { 'w16.wav': VDENC.wav([L, R], sr, 16), 'w24.wav': VDENC.wav([L, R], sr, 24), 'w32.wav': VDENC.wav([L, R], sr, 32), 'f16.flac': VDENC.flac([L, R], sr, 16), 'f24.flac': VDENC.flac([L, R], sr, 24), 'm128.mp3': VDENC.mp3([L, R], sr, 128), 'm320.mp3': VDENC.mp3([L, R], sr, 320) };
  for (const [k, b] of Object.entries(js)) {
    const c = fs.readFileSync(path.join(TMP, 'cpp_' + k)); const same = c.length === b.length && Buffer.compare(c, Buffer.from(b)) === 0;
    if (k.endsWith('.mp3')) {
      const d = cp.execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(TMP, 'cpp_' + k), '-f', 'f32le', '-ac', '2', '-'], { maxBuffer: 1 << 28 }); const y = new Float32Array(d.buffer, d.byteOffset, d.length / 4);
      let e = 0, s = 0; for (let i = 0; i < n; i++) { e += (y[2 * i] - L[i]) ** 2 + (y[2 * i + 1] - R[i]) ** 2; s += L[i] ** 2 + R[i] ** 2; } const snr = 10 * Math.log10(s / e), ok = y.length / 2 === n && snr > (k === 'm128.mp3' ? 25 : 40);
      if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${sr} ${k}: C++ decodes to ${y.length / 2} samples, SNR ${snr.toFixed(1)} dB · ${same ? 'byte-identical to the web encoder' : 'differs from the web encoder in ' + c.length + '/' + b.length + ' bytes (libm last-bit differences)'}`);
    } else { if (!same) fails++; console.log(`${same ? 'ok  ' : 'FAIL'} ${sr} ${k}: C++ ${same ? 'byte-identical to the web encoder' : 'DIFFERS'} (${c.length} bytes)`); }
  }
}
fs.rmSync(TMP, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
