# Vektur Drum 0.8 — completion report

Every task in the 0.8 request and the TEMPER / HUMANISE / audit specification, implemented in the web app and the native
engine (C++, Swift model, AUv3 unit), tested, reviewed. Tests were run on Linux (Node 22, headless Chrome, g++ 13 with
Address/UB/Thread sanitizers). The Swift targets have still never been compiled (there is no Swift toolchain here), so the
first Xcode build will need small fixes.

## 1. Features completed

| Feature | Web | Native |
|---|---|---|
| **TEMPER**: global bipolar macro (−100 % WARM, 0 NEUTRAL, +100 % COLD). Replaces Warmth, and at neutral the stage is bypassed | ✓ | ✓ C++ (strict parity), Swift param, AU readout |
| **HUMANISE**: 0–100 %. Timing first; ghost notes from 50 %; embellishments from 75 % | ✓ | ✓ C++ (strict parity) |
| Per-step **pitch shifter** (Shift, Mix) and **spectral** (Spectral, Colour, Mix) on any engine | ✓ | ✓ C++, C API `vd_step_fx`, Swift `Step` |
| Reverb types **Room, Spring, Gate, Expanse**. Expanse makes evolving washes at 90–95 % and approaches freeze at 95–100 % | ✓ | ✓ C++ |
| **Insert input**: the AUv3 effect *Vektur Drum FX* (`aufx`/`aumf`). In the web app it is an audio input | ✓ | ✓ C++ `input_left/right`, `VekturDrumAudioUnit` |
| **INIT** blank kit, plus 10 80s Electro, 10 Breakbeat and 10 Ambient kits, each with its own tempo | ✓ | ✓ FactoryKits.json (89), `Kit.tempo`, `FactoryKits.initKit` |
| 10 extra **dial designs** (6 from Vektur Vocal, 4 from Vektur Vortex) | ✓ | style list via Appearance generator; SwiftUI drawing is still to come with the views |
| **Pads window** (⤢): movable and resizable, with a full-screen mode. The pads grow with the window and can be played several at once | ✓ | (SwiftUI views are not in the repo yet; the behaviour is specified in the manual) |
| **Shaded sections**: effects get their own dark grey area, and every other kind of section gets its own grey tint. Works over every theme | ✓ | (as above) |
| Manual (19 sections, single source) | ✓ | ✓ generated Manual+Generated.swift, docs/MANUAL.md |

## 2. Files modified / added

* **Web**:
  * engine.js: TEMPER, HUMANISE and the step effects. Reverbs and input were finished earlier; this round moved Expanse to control rate and removed per-sample allocations.
  * params.js: `dr.temper` and `dr.human`.
  * presets.js: Warmth migration, INIT, kit tempo.
  * panel.js: TEMPER/HUMANISE dials and readouts, zones, ⤢.
  * NEW pads-window.js and NEW factory-more.js.
  * factory*.js: Warmth→TEMPER.
  * state.js: v5, CC migration.
  * settings.js: CC map migration, CC 16 = HUMANISE, version 0.8.
  * glitch-panel.js: zones.
  * appearance.js: zone tint over themes.
  * manual.js.
  * tools/build_web.py.
* **Native C++**:
  * DrumEngine.hpp: everything above, with FFT tables identical to the web version.
  * include/vd_engine.h: `VD_MP_TEMPER/REVERB_TYPE/HUMANISE/INPUT_*`, `vd_step_fx`, `VD_CMD_SET_STEP_FX`, `steps_fx`, render input.
  * vd_engine.cpp.
  * vd_params.generated.h (385 params).
* **Swift**:
  * Model.swift: Step fields, `Kit.tempo`, `isInit`.
  * Parameters.swift.
  * StateFile.swift: v5 and migration.
  * FactoryKits.swift.
  * DrumEngine.swift.
  * AUStateKeeper.swift.
  * NEW VekturDrumAudioUnit.swift (instrument + insert effect).
  * Generated: ParameterSpec, Manual, Resources/FactoryKits.json.
* **Tests**:
  * features.test.js: +52 checks (TEMPER, HUMANISE).
  * parity.test.js: Warmth comparison.
  * state.test.mjs: migration.
  * kits.test.mjs: INIT, new categories, tempos.
  * native test_engine.cpp: 3 new suites.
  * test_realtime.cpp: flake fixed.
  * native_parity: scenario §16, input, step FX.
  * run_native.sh: now fails loudly.
  * Swift SlicerModStateTests.
* **Docs**: README, ARCHITECTURE §12, STATE.md (v5), MANUAL.md, NEW AUV3.md, this report.

## 3. How TEMPER works

TEMPER is one light stereo-linked stage at the end of the master chain:

```
… → tape → TEMPER → level → DC block → soft clip
```

It does not use FFT, convolution, oversampling, multiband splitting or large buffers.

* **Neutral (|t| < 1e-4)**: the stage is skipped, so not a single sample is touched.
  * Verified: the render is bit-identical to an engine that never had the parameter, and to Vektur Pulse with Warmth 0 (all 14 parity scenes are identical).
  * When TEMPER moves off zero, its filter and envelopes are re-seeded from the current sample, and the amount ramps in over 5 ms. Moving it causes no clicks (tested by sweeping ±1 on a sine).
* **Transients**: a fast envelope (0.5 ms attack) is compared with a slow one (12 ms attack, 80 ms release).
  * Warm rounds attacks by up to 30 %; cold sharpens them by up to 35 %.
  * The effect grows with t², so it is subtle near the centre.
* **Top end**: a 5 kHz one-pole split.
  * Warm softens the top by up to −4.4 dB.
  * Cold lifts it by up to +4 dB.
* **Warm colour**: Warmth's own asymmetric tanh (even harmonics), at a gentler drive (1 + 2.5|t| instead of 1 + 5w).
  * THD at −6 dBFS, full warm: 14.6 %. The 2nd harmonic is 4.5 % of the fundamental.
  * The test measures crest factor 3.23 → 2.29.
* **Cold**: clean below 0.85, with a hard knee above it. THD at −6 dBFS is 0.1 %.
  * Past 75 %, a faint odd-order edge on the top band gives the metallic quality. It is not a bitcrusher.
  * The test measures crest factor 3.23 → 3.65.
* **Measured direction**: HF ratio goes 0.059 (warm) < 0.075 < 0.092 (neutral) < 0.127 < 0.180 (cold).
  * Loudness change is the same at 44.1, 48 and 96 kHz (within 4 %).
  * No DC (≤ 4e-4 before the existing blocker). Mono stays mono, and no left/right bleed.
* **Cost**: about 0.04–0.1 % of one core natively. Neutral costs nothing.

## 4. HUMANISE at 0 / 25 / 50 / 75 / 100 %

All figures are at 120 BPM, 16ths, measured by tests/features.test.js.

| Setting | Mean \|offset\| | Max offset | Ghost notes per 32 bars | What you hear |
|---|---|---|---|---|
| 0 % | 0 (bit-identical, no random draws) | 0 | 0 | the sequencer as written |
| 25 % | 1.4 ms | ≈ 4 ms | 0 | felt more than heard |
| 50 % | 6.6 ms | ≈ 20 ms | 0 | relaxed, clearly human |
| 60 % | — | — | 17 | ghosts begin |
| 75 % | 15.8 ms | 46 ms (≈ 1/32 = 62 ms) | 70 | obviously loose, frequent ghosts |
| 100 % | 16.8 ms | 49 ms (capped at 42 % of a step) | 283, plus 58 quick doubles/triples | busy but still the same groove |

At 100 %, 448 written hits become 731 played hits.

Rules that hold at every setting:

* Offsets are drawn from a triangular distribution with HUMANISE's own xorshift PRNG.
* The first step of a pattern only lags, so pattern boundaries and chaining stay exact.
  * Every written hit, ratchets included, plays exactly once per pass. This was checked over 23 chained bars at 0, 50 and 100 %.
* Steps never swap or merge, even at 1/32 and 200 BPM.
* There is no drift: a mean signed offset of +2.8 ms comes only from first-step lag and does not accumulate.
* Ghosts reach 22–40 % of the neighbouring hit's velocity. They go through `trigger`, so mute, solo, choke, engine and routing all apply.
* Ghosts never touch the pattern data or the REC queue (tested).

## 5. DSP / CPU decisions

* **Single TEMPER stage at the master.** Placing it per track would cost 9× and add nothing for a macro.
  * The old Warmth stage was evolved into TEMPER, not duplicated. There is one control, at the same address (2).
* **HUMANISE in the scheduler**: one `pow` and two PRNG draws per step, and nothing per sample.
  * At 0 the guard `cHum > 0 || hOff[t] != 0` is the only cost.
* **Expanse coefficients** (eight `pow` per sample before) moved to control rate. The output is bit-identical, because their inputs only change at control rate.
* **JS hot paths no longer allocate**:
  * an array literal in Expanse,
  * a closure in the pitch shifter.
* **Native allocations**: none while rendering with every 0.8 feature on. The allocation counter and ASan/TSan verify this.
* **Native CPU** (Linux, 48 kHz, one core, -O2):
  * The 0.7 everything-on scene: 3.9 %.
  * The 0.8 worst case: ≈ 10 %. That case is pitch shift + spectral on every other step of 9 tracks, with an Expanse wash, HUMANISE 100 %, TEMPER, insert input, Slicer, glitch and tape.
  * TEMPER + HUMANISE on a groove: +0.04 %.
* **Latency**: 0. The spectral window (256 samples) is aligned dry-to-wet inside the track, and only on steps that use it.

## 6. Compatibility and migration

**State v5.** It reads v1–v4, the web autosave, Vektur VJ sets and Vektur Pulse kits. These are migrated by key:

| Old item | Migrated to |
|---|---|
| Warmth `w` | TEMPER `−w`. The same amount on the warm side: same colour, slightly gentler, softer top. The parity test measures a 2.2 % residual at the old default 0.25 |
| A CC mapped to Warmth | TEMPER |
| A wire on Warmth (amount `a`) | TEMPER, amount `−a/2`: the same direction and depth over TEMPER's longer travel |
| Missing TEMPER / HUMANISE | neutral / off |
| Factory kits | converted at the source, so their random seeds and patterns are unchanged |

These paths were checked:

* factory kits, user kits and banks (`presetCleanP`);
* project load and the v4→v5 state test;
* import/export (same cleaner);
* INIT;
* defaults and reset;
* MIDI CC (prefs and state);
* native parameter generation (`gen_native_params.js` → C++ and Swift);
* the Swift StateCodec (encode/decode, v4 files, CC and wire migration; XCTest added).

**Native ABI.**

* `vd_step` is unchanged.
* The new step values travel in `vd_step_fx` (`VD_CMD_SET_STEP_FX`, and `steps_fx` in sequences), so a command still fits in 64 bytes. The static assert caught this.
* `VD_MP_WARMTH` is renamed `VD_MP_TEMPER`, at the same address with a new range.
* Host automation recorded on Warmth plays back on TEMPER's positive (cold) half. This is the one behaviour change: hosts store automation as values, not by key.

## 7. Tests run and results

**Web:**

| Suite | Result |
|---|---|
| features | 193 / 193 (52 new) |
| engine | 53 / 53 |
| parity vs Vektur Pulse | 14 / 14 (12 identical, 2 Warmth↔TEMPER near) |
| state | 21 / 21 (4 new migration checks) |
| kits | 89 / 89 (INIT blank and silent; Electro −21…−17 dB, Breakbeat −28…−20 dB, Ambient −32…−28 dB RMS) |
| UI smoke | no page errors |

**Native** (`sh tests/run_native.sh`):

| Check | Result |
|---|---|
| C11 header | passes |
| `-Werror` build | passes |
| realtime | passes |
| engine | 95 / 95 (16 new) |
| ASan + UBSan | 95 / 95 |
| TSan | 95 / 95 |
| C++ ↔ web parity, 197 s scenario including §16 | OK |
| strict parity (no FM feedback) | every sample within 1e-6 (max 1.5e-8) |

The §16 parity section covers TEMPER sweeps, HUMANISE 30/70/100 %, every spectral colour with pitch shift and ratchets, Spring, Gate, Expanse wash and freeze, and the insert input through Spring and the Slicer with drums off.

**Swift** (XCTest written, not run here): v5 round trip, Warmth migration, INIT, 89 kits, new manual sections.

Spectral and pitch-shifter tests from the earlier 0.8 work all still pass, natively too.

## 8. Code audit — confirmed issues fixed

| # | Class | Issue | Fix |
|---|---|---|---|
| 1 | Confirmed bug (tests) | `tests/run_native.sh` hid failures. A failed compile in `cc … && ./test` or a failing test behind `\| tail` let the script carry on. It hid a real static-assert failure this round | an `ok` helper that stops on any failure |
| 2 | Confirmed bug (tests) | The seqlock test in test_realtime.cpp failed about 1 run in 30 when the writer thread started after the reader finished | wait for the first publish; 40/40 runs pass |
| 3 | Confirmed bug (tests) | A Swift test asserted the state version was `2` (the codec wrote 3) | uses `StateFile.version` |
| 4 | Confirmed bug (ABI) | 0.8's step fields made `vd_command` 76 bytes, over the 64-byte cache-line contract | `vd_step_fx` + `VD_CMD_SET_STEP_FX` |
| 5 | Performance | The Expanse reverb allocated an 8-element array every sample in JS, which causes GC pressure in the AudioWorklet | constant table |
| 6 | Performance | The pitch shifter created a closure every sample in JS | method |
| 7 | Performance | Expanse ran 8 `pow` per sample (web and native) | control rate, identical output |
| 8 | Cosmetic | A comment was misplaced in the engine constructor | moved |

## 9. Remaining issues and risks

| Class | Item |
|---|---|
| Potential risk | **Swift is uncompiled.** VekturDrumAudioUnit, the Step/Kit/StateFile changes and the tests have never been through a Swift compiler. Expect small fixes at the first Xcode build: imported C struct initialisers, `AURenderEvent` field names, `AUHostTransportStateFlags`. |
| Potential risk | **Automation moves.** Host automation lanes recorded on Warmth (0…1) play on TEMPER's 0…+1 (cold) half. Saved songs and kits migrate correctly; host-side lanes cannot be rewritten. |
| Potential risk | **The native UI does not exist yet.** The SwiftUI layer (dials, pads window, zones, TEMPER/HUMANISE controls) is not in this repository, so the web UI and the manual are its specification. Dial designs: the style list is shared; drawing them is SwiftUI work. |
| Cosmetic | The web's TAPE section shows the effects shading inside the first column. It is an effect, so this is deliberate. |
| Cosmetic | The UI smoke script `ui3` still clicks the Dock button, which was removed earlier. |

## 10. AUv3 port concerns

* **The effect instance** (`aufx` `vkfx`) starts with DRUMS OFF and input at unity. A restored song can turn the drums on.
* **Tail time** is set to 60 s because Expanse washes ring that long. Some hosts cut tails shorter; freeze holds until the size drops below 95 %.
* **Insert input**: mono or stereo input, stereo out (`channelCapabilities [2,2, 1,1, 1,2]`).
  * Input and output must share a sample rate (checked in `allocateRenderResources`).
  * In-place processing is supported.
* **MIDI to the effect**: only the `aumf` variant receives it. Hosts differ on which they offer.
* **The spectral step effect** adds 256 samples inside its own track only, so it reports no plug-in latency. A purist might ask for a latency report when no steps use it; it is not needed.
* **Real-time safety**: the render block captures only C pointers and preallocated scratch.
  * Hosts that call `fullState` during render are safe: AUStateKeeper never locks on the audio thread.
* **To check on device**: CPU at 64-frame buffers on older iPads with many spectral steps (≈10 % of a desktop core in the worst case natively). Expanse + 9 spectral tracks is the heaviest case.

---
## Addendum — 0.8.1 / 0.8.2

* **Metalise** (the glitch's metal-stretch mode) moved to the Slicer window, right of the Stutter dial; the main screen's
  Glitch section was removed; the LFOs' destinations read Metal mix / grain / stretch. Keys (`gl.*`) unchanged; kits that
  used the old Stutter / Reverse glitch keep playing it and say so.
* **Chain** on the BARS row as coloured chips: drag to reorder, × to remove, tap to edit, drag pattern buttons in.
* **Section titles** larger, bolder, with an accent bar.
* **EXPORT** master / stems — WAV, FLAC, MP3; chain or selected pattern; ring-out or cut; web and native.

Tests added:

| Suite | Result |
|---|---|
| tests/export.test.mjs | 25 / 25 |
| native test_engine (offline length, ring-out, cut = ring-out up to the end, stems sum to the master, no allocations) | 103 / 103, also under ASan/UBSan and TSan |
| C++ ↔ web encoders (tests/native_encode) | 14 / 14: WAV, FLAC **and MP3 byte-identical** |

The export suite covers every encoder decoded back with ffmpeg:
* WAV and FLAC are exact at their depth.
* MP3 SNR is 31 / 38 / 50 dB at 128 / 192 / 320 kbps on a test mix.
* Decoded files have the exact sample count.

It also checks:
* chain vs pattern length;
* that ring-out stops at silence;
* that stems sum to the master within −82 dB;
* that the song is untouched.

Every earlier suite still passes (strict parity ≤ 1e-6).

Known limits:

* The MP3 encoder uses no psychoacoustic model and no bit reservoir: one global gain per frame, CBR. It is fine at 256–320 kbps and serviceable at 128.
* Apple platforms have no system MP3 encoder, which is why the native app ships its own.
* In the Claude artifact viewer, downloads accept only certain extensions, so audio files arrive inside a .zip there.
