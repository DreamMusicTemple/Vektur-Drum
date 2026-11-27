# Vektur Drum — Stage 3: Native Architecture and Interfaces

Decisions (2026-11-20): **iOS/iPadOS 17 minimum · universal (iPhone and iPad) · the AUv3 instrument ships in version 1.**

This follows `EXTRACTION_REPORT.md` §8. It sets the targets, the module boundaries, the contracts between modules, and what AUv3 in v1 changes.

---

## 1. Targets

| Target | What it is | Links |
|---|---|---|
| **Vektur Drum** (app) | Universal iPhone and iPad app, iOS 17. Hosts the drum machine itself and is the container for the extension | VekturDrumCore, VekturDrumAudio, VekturDrumDSP |
| **Vektur Drum AU** (app extension) | AUv3 instrument (`aumu`), with a SwiftUI view, for AUM, Cubasis, Logic for iPad, GarageBand, Drambo … | the same three libraries |
| **VekturDrumKit** (Swift package, `native/Package.swift`) | The shared code, as three libraries | — |

**One engine, two hosts.** The audio unit class (`VekturDrumAudioUnit`) is written once.
- The **extension** vends it to other apps.
- The **standalone app** registers the same class in-process (`AUAudioUnit.registerSubclass`), loads it into `AVAudioEngine` through `AVAudioUnit.instantiate`, and connects it to the output.

So the app, the plug-in, automation, parameter smoothing and MIDI all run through one code path, and AUv3 behaviour is tested every time the app runs.

**App Group** (`group.<your-team-prefix>.vekturdrum`). User kits and imported samples live in the shared container, so a kit saved in the app appears in the plug-in inside a DAW, and the other way round. Factory kits are bundled with the libraries.

---

## 2. Modules and their contracts

```
 SwiftUI views ──► view models (@Observable, @MainActor)
                       │  only through ▼
              DrumEngineControl (protocol)          VekturDrumCore: DrumProject, Kit, Step, Pattern,
                       │                            ParameterID/Spec, KitLibrary, SampleLibrary, ProjectStore
              DrumEngine (Swift wrapper)
                       │  C API: vd_engine.h
              ┌────────┴──────────────────────────────────────────────┐
  [main]      │ vd_engine_set_param  ──► atomic targets ──┐            │
  [main]      │ vd_engine_send       ──► SpscRing<vd_command> ──┐      │
  [main]      │ vd_engine_set_sample ──► pointer hand-off  ─────┤      │
  [audio]     │ vd_engine_render ◄── AU render block: events, musical context, transport
  [main]      │ vd_engine_read_telemetry ◄── SeqlockSnapshot<vd_telemetry>
  [main]      │ vd_engine_pop_recorded   ◄── SpscRing<vd_recorded_hit>
              └───────────────────────────────────────── VekturDrumDSP (C++) ┘
```

| Module | Language | Owns | Must never |
|---|---|---|---|
| **VekturDrumDSP** | C++17 behind a C header | voices (analogue, sample, FM in Stage 7), sequencer, effects, mixer, clock follow, command and telemetry plumbing | allocate, lock, log, do I/O or call Swift on the audio thread |
| **VekturDrumCore** | Swift | the music: `DrumProject`, kits, parameter specs, persistence, sample library, Vektur Pulse kit import | import AVFoundation or touch audio threads |
| **VekturDrumAudio** | Swift | `DrumEngine`, `VekturDrumAudioUnit`, the standalone host (session, interruptions, routes), CoreMIDI | hold music state of its own: it mirrors the model |
| **App / AU view** | SwiftUI | presentation state only (selected track and step, edit mode, panels) | contain DSP or timing |

Files written in this stage:
- `native/Sources/VekturDrumDSP/include/vd_engine.h`: the C contract, with every call marked by the thread it may run on.
- `native/Sources/VekturDrumDSP/realtime.hpp`: a wait-free command ring and a torn-read-proof telemetry snapshot. **Tested:** 5 million items across two threads, and 300,000+ snapshot reads with none torn. ThreadSanitizer is clean on the ring.
- `native/Sources/VekturDrumDSP/vd_sample.cpp`: sample buffers, built off the audio thread.
- `native/Sources/VekturDrumCore/Parameters.swift` + `ParameterSpec+Pulse.swift`: addresses, plus the spec table generated from Vektur Pulse's table (`tools/gen_param_spec.py`).
- `native/Sources/VekturDrumCore/Model.swift`, `Persistence.swift`: the model and library contracts.
- `native/Sources/VekturDrumAudio/EngineInterfaces.swift`: what the UI talks to.
- `native/Tests/VekturDrumCoreTests`: Swift tests that the layout matches the C header and the Pulse table.

**Verification status.** The C/C++ parts compile clean (`-Wall -Wextra -Werror`, C11 and C++17) and their tests pass. **The Swift files have not been compiled:** there is no Swift toolchain in my workspace. The first Xcode build is the check, and I expect small fixes there.

---

## 3. Parameters

Addresses are permanent (`vd_engine.h`), because hosts save automation by address:

| Range | Holds |
|---|---|
| 0–255 | master: Vektur Pulse's 11 master params in their original order |
| 1024 + t × 256 + i | track t |
| i 0–14 | Vektur Pulse's track params in their original order, so Pulse kits import 1:1 |
| i 32–34 | **NEW:** engine, choke group, MIDI note |
| i 64–191 | **NEW** in Stage 7: FM |

**What the AU parameter tree exposes** (`AUParameterTree`):
- Master params, plus tracks 1–9 with their automatable params. Mute and solo are included; model, engine and MIDI note are exposed as indexed params.
- The tree always contains all 9 tracks, whatever the project's track count. Hosts dislike parameter trees that change shape; hidden tracks simply do nothing.
- Storage capacity is 16, so going beyond 9 later only adds addresses.

**Smoothing.** Continuous params are smoothed in the engine (Vektur Pulse: one-pole, 10 ms, at control rate), so automation from a host is declicked exactly like a knob.

---

## 4. Clock and transport

The sequencer stays **sample-accurate inside render**, as in Vektur Pulse. Each render call receives a `vd_render_context`:

| Where it runs | Beat source | Transport |
|---|---|---|
| Standalone | internal clock at `DrumProject.tempo` | PLAY / STOP |
| AUv3 in a host | `musicalContextBlock` (tempo, beat position) → `host_beat` | `transportStateBlock` → PLAY / STOP follow the host (setting: *Follow host transport*, default on) |
| Standalone + external MIDI clock | **NEW, planned:** clock ticks → beat estimate | MIDI start / stop / continue |

The engine's existing *host beat correction* (snap when more than ¼ beat off, otherwise ease in) is the shared mechanism for all three. In a host with its transport stopped, the pads and MIDI still play the sounds.

---

## 5. AUv3 in v1: what it changes

- **State** (full design and host test plan: **`docs/STATE.md`**). `fullState` holds the song as `vektur-drum-state` v1, the same format as the app and web, with samples embedded up to 32 MB. Saves capture REC'd steps and automation values. Restores are atomic (`vd_engine_load_sequence`) and thread-safe (`AUStateKeeper`).
  - If a referenced sample is missing (for example a song moved to another device), the track falls back to its analogue model and the UI says which sample is missing. It never fails silently.
  - Kit browsing (`factoryPresets`, `userPresets`) maps onto `Kit`.
- **MIDI in.** It arrives as sample-stamped render events, so incoming notes are sample-accurate and REC quantises exactly as now.
- **Memory.** The extension has a tight memory budget, especially on iPhone, and the exact limit has to be measured on a device. Worst case is 9 stereo samples × 30 s × 48 kHz ≈ 100 MB, which is too much.
  - Instances of the same extension in one host share a process, so the decoded-sample cache is process-wide and reference-counted by hash.
  - The 30-second cap per sample stays.
  - Stage 9 will measure this on the oldest supported iPhone.
- **View.** An `AUViewController` hosts the SwiftUI interface, which adapts from a small plug-in window to full screen (`supportedViewConfigurations`, plus a compact layout below about 500 pt height).
- **Real-time rule.** The render block captures only the C engine pointer and pre-fetched blocks: no Swift objects, no `self` access, no allocation. This is the most common AUv3 failure, so it is enforced by code review and by an allocation check in the tests.

**Two AUv3 features to decide on.** Neither exists in Vektur Pulse; both would be **NEW**. The architecture allows both without rework (`VD_MAX_BUSES`, events out of render).
1. **Multiple outputs:** main + one stereo bus per track, so each drum gets its own mixer channel in AUM or Logic.
2. **MIDI output:** the sequencer's notes go to the host, so patterns can be recorded or used to drive other instruments.

---

## 6. Universal interface (iPhone and iPad)

**iPad, and any regular-width space** (iPad full screen, Stage Manager, a large AU window):
- The Vektur VJ panel layout, as extracted: transport, display, patterns, master; the full sequencer grid (6–9 rows); then pads, sound, step and effects.

**iPhone, and compact width** (iPhone portrait, small AU windows). Four tabs, built from the same views:
- **Seq:** the selected track's 16 steps (2 rows of 8) plus a track strip.
- **Pads:** 3 × 3 pads, so 9 tracks fit.
- **Sound:** sound, step and FM controls.
- **Mix/FX.**

**iPhone landscape:** the full grid, with the track strip collapsed.

**Shared components**, drawn to match the extracted CSS:
- `Knob`: Canvas-drawn, 270° sweep, value arc (bipolar from the centre), drag up/down, double-tap to default, VoiceOver adjustable.
- `LEDStepButton`, `Pad` (velocity from touch position, as in Vektur Pulse), `OLEDDisplay`.
- Design tokens: graphite chassis, aluminium top strip, amber LED `#ffb23d`, accent `#ff7a2e`, cyan `#3dd6ff`.

**Performance:**
- The step grid redraws a row only when its data changes.
- The playhead and LEDs are a separate overlay driven by `TimelineView(.animation)` while the panel is visible. It reads one telemetry snapshot per frame, and nothing runs while hidden.

---

## 7. Stage 4 next: core extraction

1. Port `Drums.h` into `VekturDrumDSP` behind `vd_engine.h` (scaled to `VD_TRACK_CAPACITY`, with commands replacing the JS message switch).
2. Build a **parity harness**: the same scripted scenes rendered by the extracted JS engine (Node) and the C++ engine, compared sample by sample.
3. Fix the two bugs found in the audit, then confirm parity again with each fix isolated:
   - per-step crush, sends and chance lost on reload → already fixed in the model;
   - the 96 kHz Rate bug → treat top-of-range Rate as off.

**Waiting on:** `Drums.h` from the Vektur VJ repo. Without it, Stage 4 would port the JS instead, and parity with Vektur VJ's iPad engine could not be checked.

## 8. Open items

| Item | Needed for |
|---|---|
| ~~`Drums.h` and tools~~ Received 2026-11-20 and used | done |
| ~~Bundle prefix, AU codes~~ From Vektur VJ's repo: `com.dreammusictemple.vekturdrum` (app), `.au` (extension), manufacturer `DMTp`, type `aumu`, subtype `vkdr` (proposed), app group `group.com.dreammusictemple.vekturdrum`. Team ID: set in Xcode | Stage 5 |
| Multiple outputs and MIDI output in v1? | Stage 5 |

---

## 9. Stage 4 — core extraction: done (2026-11-20)

The C++ engine is complete behind `vd_engine.h`:

| File | What |
|---|---|
| `VekturDrumDSP/DrumEngine.hpp` | The engine: `Drums.h` (Vektur Pulse) + 9 tracks, engine select, sweep, choke groups, FM (fold, per-step ratio), glitch + 3 LFOs, 96 kHz fix |
| `VekturDrumDSP/vd_engine.cpp` | The C API: atomic parameters by stable address, a 2048-command ring, pointer-swap samples (with garbage collection), MIDI applied at its sample offset, host beat / tempo / transport, seqlock telemetry, REC ring |
| `VekturDrumDSP/vd_params.generated.h` | 286 parameters generated from `web/src/params.js` (`tools/gen_native_params.js`), which also writes the Swift specs |
| `VekturDrumAudio/DrumEngine.swift` | `DrumEngineControl` for the app: commands, samples, telemetry, REC, full resync from `DrumProject` |

**How it was proven** (`sh tests/run_native.sh`):
- **Strict parity.** An 84-second scripted performance of every feature, rendered through the C++ engine (via the C API only) and the web engine. With FM feedback off, **every sample matches within 1.5e-8**.
- **Full parity.** The same performance with FM feedback on matches within the measured chaos allowance. High-feedback FM is chaotic: V8's `Math.sin` and glibc's `sin` differ in the last bit for 3.3% of arguments, and a C++ build that injects that 1-ulp jitter diverges from itself just as much. Each FM ingredient alone (4 algorithms, fold, sweep, noise, feedback 0.5/1, per-step ratio) is bit-identical, and so is the metal-stretch glitch alone.
- **29 engine checks**, each run three times: normally, under AddressSanitizer + UBSan (no memory errors, no leaks), and under ThreadSanitizer (no data races with the main thread editing while the audio thread renders). They cover:
  - kicks on their beat to within 1 sample, and no drift over 5 minutes;
  - MIDI at its exact sample offset;
  - 9 tracks and track count, engines, choke groups;
  - REC and telemetry, host clock and transport;
  - 50 sample swaps while playing, stereo samples, the 96 kHz fix;
  - **zero heap allocations** in render, MIDI, telemetry and recording.
- **Cost:** with everything on (9 tracks, FM feedback, sample, delay, reverb, metal-stretch glitch, 3 LFOs), about 35× real time, roughly 3% of one desktop core. Device numbers come in Stage 9.

**Next: Stage 5.** The Xcode project (app + AUv3 extension, from Vektur VJ's `project.yml` pattern) and `VekturDrumAudioUnit` (render block from `VDRenderBlockFactory.mm`'s pattern). That is the first point where Swift is compiled, on your Mac.

## 10. NEW (0.6): Slicer, ring modulation, modulation matrix, banks

Everything below exists in the web engine (`web/src/engine.js`) and the C++ engine (`DrumEngine.hpp`), which render it
identically (`tests/native_parity`: the scenario now drives every Slicer action, hold pad, ring step and source; strict pass
within 1.5e-8). Every new feature is off by default, and off it changes nothing (tests).

**Signal path.** voices → ring modulation (per step) → mix / sends → delay, reverb → glitch → **Slicer** → warmth → level → DC.

**Modulation.** Once per control tick (16 samples): smoothing → the five sources (LFO 1–3, envelope follower, chaos) → `mv = sm`
→ wires add `amount × source` to the dial's **position** (normalised 0…1, log dials logarithmic), clamped to the dial's range →
the DSP reads `mv`. A wired source parameter (chaos → LFO rate) is read from the previous tick: no ordering loops. The LFOs still
drive their own glitch target with their Depth, as before. 32 wire slots; destinations are every continuous or ranged dial
(`modulatable` in the generated table; the C API refuses others). Telemetry carries the sources for the meters.

**Ring modulation.** A step with ring on starts a ring for the step's length: each slave track's voice output is
crossfaded (2 ms) toward `voice × carrier`, where the carrier is the master track's output divided by its own peak
envelope (so any master modulates fully; clamped ±1.5) or a sine oscillator. One ring at a time: the latest ring step wins.

**Slicer.** A 14 s stereo history (2 bars + a slice at 40 BPM) is written every sample before the Slicer. The cycle (1 or 2
bars) is cut into ≤ 32 slices of 1/32–1/4; slice boundaries follow the beat, so the Slicer locks to host tempo and position.
At each new slice the action comes from the program, thinned by Density and replaced by Evolve, with a per-cycle RNG seeded
from Seed and the cycle number (same seed = same variations, in every build). Hold overrides from the moment it changes.
Reads that would need audio not yet recorded (or overwritten) fall through. **Declick:** whenever the read position jumps
(new slice, stutter re-trigger, wet ↔ through), the output's jump is spread over 96 samples from what the previous read
would have played, so gates and stops never let a transient through.

**C API.** `vd_step` gained `ring_on / ring_master / ring_slaves / ring_amount / ring_hz`; new commands `VD_CMD_SET_WIRE`
(`vd_mod_wire`: source, stable parameter address, amount) and `VD_CMD_SET_SLICE`; `vd_sequence` carries the Slicer program
and the wires, so a restored song swaps in atomically with them; `vd_telemetry` adds `mod_source[5]`, `slicer_slice`,
`slicer_action`. Master addresses: Slicer 80–91, envelope follower 96–99, chaos 104–105 (`gen_native_params.js`).

**Swift.** `Step` ring fields (tolerant decoding of older steps), `SlicerSlot` / `SlicerAction`, `ModWire` / `ModSource`,
`DrumProject.slicer / wires`, `Kit.slicer / wires`, `StateCodec` v2, `AUStateKeeper` loads them in the sequence hand-off,
`DrumEngine` commands and telemetry, `KitBank` + `FileKitBankStore` (20 × 99, App Group), `UserManual` (generated).
Tests: `native/Tests/VekturDrumCoreTests/SlicerModStateTests.swift` (needs Xcode).

**Not yet:** the SwiftUI screens (Stage 8) — the Slicer window, ring popup, MOD drawer with drag and drop and the bank
browser are specified by the web app's UI (`web/src/slicer-panel.js`, `mod-panel.js`, `presets.js`).

## 11. NEW (0.7): fold, EQ, tape, dial lights, genre kits

**Signal path.** voice → step crush → **step fold** → **track EQ** → ring → mix / sends → delay, reverb → glitch → Slicer →
**tape & vinyl** → warmth → level → DC.

- **Step fold** (step field 15; `vd_step.fold`): `y += (sin(y·(1+8f)·π/2) − y)·f` — continuous from 0; ratchet repeats keep it.
- **Track EQ** (track-local addresses 40–47): low shelf · peak · peak · high shelf, RBJ biquads (Q 1, shelf slope 1), TDF-II,
  coefficients at control rate. A band at exactly 0 dB is skipped (bit-identical when unused); its state resets when it comes
  back on. All 8 dials per track are modulatable, like every continuous dial.
- **Tape & vinyl** (master 112–114): a ≤ 20 ms modulated delay (wow 0.55 Hz sine + slow random drift, ≤ 8 ms; flutter 6.8 + 11.3 Hz,
  ≤ 1.2 ms; zero delay = straight through), then crackle (Poisson, ≤ 180/s, 0.25 ms decay, stereo spread) and filtered hiss.
  While on, the engine never sleeps (dust crackles in silence).
- **Dial lights:** telemetry carries every modulated dial (`mod_param[]`, `mod_position[]` = 0…1 of its travel). The web UI
  lights a dot on the dial's rim in the source's colour; the LFOs' own glitch targets are drawn from the LFO values.
- **Factory kits:** 58, defined once in `web/src/factory*.js` (the 40 genre kits grown from a seed by genre rules) and exported by
  `tools/gen_factory.mjs` to `VekturDrumCore/Resources/FactoryKits.json`, read by `FactoryKits.load()` through `StateCodec`.
- **Parity:** the scenario adds folded and ratcheted steps, static and modulated EQ, wow, flutter and dust: strict pass 3e-8.
  CPU with everything on (9 EQs, tape, Slicer, 32 wires): about 4.2 % of one core.
- **MOD window** (web `mod-panel.js`): floats (move by its title bar, resize from its corner, A−/A+ scale, fold to a source-chip
  palette) or docks left / right; geometry is kept per device. It holds every source's settings, LFOs included.
- **Colours:** `web/src/appearance.js` — 13 themes plus custom LED, display and dial-arc colours, 6 chassis tones and 4 top strips,
  applied as CSS variables. `tools/gen_manual.js` writes the same table to `VekturDrumCore/Appearance+Generated.swift`.

## 12. NEW (0.8): TEMPER, HUMANISE, step pitch shift + spectral, reverb types, insert effect, pads window

Signal path per sample (web/src/engine.js `render`, native DrumEngine.hpp `render` — line for line, strict parity ≤ 1e-6):

```
voice → [step pitch shift] → [step spectral] → EQ → ring → level/pan ─┬─ mix ───────────────┐
                                                                      ├─ delay send ─ delay ┤
insert input (AUv3 effect / web audio input) × in.level ──────────────┼─ reverb send ─ Room | Spring | Gate | Expanse
                                                                      ┘                     ↓
                                     glitch → Slicer → tape → TEMPER (bypassed at 0) → level → DC block → soft clip
```

* **TEMPER** (`dr.temper`, address 2, replaces Warmth): one stereo-linked stage — fast/slow envelope transient shaper
  (rounds attacks warm, sharpens them cold, ∝ t²), a 5 kHz one-pole split (top softened ≤ −4.4 dB warm / lifted ≤ +4 dB
  cold), warm: Warmth's asymmetric tanh at a gentler drive; cold: a hard knee above 0.85 and, past 75 %, a faint odd-order
  edge on the top band. Per-sample smoothing (5 ms); at 0 the stage is skipped entirely (state re-seeded when it wakes, so
  no click). No FFT, no oversampling, no buffers. Cost: ~0.1 % of a core.
* **HUMANISE** (`dr.human`): in the sequencer, never in the pattern. When a step's time is computed, an offset is drawn
  (triangular, its own xorshift PRNG; max 0.18·h^2.2 beats, never more than 42 % of a step; the first step of a pattern
  only lags, so no event can fall outside its pattern, and steps can never swap or merge). From 50 %, a free step next
  to a written hit can play a ghost (velocity 22–40 % of its neighbour, through `trigger` → mute/solo/choke/engine/routing
  all apply, never `record`); above 75 % some ghosts become doubles/triples through the ratchet slots. At 0 no random
  number is drawn and the offsets stay exactly 0 (bit-identical render).
* **Step pitch shift**: 4096-sample ring per track, two taps over a 30 ms window with sin² crossfades. **Spectral**: STFT
  256/hop 64 (Hann, 75 % overlap), dry delayed to match, six colour zones (Smear, Shift, Harmonic, Robot, Whisper, Freeze)
  whose position inside the zone is that manipulation's own setting. Both live per track; a tail counter keeps them running
  after the voice ends.
* **Reverbs**: Room (Vektur Pulse's), Spring (2 × 16 dispersive allpasses in a loop), Gate (dense room + hold), Expanse
  (8-line FDN, Householder-style mix, RT60 1.5–12 s, 90–95 % → 60 s with deeper modulation, 95–100 % → feedback 1, input 0:
  freeze). Expanse coefficients are computed at control rate (identical results, 8 fewer pow() per sample).
* **Insert input**: `vd_render_context.input_left/right` (native), `render(L, R, n, inL, inR)` (web). AUv3 components:
  docs/AUV3.md.
* **Kits**: factory-more.js (INIT + 30), grown from seeds like the other genre kits; kits may carry `bpm`.
* **UI**: pads-window.js (floating, resizable, full-screen pads; layout follows the window's shape); shaded zones
  (`z-ctl`, `z-seq`, `z-play`, `z-snd`, `z-step`, `z-mod`, `z-fx` + the dark effects column) composed over any theme via `--zt`.

## 13. NEW (0.8.2): EXPORT

* **Web**: export.js renders in a fresh engine (`drumsMakeEngine`) fed the same drum-protocol messages as the live
  worklet (`Drums.op`, collected through `DRUM_TAP`), so nothing you hear is disturbed. Plan: CHAIN on (and set) → the
  chain once, else the selected pattern once; RING OUT continues with the transport stopped until 0.5 s below −80 dBFS
  (≤ 30 s). Stems: one render per playing, unmuted track with the others muted; padded to the longest. Encoders:
  encoders.js (WAV 16/24/32f, FLAC 16/24 with fixed predictors + Rice + mid/side, MP3 MPEG-1 Layer III CBR with a LAME
  Info tag for gapless decoding, stored ZIP). Files go through `vdSaveFile` (the artifact viewer's downloads capability,
  audio inside a .zip there; a normal download elsewhere).
* **Native**: `vd_engine_offline_length` / `vd_engine_render_offline` (vd_engine.h) — the same loop as the web's;
  `vd_encode` (vd_encode.h / vd_encode.cpp, tables in vd_mp3_tables.h) — a port of encoders.js whose WAV, FLAC and MP3
  output is byte-identical to the web's (tests/native_encode); Swift `Exporter` loads the song into a dedicated engine
  through `AUStateKeeper.loadForOffline`, renders, encodes, writes files (stems into a folder).
* MP3 tables are the ISO 11172-3 Huffman tables (B.7) and synthesis window (B.3); analysis window = synthesis / 32.

## 14. NEW (0.9): 12 tracks, the vintage sampler, BREAK LAB, generators

* **12 tracks** everywhere: `DRUM_TRACKS` / `VDG_TRACKS` / `VD_TRACKS_MAX` = 12, MIDI notes 36 38 42 46 39 45 37 56 49 50 51 54,
  the ring's oscillator at master 12 (`RING_OSC`, `VD_RING_OSCILLATOR`; files before v6 migrate 9 → 12), slave masks 12 bits,
  telemetry and the pattern array sized from `kT`. The UI shows 4 × 3 pads above nine tracks.
* **Step layout** (web `step[]`, C++ `step[p][t][s][kSF]`, kSF = 25): … 16–20 shift + spectral, **21 Metalise** (−1 = slice / track),
  **22 slice** (0 = the track's), **23 reverse chance**, **24 stutter chance**. Fields 16–24 travel as `nx` (9 values) to the
  trigger and ratchets. Wire: `'s'` 25–28 / `'P'` = [bars, Slicer, 12 × (len, div, 16 × 25)]; native `vd_step_fx` + `VD_CMD_SET_STEP_FX`.
* **METALISE** (per track, `t*.metal`; after the voice, before RESAMPLE, pitch shift, spectral and EQ): fast / slow envelope transient
  detector → transient-dependent tanh drive → pre-emphasis (0.65 a) → phase-accumulator rate reduction (2^−2.2a) with linear →
  sample-and-hold interpolation → quantisation to 16 − 9a bits with a converter curve → de-emphasis → two combs (1.13 / 1.71 ms) →
  soft clip above 0.9. The amount latches per hit (step ≥ 0, else slice ≥ 0, else the live dial) and glides over 2 ms; at 0 the
  processor is off (not a sample touched). The master **Character** (`gl.metal`) runs the same processor on the metal-stretch wet signal.
* **RESAMPLE** (per track): input saturation → emphasis → RBJ anti-alias low-pass (none for drop-sample models) → phase-accumulator
  decimation with sub-sample timing → quantisation, converter curve, noise → reconstruction (hold, linear, drop-sample) → one-pole
  output filter → de-emphasis → wet mix (0 at 0 %, full from 50 %). Rate and bits move from transparent at 0 to the model's at 50 % and
  lower above. Transient modes act on a no-lookahead detector: PRESERVE blends dry by the transient, ROUND lowers the output filter,
  CRUSH lowers rate and bits during attacks, REBUILD ramps the wet back in over 8 ms after each onset.
* **Slices**: the app prepares a buffer per track (each slice cut, WSOLA-stretched — attack kept for 12 ms — for its Stretch × the
  tune mode, joined) and a table of 11 floats per slice; the engine (`setSample(t, d, rate, table)`, native `vd_sample_set_slices`)
  plays slice k with its gain, pan, pitch (added to the voice), attack ramp, gate with a 6 ms release, reverse (flipped by the step's
  reverse chance, its own PRNG drawn only when the chance is > 0), and stutter (repeats of the first L samples with 1 ms edges, or 2–3
  × 1/32 by the stutter chance). Preparation is main-thread work (web: slices.js; native: vd_slice.cpp, identical outputs).
* **Analysis** (slices.js / vd_slice.cpp): STFT 1024 / 256, log-magnitude flux (+50 % below 560 Hz) + energy rise, normalised,
  adaptive median threshold (sensitivity), local maxima at least the minimum spacing apart (the stronger wins), each moved back to
  the steepest rise of a 32-sample envelope less 2 ms; a loud start adds a mark at 0. Classes from the first 60 ms (low / high band
  energy ratios and loudness against the loudest hit). Tempo: onset-curve autocorrelation 70–190 BPM, octave from the project tempo
  when it clearly points to one (else the faster pulse of a busy break), snapped to whole bars of the loop.
* **Each pattern's Slicer**: `patSl[p]` (−1 follow, 0 off, 1 on) decides `cSlOn` at control rate; op `'B'`, `VD_CMD_SET_PATTERN_SLICER`,
  `vd_pattern.slicer`.
* **Generators** (web breaklab.js / songgen.js, Swift Generators.swift — the same xorshift32, so a seed gives the same result): the
  groove generator starts from where the break's slices fall on a 16-step bar and mutates by class; the song generator writes 8
  parts and an arrangement for seven genres. MIDI export: SMF type 1, 96 PPQ.
* **Resampling** renders the track offline in a separate engine (`exportRender`, the stem path), so there is no feedback path; the
  result becomes a new library sample and the track's Metalise / Resample are reset so nothing is applied twice.
* **Real time**: nothing allocates in render (C++ test with an allocation counter: 12 tracks × METALISE + RESAMPLE + slices + the master
  character ≈ 9 % of one core at 48 kHz on the build machine); buffers and tables reach the audio thread by pointer hand-off.


## 15. NEW (0.9.1): hold to modulate, LFO Draw, LONG, Metalise chance, undo, relative hit classes

- **Parameters.** `long` (track local 56), `gl.chance` (master 38), `gl.chdiv` (39); `lfoN.shape` gains 5 = Draw. The
  generator marks `gl.on` modulatable: wires apply to any parameter and a non-smooth one is rounded (JS `Math.round`, C++
  `jsRound`), so a wired switch flips above the middle.
- **Engine (web = C++).** LONG multiplies Decay by 20 (clamped 0.01…60 s; a sample at ≥ 59 s plays to its end). LFO shape 5
  reads `lfoTab[3][16]` with linear interpolation, set by op `'D'` / `VD_CMD_SET_LFO_POINTS` (≤ 8 points a command, so the
  command stays small). Metalise chance: while ON and `gl.chance > 0`, each division (`GL_CHB` = ¼, ½, 1, 4 beats) draws one
  number from its own RNG (`glrng`) and gates the effect through the existing fade; chance 0 draws nothing, so old songs are
  bit-identical. Strict parity scenario §18 covers all of it.
- **Classification.** `sxClassifyAll` / `vd_slice_classify_all` judge all hits together: per hit the low share (2-pole
  150 Hz LP), high share (2-pole 6 kHz HP) and peak over ≤ 50 ms; brightness ln((high+1e-3)/(low+1e-3)) split by a
  three-level Otsu, groups closer than ln 2.5 merged; darkest = kick (if low ≥ 0.15), brightest = hat (if high ≥ 0.05), the
  rest snare, or ghost under 0.3 × the loudest. Fewer than two groups falls back to the single-hit rule.
- **Undo.** `undo.js`: snapshots of the project state (as saved, without the writer) 450 ms after the last change, 60 deep,
  applied without stopping the transport; Ctrl/⌘-Z, Shift-Ctrl/⌘-Z, Ctrl-Y. The native app keeps the same model
  (`DrumProject` is a value type) — the Xcode UI layer owns its UndoManager (Stage 5).
- **UI (web; the SwiftUI app follows in Stage 5).** `MODLP`: a 550 ms hold on any `[data-mod-key]` opens `modPopup`
  (sources, depth, INV, ✕, and CHANCE for `gl.on`); `lfoDrawEditor`; Slicer PATTERNS row (op `'B'`); step designs
  (`PREFS.steps`, body classes); `drumAbbrev` for sample names; logo (`logo.js`, WebP data URIs).
