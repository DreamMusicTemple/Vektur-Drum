// Pulls the parameter table + engine source out of a built page (the extracted reference or the Vektur Drum build).
'use strict';
const fs = require('fs');
function engineCode(page) {
  const pairs = [['/* DRUM_PARAMS:BEGIN', '/* ---- extracted from Vektur VJ: panel ---- */'], ['/* ==== params.js ==== */', '/* ==== panel.js ==== */']];
  for (const [a, b] of pairs) { const i = page.indexOf(a), j = page.indexOf(b, i); if (i >= 0 && j > i) return page.slice(i, j); }
  throw new Error('engine blocks not found');
}
function loadEngine(file) {
  const code = engineCode(fs.readFileSync(file, 'utf8'));
  const X = new Function(code + '\nreturn { DRUM_PARAMS, DRUM_DIV_BEATS, DRUM_NOTES, DRUM_DEF_DIV, drumsMakeEngine };')();
  const Drums = X.drumsMakeEngine(X.DRUM_PARAMS, X.DRUM_DIV_BEATS, X.DRUM_NOTES, X.DRUM_DEF_DIV);
  const ID = {}; X.DRUM_PARAMS.forEach((p, i) => { ID[p[0]] = i; });
  return { ...X, Drums, ID };
}
module.exports = { engineCode, loadEngine };
