# Vektur Drum — native UI parity audit and restoration plan

Date: 2026-11-28. Reference: the web app 0.9.1 (`web/src/panel.js` and the window modules), plus the reference pack in `design/ui-reference/`.
Rule for all work: **the web version is the blueprint.** No creative UI changes; any change proposed for native goes to Dream Music Temple for approval first.

## 1. What is on GitHub today: two different native UIs

| Branch | Native UI | Verdict |
|---|---|---|
| `native/prepare-swift-package` (earlier ChatGPT work) | `VekturDrum/ios/Shared/DrumSequencerView.swift`, 125 lines: a generic SwiftUI screen. It uses `NavigationStack` with a "Sequencer" title, `.borderedProminent` orange/grey buttons, system fonts, a "NATIVE AUDIO READY" caption, a plain 8-pattern row, a plain step grid and one large PLAY/STOP button. | **Diverged.** It has no web layout, no top strip, no dials, no DISPLAY, MASTER, PERFORMANCE, SOUND, STEP, EFFECTS, EQ or TAPE section, and no windows. It invents a navigation bar and a status caption. Its engine package also predates 0.9.1: 135 parameters are missing, including LONG. **Do not ship or merge this UI.** |
| `native-testflight` (PR #1, current) | `app/Shared/Panel/*`: a section-by-section copy of the web panel, using the web's CSS values (rem scale, grids, gaps, colours, zone tints, LED bars), the Interstellar dial ported from `POT_DRAW.interstellar`, and the step keys. | **On the right track, but incomplete.** See §3. No TestFlight build has been sent from this branch yet. |

Any native build you have seen on a device came from the first branch, because nothing has been uploaded from PR #1.

Reusable from the earlier branch: `FileLibraryServices.swift` (App Group sample and kit library). It is UI-free storage code, and worth bringing across when PRESETS and BREAK LAB are ported.

## 2. Control-type check (rule 2)

- **PR #1 contains no stock iOS controls.** There is no `Slider`, `Picker`, `Menu`, `Toggle`, `Stepper`, `TextField`, `TabView`, `NavigationStack`, `.sheet` or `.popover` anywhere in `app/`.
- **Dials:**
  - Every web dial is a custom rotary `KnobCell` + `InterstellarDial`.
  - Gestures are the web's: vertical drag, 160 pt for the full range, and double-tap to reset.
- **No rotary control has been replaced by a slider.**
- **Added UI:** none. The only native-only element is the undo/redo arrow glyphs, which use the system font, because Avenir Next lacks ↶ ↷.

## 3. Screen-by-screen checklist

Status key: ✅ matches · 🟡 built, refinement left · 🔌 drawn but not yet wired to the engine · ❌ not built yet.

"Tiles off" is the measured share of 24 pt tiles that still differ visibly from the web render. It is checked automatically by CI on every push, at 5 device sizes.

### Main panel — top area

| Section | Web reference | Native status | Discrepancies / missing | Restoration | Verified |
|---|---|---|---|---|---|
| Top strip: logo, name, subtitle, TRACKS 6–12, preset name, undo/redo, ON/OFF, PRESETS, SLICER, MOD, BREAK LAB, GENERATE, EXPORT, SETTINGS | panel.js 296–318 | 🟡 layout · 🔌 | Preset-name label not shown. Undo/redo and the 7 window buttons are not wired, because the windows are not built yet. TRACKS and ON/OFF work. | P1: wire each button as its window lands | CI parity |
| TRANSPORT (PLAY, STOP, REC) | 322–327 | ✅ wired | — | — | CI + manual |
| DISPLAY (OLED: pattern, step, tempo, track, live lines) | 328, `paintOled` | 🟡 | The live telemetry lines need checking against `paintOled` in every state. | P3 | partial |
| PATTERN: 8 keys, LOOP/CHAIN; PATTERN n with COPY/PASTE/CLEAR/SLICER; BARS; CHAIN row | 330–351 | 🟡 · 🔌 | Selecting a pattern works. COPY, PASTE, CLEAR, the SLICER mode, BARS and the CHAIN chips and drag are not wired. The row is a few pt right of the web. | P1 wiring, P3 offset | CI parity |
| MASTER (Tempo, Swing, Temper, Human, Level) | 352–355 | ✅ wired | — | — | CI parity |
| SEQUENCER: name, M, S, 16 steps, LENGTH −/+, DIV, EDIT | 356–384 | 🟡 · 🔌 | Steps, M, S and track select work. LENGTH ±, the DIV dropdown and EDIT are not wired. Fine alignment of the name button and LENGTH is in progress. Long-press on a step (Metalise/Chance automation) is missing. | P1 wiring, P2 long-press, P3 alignment | CI parity |

### Main panel — lower area

| Section | Web reference | Native status | Discrepancies / missing | Restoration | Verified |
|---|---|---|---|---|---|
| PERFORMANCE: 6–12 pads (4×3 above 9), velocity by height, ⤢ expand, note | 388–406 | ❌ | Not built | P1 | — |
| SOUND: per-track engine, FM or sample voice dials, sample load, LONG | `renderDrumSound` | ❌ | Not built | P1 | — |
| STEP: per-step velocity, ratchet, probability and so on | `renderDrumStep`, 598+ | ❌ | Not built | P1 | — |
| EFFECTS: Delay division dropdown, Feedback, D.Tone, Reverb type dropdown, Rev Size, Damping, PING-PONG, MIDI channel dropdown | 408–422 | ❌ | Not built | P1 | — |
| EQ (track, above TAPE) | 581+ | ❌ | Not built | P1 | — |
| TAPE (Wow, Flutter, Dust) | 425–429 | ❌ | Not built | P1 | — |
| LFO row: 3 LFOs, shapes, SYNC, LFO Draw | glitch-panel.js `renderGlitch` | ❌ | Not built | P1 | — |
| Hold-to-modulate popup (every dial) | dials.js / mod-panel.js | ❌ | Not built | P2 | — |

### Windows

All of these are ❌ not built. The source module is given in brackets.

- **PRESETS** (presets.js): factory and user kits, banks, rename, export, import, clear. Priority P1.
- **SLICER + METALISE** (slicer-panel.js, glitch-panel.js): patterns 1–8, MIRROR, NEW SEED, CLEAR, METALISE. Priority P1.
- **MOD** (mod-panel.js): the matrix, drag sources onto dials, INV, T, SYNC, COPY TO TRACK, CLEAR ALL. Priority P1.
- **BREAK LAB** (breaklab.js): transients, slices, per-slice edits, GENERATE 16, LOCK KICK, TO STEPS, EXPORT MIDI and so on. Priority P1.
- **GENERATE** (songgen.js): genres, NEW SEED. Priority P1.
- **EXPORT** (export.js): master and stems as WAV, FLAC or MP3. Priority P1.
- **SETTINGS** (settings.js), with its tabs:
  - AUDIO & POWER, APPEARANCE, PROJECT, MIDI, PARAMETERS & CC, MANUAL, ABOUT. Priority P1.
- **Pads window** (pads-window.js): drag, resize, pads grow with the window. Priority P2.

### Appearance variants

All of these are web features with no native port yet:

- **Dial designs:** only Interstellar is ported; the other 10 are ❌. Priority P2.
- **Step designs**, including the 2 new ones in 0.9.1. Priority P2.
- **Themes:** these need a check for each theme. Priority P3.

## 4. Points where native iOS cannot copy the web literally (for your decision)

These need your approval before I implement a workaround (rule 3/8):

1. **Dropdowns** (DIV, Delay division, Reverb type, MIDI channel, and others).
   - The web uses HTML `<select>`, and Safari on iPad shows the system pop-up list when it is tapped.
   - **Proposal:** draw the closed box exactly as the web does. When tapped, open a custom list drawn in the panel style, at the same spot.
   - The alternative is the iOS system pop-up list, which is what Safari shows.
2. **File import and export** (samples, kits, banks, WAV/FLAC/MP3).
   - The web's file picker on iOS is already the system document picker.
   - **Proposal:** use the same system document picker natively. Nothing on screen changes.
3. **SETTINGS → AUDIO & POWER.** Sample rate and latency map to the iOS audio session, and "keep screen awake" maps to the iOS idle timer.
   - The controls stay identical.
   - Some web options may not exist on a given device, for example a sample rate the hardware refuses. Those would show as unavailable rather than being hidden.
4. **Fonts.** Chakra Petch is approximated with Avenir Next and SF Mono, as already agreed. It can be embedded later if its licence allows.

## 5. Restoration plan (in order)

1. **P1 — wire everything that is already drawn,** so that no button is a dead placeholder. Each control goes through the existing `DrumController` → `DrumEngine` command path or the parameter tree. Nothing touches the audio thread. In order:
   - COPY / PASTE / CLEAR;
   - BARS and CHAIN;
   - LENGTH ± and DIV;
   - EDIT;
   - undo/redo.
2. **P1 — build the lower area as on the web,** in this column order: PERFORMANCE | SOUND | STEP | EFFECTS + EQ + TAPE, then the LFO row.
   - Each section gets added to the CI parity render and scored against the web before moving on.
3. **P1 — the windows,** in the top-strip order:
   - PRESETS, SLICER, MOD, BREAK LAB, GENERATE, EXPORT, SETTINGS (all tabs).
   - The parity harness gets one web/native render pair per window.
4. **P2:**
   - long-press automation on steps;
   - hold-to-modulate on every dial;
   - LFO Draw;
   - the pads window;
   - the other 10 dial designs and the step designs.
5. **P3/P4:**
   - close the remaining pixel gaps (iPhone portrait first, currently 18.6 %);
   - the themes;
   - touch feel.
6. **Then the first TestFlight build** from PR #1.

**Verification at each step:**

- **CI:** the Swift unit tests, the strict DSP parity test (≤ 1e-6 against the web engine), and the simulator build and launch. The visual diff report is pushed to the `ui-renders` branch.

Current main-panel scores, from `ui-renders`, `REPORT.md`:

| Size | Tiles off | Mean abs diff |
|---|---|---|
| iPad 13" landscape | 2.5 % | 5.12 |
| iPad 11" landscape | 2.6 % | 5.36 |
| iPad 11" portrait | 4.3 % | 6.29 |
| iPhone landscape | 3.5 % | 6.21 |
| iPhone portrait | 18.6 % | 12.70 |

## 6. Files that will change

- `app/Shared/Panel/MainPanel.swift`: wiring, and the lower sections, which may be split into `Performance.swift`, `Sound.swift`, `Step.swift`, `Effects.swift` and `LfoRow.swift`.
- `app/Shared/Panel/Dial.swift`: the other dial designs and hold-to-modulate.
- New `app/Shared/Windows/*.swift`: one file per window.
- `app/Shared/DrumController.swift`: actions for the above, forwarding to the existing engine commands and parameters.
- `app/VekturDrum/ReferenceRender.swift`, `tools/ui_parity_web.mjs`, `tools/ui_parity_diff.py`: render and score each new section and window.
- **Not changed:** `native/Sources/VekturDrumDSP` (C++ DSP). `VekturDrumAudio` changes only if a command is missing.
