# Vektur Drum 0.9.1 — completion report

Fourteen requests, all done on the web app. Every engine and model change is also in the native code: the C++ engine
(strict parity ≤ 1e-6), the C API, `vd_slice` and the Swift model, codec and appearance tables. The SwiftUI screens still
belong to the Xcode app (Stage 5), as in earlier releases. No hardware manufacturer names, logos or trademarks are used.

## What was built

| # | Request | Web | Native |
|---|---|---|---|
| 1 | Interstellar is the default dial design | dials.js (`DIAL.style`) | `AppearanceTheme.defaultDialStyle` (generated) |
| 2 | Two more sequencer step designs | appearance.js: Glass (lit glass tiles), Neon ring; Settings → APPEARANCE → STEP DESIGN | `AppearanceTheme.stepStyles` (generated) |
| 3 | Metalise ON automated by a hold: any LFO or CHANCE | glitch-panel.js `data-mod-key='gl.on'`, mod-panel.js popup with CHANCE + every 1/16…1 bar | `gl.on` modulatable (generated, Swift `isModulatable`); `gl.chance` 38, `gl.chdiv` 39; DrumEngine.hpp chance gate (own RNG) |
| 4 | Draw your own LFO shape | shape 5 "Draw", `lfoDrawEditor` (16 points, SINE / RAMP / STEPS / RANDOM / FLAT), saved in songs and kits | `lfoTab`, `VD_CMD_SET_LFO_POINTS`, `DrumProject.lfoShapes`, `StateCodec` `lfoShapes`, `EngineCommand.setLfoPoints`, sent on every sync and AU restore |
| 5 | Every dial: hold → add modulation, MOD list updates | mod-panel.js `MODLP` (550 ms, cancelled by a 7 px move, swallows the click) + `modPopup` | — (wires already ported; UI is Stage 5) |
| 6 | Short sample names on pads, space either side | `drumAbbrev` (tempo tag dropped, take number kept, words shortened), tooltip with the full name; also on the track names | — (UI) |
| 7 | Slicer window: patterns 1–8 | slicer-panel.js PATTERNS row, SONG → ON → OFF (op `'B'`) | `setPatternSlicer` (0.9) |
| 8 | Undo / redo left of ON | undo.js (snapshots, 60 deep, transport keeps running), ↶ ↷, Ctrl/⌘-Z, Shift-Ctrl/⌘-Z, Ctrl-Y | `DrumProject` is a value type; the app's UndoManager (Stage 5) |
| 9 | "Hybrid Drum Machine" | panel.js subtitle; About "Hybrid drum machine" | manual |
| 10 | Logo in About | settings.js `.setlogo` (256 px WebP) | — (UI) |
| 11 | Logo top left, scaled | panel.js `.dmlogo` (96 px WebP, 1.9 rem circle) | — (UI) |
| 12 | Track EQ above TAPE (WHOLE MIX) | effects column: EFFECTS, EQ, TAPE | — (UI) |
| 13 | Amen break: every slice called "snare" | `sxClassifyAll`: every hit judged against the others (brightness groups by three-level Otsu) | `vd_slice_classify_all`; Swift `SampleAnalysis.redetect` / `addMark` use it |
| 14 | Sounds longer than 3 s (drones to 60 s) | LONG button beside Decay (Decay ×20, to 60 s; samples play to the end) | `long` (track local 56), DrumEngine.hpp |

## Tests (all pass)

| Suite | Result |
|---|---|
| tests/engine.test.js | 53 checks |
| tests/features.test.js | 193 checks |
| tests/parity.test.js | identical to the reference engine |
| tests/sampler.test.js | 70 checks — new: realistic amen breaks (ride wash, overlapping tails) at 3 tempos classify kicks, snares and hats; LONG; LFO Draw; LFO → `gl.on`; CHANCE; chance 0 = bit-identical |
| tests/breaklab.test.mjs · state · kits · export | 28 · 21 · 89 kits · 25 |
| **tests/ui091.test.mjs (new)** | 46 checks in Chrome: logo before the name and scaled to the row, HYBRID DRUM MACHINE, undo / redo left of ON and working, Interstellar default, 4 sample names abbreviated with room either side, hold a dial → popup → wire added → MOD list, hold Metalise ON → sources + CHANCE (and no accidental toggle), Slicer patterns cycle, LFO Draw canvas rewrites the points, EQ directly above TAPE, LONG, step designs, About logo, no page errors |
| tests/run_native.sh | engine 146 checks (new `test_10_091`: LONG rings at 6–8 s, LFO Draw via telemetry, LFO wired to `gl.on`, chance) — also under ASan + UBSan; `vd_slice` ↔ slices.js 35 checks (classify-all on 2 amen breaks); strict parity: every sample within 1e-6 (§18: LONG, a drawn LFO, a wire to `gl.on`, chance) |

Screens were checked at 1280 × 860, 820 × 1180 and 390 × 844: the top row wraps on narrower screens instead of clipping.

## Notes

- Swift code was written without a Swift toolchain (as before); expect small fixes at the first Xcode build.
- `lfoShapes` is optional in the state file, so 0.9 songs open unchanged and 0.9 readers ignore it; the format stays v6.
