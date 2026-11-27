# Vektur Drum

A standalone drum machine built from the drum machine in Vektur VJ (Vektur Pulse).
It is heading for a native Swift/SwiftUI app with a C++ DSP core, 6–12 tracks and a dedicated FM drum engine.

**Status: Stages 1–3 are done (audit, extraction plan, native architecture and interfaces). The web test app now has the Stage 6–7 features too:**
9 tracks and 9 pads (track count 6–9), a per-track engine (drum synth, sample or FM), pitch sweep, choke groups A–D,
an FM engine with a wavefolder and per-step ratio, and a global glitch (stutter, reverse, Metal stretch) with 3 LFOs.
**Stage 4 is done:** the C++ engine is complete behind `vd_engine.h` and matches the web engine sample for sample (`sh tests/run_native.sh`). Next: Stage 5, the Xcode project and AUv3.
**NEW (0.6):** the **Slicer** (a beat-synced rearranger of the whole output, with its own window: 12 actions, density, evolve,
seed, hold pads, generators), **per-step ring modulation** (master track or oscillator × chosen slaves, popup per step), a
**modulation matrix** (LFO 1–3, envelope follower, chaos → up to 32 wires to any dial, by drag and drop) and **20 user banks
× 99 presets**. All of it is in the web app and the native engine (C++ parity, sanitizers), the Swift model, state v2 and the manual.
**NEW (0.7):** per-step **fold**, a **4-band EQ per track** (every gain and frequency modulatable), global **tape wow, flutter and
vinyl dust**, a live **modulation light on every dial** a source moves, **40 new factory kits** (10 IDM, 10 Techno, 10 Lo-Fi &
Downtempo, 10 Hard Trance & Psytrance — 58 in all, shared with native through `tools/gen_factory.mjs`), a compact layout, a
floating, resizable MOD window, 13 colour themes with custom colours (SETTINGS → APPEARANCE), and user banks limited to 20. State v3.
**NEW (0.8):** per-step **pitch shifter** (Shift, Mix) and **spectral** processor (Spectral, Colour — six manipulations in one dial —
Mix) on any engine; reverb types **Room, Spring, Gate, Expanse** (washes at 90–95 %, freeze at 95–100 %); an **insert input** (the
AUv3 effect *Vektur Drum FX*, or an audio input in the web app); master **TEMPER** (warm ↔ cold, replaces Warmth, bypassed at
neutral) and **HUMANISE** (timing, then ghost notes and embellishments; off = exact); **INIT** (blank kit) and 30 new kits (10 80s
Electro, 10 Breakbeat, 10 Ambient — 88 in all); a **pads window** (⤢, movable, scalable, full screen); 11 dial designs from Vektur
Vocal and Vektur Vortex; shaded sections (effects in their own dark grey area). State v5 (reads v1–v4; Warmth migrates).
**0.8.1–0.8.2:** **EXPORT** master or stems as WAV / FLAC / MP3 (the whole chain when CHAIN is on, else the selected pattern; RING OUT or CUT) —
web and native (C++ encoders byte-identical to the web's, `vd_engine_render_offline`, Swift `Exporter`); **Metalise** (the glitch's metallic stretch) in the
Slicer window; the chain as draggable chips on the BARS row; clearer section titles. See docs/AUDIT-0.8.md for the completion report, tests and the code audit, and docs/AUV3.md for the AUv3 components.
**NEW (0.9.1): hold to modulate.** Touch and hold any dial to wire LFO 1–3, the envelope follower or chaos to it (the MOD
list follows); hold the Metalise ON switch to automate it with an LFO or a per-division **CHANCE**; LFOs get a **Draw** shape
(16 points); **LONG** lets any sound ring for up to 60 s; **undo / redo** for every edit; the Slicer chooses its patterns 1–8;
BREAK LAB tells kicks, snares, hats and ghosts apart by comparing every hit with the rest; short readable sample names on
pads; two new step designs (Glass, Neon ring) and Interstellar dials by default; the DMT Cymatics logo in the top strip
("Vektur Drum — Hybrid Drum Machine") and About; the track EQ above TAPE. Native: C++ engine (strict parity ≤ 1e-6),
`vd_slice_classify_all`, Swift model and codec. See docs/AUDIT-0.9.1.md.

**NEW (0.9): a twelve-track breakbeat sampler.** **12 tracks and 12 pads**; per-track and per-step **METALISE** (a vintage 16-bit
sampler character: transient-dependent saturation, emphasis, rate and bit reduction, sample-and-hold, metallic resonances — bypassed
at 0) and **RESAMPLE** (six sampler models, four transient modes: Preserve, Round, Crush, Rebuild); the **BREAK LAB** sample editor
(automatic transient detection with manual editing and undo, tempo detection, transient / equal / beat / bar / grid slicing, per-slice
pitch, gain, pan, attack, gate, reverse, stretch, stutter and Metalise, slice pads with REC, slices to steps and across tracks,
**RESAMPLE TRACK → NEW SAMPLE**, MIDI export); **TEMPO LOCK** and transient-aware time-stretch; a **groove generator** (16 variations,
lock kick, random snares, mutate ghosts, reverse / stutter chance); **GENERATE** (DnB, Jungle, Dub Techno, TripHop, Hip Hop, Trance,
House); each pattern's own **Slicer** switch. Web and native: C++ engine parity (strict, every sample within 1e-6), `vd_slice.cpp`
(analysis, stretch, preparation) identical to the web's, Swift model, state v6 and generators. See docs/AUDIT-0.9.md.
Targets: iOS/iPadOS 17, universal iPhone and iPad app, plus an AUv3 instrument in v1.

```
docs/STATE.md               saving songs: format, AUv3 behaviour in hosts, tests, host checklist
docs/ARCHITECTURE.md        Stage 3: targets, modules, contracts, parameters, clock, AUv3, iPhone/iPad UI
docs/EXTRACTION_REPORT.md   audit, dependency map, classification, bugs found, architecture plan  ← start here
tools/extract_drums.py      regenerates the reference build from Vektur VJ's index.html (read-only on VJ)
web/src/                    Vektur Drum's web source (forked from the extraction); tools/build_web.py → web/dist/index.html
reference/web/index.html    GENERATED, frozen: Vektur VJ's drum machine: Vektur VJ's drum code, verbatim + 3 documented patches
reference/web/host.js       the only new code in it: audio, clock, project save, MIDI in
reference/web/host.css      standalone layout
reference/web/worklet.js    AudioWorklet processor around the extracted engine
native/                     Swift package VekturDrumKit: the C++ engine behind a C API (tested), Swift model,
                            engine wrapper and interfaces (Swift not yet compiled: needs Xcode)
tools/gen_native_params.js  generates the C++ and Swift parameter tables from web/src/params.js
tools/gen_manual.js         generates the native manual (Swift) and docs/MANUAL.md from web/src/manual.js
docs/MANUAL.md              the user manual (same text as SETTINGS → MANUAL)
tests/engine.test.js        headless engine tests, run on both builds
tests/parity.test.js        new engine vs Vektur Pulse: identical output with the new features off
tests/run_native.sh         every native check: C++ tests (+ ASan/UBSan/TSan), C++ ↔ web parity
tests/kits.test.mjs         every factory kit loads and plays: finite, bounded, audible (headless Chrome)
tests/state.test.mjs        song save/open: round trip, autosave, legacy files, 300 corrupted files (headless Chrome)
tests/features.test.js      12 tracks, engines, FM, fold, step ratio, sweep, choke groups, glitch, LFOs, Slicer (every action,
                            seed, density, hold), ring steps, mod matrix and sources, 3-minute soak
tests/sampler.test.js       0.9: METALISE, RESAMPLE (models, transient modes), slices, transients, tempo, stretch, per-pattern Slicer
tests/breaklab.test.mjs     0.9: BREAK LAB, groove generator, slices across 12 tracks, resample, MIDI export, GENERATE (headless Chrome)
tests/ui091.test.mjs        0.9.1: logo + title, undo / redo, pad names, hold-to-modulate, Metalise chance, LFO Draw, Slicer patterns, step designs, EQ above TAPE
tests/native_slice/         0.9: vd_slice.cpp ↔ web/src/slices.js (transients, classes, tempo, stretch, prepared buffers)
```

## Rebuild and test

```sh
sh tests/run_native.sh                           # C++ engine: tests, sanitizers, parity with the web engine
node tools/gen_native_params.js                  # after changing web/src/params.js
node tools/gen_manual.js                         # after changing web/src/manual.js
node tools/gen_factory.mjs                       # after changing the factory kits (needs the web build)
python3 -I tools/build_web.py                    # web/dist/index.html
node tests/parity.test.js && node tests/features.test.js web/dist/index.html && node tests/sampler.test.js
node tests/breaklab.test.mjs && node tests/state.test.mjs && node tests/kits.test.mjs && node tests/export.test.mjs
python3 -I tools/extract_drums.py /path/to/VekturVJ/index.html reference/web/index.html
node tests/engine.test.js reference/web/index.html
g++ -std=c++17 -O2 -pthread -I native/Sources/VekturDrumDSP/include -I native/Sources/VekturDrumDSP \
    native/Tests/dsp/test_realtime.cpp -o /tmp/vd_rt && /tmp/vd_rt
```

To try it, open `reference/web/index.html` in a browser. It works from `file://` and needs a browser with AudioWorklet support. Tap anywhere to start the audio, then press PLAY.

If a Vektur VJ update moves or renames a section marker, the extractor stops and names the marker, rather than producing a partial copy.
