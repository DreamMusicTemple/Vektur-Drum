# Vektur Drum: handover for building the native iOS app

Inspection date: 27 Nov 2026. Source inspected: `VekturDrum-0.9.1.zip`. No files were changed.

## 0. What is in the repository

`github.com/DreamMusicTemple/Vektur-Drum` (one commit, `543d91c`) contains three things:

| Path | What it is |
|---|---|
| `VekturDrum-0.9.1.zip` | The whole project: web app, native code, tests, tools, docs. Byte-identical to the 0.9.1 delivery (sha256 `ce49e258…`). |
| `index.html` | The built web app (`web/dist/index.html`). |
| `.github/workflows/jekyll-docker.yml` | A stock Jekyll Pages workflow. It has nothing to do with the app. |

The source code itself is **not in the repo as files**; it is only inside the zip. First step: unzip it and commit the tree, so that diffs and reviews work.

```sh
unzip VekturDrum-0.9.1.zip && git add VekturDrum/
```

Suggested `.gitignore` entries: `.build/`, `*.xcarchive`, `DerivedData/`, `node_modules/`, `xcuserdata/`.

All paths below are relative to `VekturDrum/`.

```
native/Package.swift                    Swift package "VekturDrumKit" (swift-tools 5.9, iOS 17, macOS 14)
native/Sources/VekturDrumDSP/           C++17 engine behind a C API (include/vd_engine.h, vd_slice.h, vd_encode.h)
native/Sources/VekturDrumCore/          Swift model, parameter specs, state codec, factory kits, generators, manual, themes
native/Sources/VekturDrumCore/Resources/FactoryKits.json   89 kits (1.3 MB)
native/Sources/VekturDrumAudio/         Swift engine wrapper, AUAudioUnit subclass, state keeper, sample prep, exporter
native/Tests/VekturDrumCoreTests/       XCTest (3 files)
native/Tests/dsp/                       C++ engine tests (run on Linux/macOS with tests/run_native.sh)
web/src/                                The reference app (the UI to mirror natively: panel.js, mod-panel.js, breaklab.js …)
docs/ARCHITECTURE.md, AUV3.md, STATE.md, MANUAL.md, AUDIT-0.9.1.md
tools/gen_native_params.js, gen_manual.js, gen_factory.mjs   Generators. Never hand-edit *.generated.* / +Generated.swift.
```

## 1. Intended native architecture (docs/ARCHITECTURE.md §1–2)

- **Platform:** iOS/iPadOS 17 minimum, universal (iPhone and iPad). The AUv3 ships in version 1.
- **Xcode targets:**
  1. **Vektur Drum**: the SwiftUI app. It is also the container for the extension.
  2. **Vektur Drum AU**: an AUv3 app extension.
  3. **VekturDrumKit**: the local Swift package. Both targets link its three libraries.
- **One engine, two hosts.** `VekturDrumAudioUnit` (an AUAudioUnit subclass) is written once.
  - The extension vends it to other apps.
  - The standalone app registers the same class in-process (`AUAudioUnit.registerSubclass`), instantiates it with `AVAudioUnit.instantiate`, and connects it inside an `AVAudioEngine` to the output.
- **Three AU components** (docs/AUV3.md), all served by the same class, which reads `componentType`:

  | Type | Subtype | Manufacturer | What it is |
  |---|---|---|---|
  | `aumu` | `vkdr` | `DMTp` | instrument |
  | `aufx` | `vkfx` | `DMTp` | insert effect |
  | `aumf` | `vkfm` | `DMTp` | music effect |

- **Layering:**
  - SwiftUI → `@Observable @MainActor` view models
  - → `DrumEngineControl` (implemented by `DrumEngine`)
  - → C API `vd_engine.h`
  - → C++ `DrumEngine.hpp`

  The render thread touches only the C engine pointer and preallocated buffers.
- **Shared data:** an App Group (`group.<team>.vekturdrum`) holds user kits, banks (`Kits/Banks/NN.json`) and imported samples (`Samples/`). App and plug-in share the same library.
- **Song format:** `StateCodec` (JSON `vektur-drum-state` v6, identical to the web app's). It is used for:
  - documents
  - `AUAudioUnit.fullState` (through `AUStateKeeper`)
  - the factory kits

## 2. Does a SwiftUI app entry point and interface exist?

**No.**

- There is no `@main` and no `App` type. Nothing imports SwiftUI or UIKit.
- There are no views, no view models and no asset catalog.
- The interface exists only as the web reference (`web/src/*.js`). Native screens were always planned as "Stage 5 (Xcode)".

These protocols are declared but **not implemented anywhere**:

| Protocol | File | Needed for |
|---|---|---|
| `StandaloneAudioHosting` | VekturDrumAudio/EngineInterfaces.swift | AVAudioSession, AVAudioEngine, registerSubclass, interruptions, route changes |
| `MIDIInputDelegate` | EngineInterfaces.swift | CoreMIDI input in the app |
| `SampleLibrary` | VekturDrumCore/Persistence.swift | import, decode (WAV/FLAC/AIFF/CAF, ≤ 60 s), App Group storage, embed/restore |
| `KitLibrary` | Persistence.swift | factory + user kits, import/export. `FileKitBankStore` (banks) **is** implemented. |
| `ProjectStore`, `LibraryLocation` | Persistence.swift | documents, App Group URLs |

Generated data the UI can use directly:
- `UserManual.sections` (Manual+Generated.swift)
- `AppearanceTheme.all` / `.chassis` / `.strips` / `.dialStyles` / `.defaultDialStyle` ("interstellar") / `.stepStyles` (Appearance+Generated.swift)
- `ParameterSpec.track` / `.master` / `.trackDefaults`, `DrumLists` (ParameterSpec+Generated.swift)
- `FactoryKits.load()`, `GrooveGenerator`, `SongGenerator`, `MIDIFileExport`

## 3. Are the AUv3 app and extension targets implemented?

**The audio unit class is written. The targets are not.**

**Present** (Swift, never compiled):
- `VekturDrumAudio/VekturDrumAudioUnit.swift` (182 lines). It contains:
  - buses: stereo out, plus stereo or mono in for the effect types
  - the full `AUParameterTree`: 12 tracks × track set + master, at stable addresses; custom strings for TEMPER and HUMANISE
  - `fullState` / `fullStateForDocument` through `AUStateKeeper`
  - an `internalRenderBlock` handling MIDI and parameter-ramp events, host tempo/beat/transport, the effect's pull-input, and the in-place output convention
- `AUStateKeeper.swift`: thread-safe song save and restore. It embeds samples up to 32 MB, caches encoded bytes, and restores atomically through `vd_engine_load_sequence`.
- `docs/AUV3.md`: the exact `AudioComponents` Info.plist array for all three components.

**Missing:**
- the app extension target (Info.plist, entitlements)
- an `AUViewController` that conforms to `AUAudioUnitFactory` and returns `VekturDrumAudioUnit(componentDescription:)`
- the plug-in UI
- `factoryPresets` / `currentPreset` (described only in a comment at the top of AUStateKeeper.swift)
- a `SampleLibrary` passed to the keeper (see §5, B4)

## 4. What is missing for an Xcode project that archives for TestFlight

1. **Project.**
   - Create `VekturDrum.xcodeproj` (iOS App template, SwiftUI, Swift; Xcode 15.3+ or 16). Suggested place: the repo root next to `native/`.
   - Add a local package dependency on `native/` (Add Package Dependencies → Add Local…).
   - Link `VekturDrumCore`, `VekturDrumAudio` and `VekturDrumDSP` to **both** the app and the extension.
   - The package's resource bundle (FactoryKits.json) is copied into each automatically.
   - (Optional, reproducible alternative: an XcodeGen `project.yml`.)
2. **App target "Vektur Drum".**
   - iOS 17.0, iPhone + iPad, bundle ID e.g. `com.dreammusictemple.vekturdrum`, version `0.9.1`, build `1`
   - `@main` App with a root view
   - a `StandaloneAudioHost` implementing `StandaloneAudioHosting`
   - `UIBackgroundModes` = `audio`
   - App Group entitlement
   - AppIcon: **provided** in `design/AppIcon.appiconset` (also sent as `VekturDrum-AppIcon.zip`). Replace the target's `Assets.xcassets/AppIcon.appiconset` with it (single-size 1024 × 1024, universal, opaque sRGB; Xcode generates the smaller sizes; the extension uses the app's icon)
   - `ITSAppUsesNonExemptEncryption` = NO
   - (`NSMicrophoneUsageDescription` only if the standalone app will take audio input)
3. **Extension target "Vektur Drum AU".** Use the iOS Audio Unit Extension template, or a generic app extension.
   - Bundle ID `com.dreammusictemple.vekturdrum.au`
   - `NSExtensionPointIdentifier` = `com.apple.AudioUnit-UI`
   - Principal class: the `AUViewController` subclass conforming to `AUAudioUnitFactory`
   - `AudioComponents`: copy from docs/AUV3.md. Change `version` to **2305** (0x901 = 0.9.1); the doc still says 2304.
   - same App Group entitlement
   - embedded in the app
4. **Implementations** the targets need: `SampleLibrary` (AVAudioFile can decode WAV/AIFF/CAF/FLAC on iOS), `KitLibrary`, `ProjectStore`, CoreMIDI input, and the SwiftUI screens (mirror `web/src/panel.js` and the other panels).
5. **Signing:** Apple Developer team, automatic signing, App Group created in the developer portal, an App Store Connect app record.
6. **Archive** (Mac):
   ```sh
   xcodebuild -project VekturDrum.xcodeproj -scheme "Vektur Drum" -configuration Release \
     -destination 'generic/platform=iOS' -archivePath build/VekturDrum.xcarchive archive
   xcodebuild -exportArchive -archivePath build/VekturDrum.xcarchive \
     -exportOptionsPlist ExportOptions.plist -exportPath build/export
   ```
   `ExportOptions.plist` needs `method` = `app-store-connect` (`app-store` on older Xcode) and `teamID`. Or use Product → Archive, then Organizer → Distribute → TestFlight.

## 5. Known compiler errors and architecture problems

The Swift code has **never been compiled**: no Swift toolchain was available where it was written. The C/C++ is fully compiled and tested (§7). Below is a line-by-line review.

### A. Compile errors and blockers

| # | File : line | Problem | Fix (additive, behaviour unchanged) |
|---|---|---|---|
| A1 | `VekturDrumCore/FactoryKits.swift:31` | `public static func load(bundle: Bundle = .module)`: `Bundle.module` is internal (SwiftPM-generated), so a public default argument can't reference it. | See §6. |
| A2 | `VekturDrumCore/Persistence.swift:70` | `public struct DecodedSample` has no public init. The memberwise init is internal, so an app-side `SampleLibrary` can't construct one. | Add `public init(channels: [[Float]], sampleRate: Double) { self.channels = channels; self.sampleRate = sampleRate }` |
| A3 | (expected) | Other first-build fixes in the never-compiled Swift. The typical suspects were checked and look correct: memberwise initialisers used across modules (TransientMark, SlicerSlot, SampleSlices, ModWire, SliceSettings, KitBank and MIDICCAssignment all have public inits); C struct field names and types against `vd_engine.h`; AU render-event API names. | Fix whatever the compiler reports, one at a time. **Don't change any DSP, address or format value while doing so.** |
| A4 | build settings | Keep both app targets in the **Swift 5 language mode** at first. Strict concurrency in Swift 6 mode will flag: `Task.detached` capturing `OpaquePointer` (AUStateKeeper.swift:220), the non-Sendable `onRestored` closure, and static tuple arrays. The package (tools 5.9) already builds in Swift 5 mode. | Leave as is; tighten later. |

### B. Runtime and architecture problems (fix before TestFlight)

| # | File | Problem | Safest fix |
|---|---|---|---|
| B1 | `VekturDrumAudioUnit.swift:112–130` | `internalRenderBlock` force-unwraps `midiScratch` and `outputScratch`, which are only created in `allocateRenderResources`. That method also **deallocates and reallocates** `midiScratch`, while the render block it already handed out keeps the old pointer. Consequences: (1) a crash if a host reads `renderBlock` before allocating; (2) use-after-free after the second allocate (sample-rate or route change); (3) overflow if the host raises `maximumFramesToRender` above the captured buffers' capacity. | Allocate `midiScratch`, `busScratch`, and in/out scratch buffers of a fixed maximum capacity (e.g. 4096, or the largest allowed) **once in `init`**, and free them only in `deinit`. Clamp `maximumFramesToRender` to that maximum. In the block, return `kAudioUnitErr_TooManyFramesToProcess` if `frameCount` exceeds capacity. Rendering itself is unchanged. |
| B2 | `AUStateKeeper.apply` (line 211) + `DrumEngine.send` | `vd_engine_send` is a **single-producer** queue (vd_engine.h, THREADS). The keeper sends LFO-shape commands from whichever thread the host calls `fullState`/`applyKit` on, while the UI's `DrumEngine` sends from the main thread. Two producers on one engine is a race. (Parameters, `load_sequence` and `set_sample` are safe from any thread.) | Put one lock around every `vd_engine_send` for a given engine, shared by `DrumEngine` and `AUStateKeeper` (it is never taken on the audio thread). Alternatively, give the keeper's `sendLfoShapes` the same `DispatchQueue.main` hop the UI uses. |
| B3 | AU + keeper | `vd_engine_collect_garbage` is never called inside the plug-in, so replaced samples are never freed. Only `DrumEngine.collectGarbage()` calls it, and only if a UI drives it. | Call it from a main-thread timer (about 1 Hz) owned by the AU (or its view controller) and the standalone host, plus once after each restore. |
| B4 | `VekturDrumAudioUnit.swift:51` | `AUStateKeeper(engine: e, library: nil)`: with no library the plug-in never loads samples, and samples embedded in a host song are dropped. | Pass the App-Group `SampleLibrary` once it exists. |
| B5 | `AUStateKeeper.loadSamples` | Starts one detached task per track for every restore. Two quick restores can race, so an older sample could land last. | Tag each restore with a generation number and skip stale results. |
| B6 | docs | The `vd_engine.h` header comment mentions `vd_engine_sync_begin…_end`, which doesn't exist. docs/AUV3.md has version 2304 (0.9.0). | Documentation only. |

## 6. Safest correction for the `Bundle.module` error (A1)

Replace the defaulted public function with two overloads. Existing call sites (`FactoryKits.load()` in SlicerModStateTests.swift:74, and future app code) compile unchanged, and so does `load(bundle:)`. The body is not touched.

```swift
// native/Sources/VekturDrumCore/FactoryKits.swift
    /// All factory kits, in browser order, from this package's bundled FactoryKits.json.
    public static func load() -> [Kit] { load(bundle: .module) }   // .module is internal: used inside the module only

    /// All factory kits from FactoryKits.json in `bundle`. Empty if the resource is missing (never crashes the host).
    public static func load(bundle: Bundle) -> [Kit] {
        // … existing body, unchanged …
    }
```

Do **not** do either of these:
- make `Bundle.module` public (it is generated, so you can't)
- move FactoryKits.json into the app bundle (the extension needs it too, and the package already carries it to both)

`Bundle.module` resolves correctly in both the app and the appex when the package is linked.

## 7. Readiness of DSP, samples, sequencing and FM

**Ready for integration (C/C++).** Re-verified today with `sh tests/run_native.sh`:
- `vd_engine.cpp`, `vd_sample.cpp`, `vd_encode.cpp` and `vd_slice.cpp` compile with **no warnings under gcc and clang** (`-Wall -Wextra`; vd_engine also with `-Werror`). The C headers pass a C11 `-Wpedantic` check.
- Engine tests: **146/146**, also clean under ASan + UBSan and under TSan.
- Real-time plumbing: SPSC command ring and seqlock telemetry.
- **Strict parity with the web engine: every sample within 1e-6** (max 1.49e-8).
- Encoders: WAV and FLAC byte-identical to the web's; MP3 decodes cleanly.
- `vd_slice` (transients, hit classes, tempo, stretch) matches `slices.js` (35/35).

Coverage:
- **Sequencing:** 8 patterns, 6–12 tracks, 16 steps with per-track length and division (polymeter), 1/2/4 bars, chain, swing, HUMANISE, ratchets, chance, REC, host clock follow.
- **Sound engines:** 8 analogue models, the sample engine (slices, reverse/stutter, tempo-lock stretch), FM percussion (algorithms, ratios, feedback, fold, noise), METALISE / RESAMPLE, ring mod.
- **Effects and modulation:** delay, 4 reverb types, Metalise glitch, Slicer, tape, TEMPER, 4-band EQ, 3 LFOs (including Draw), env follower, chaos, 32 mod wires, LONG decays up to 60 s.
- **Offline export:** master and stems.

**Written but not yet compiled (Swift):** `DrumEngine` (command and parameter wrapper), `EngineSamples` / `SampleAnalysis` (BREAK LAB analysis over `vd_slice`), `Exporter`, `AUStateKeeper`, `VekturDrumAudioUnit`, plus all of VekturDrumCore (model, `StateCodec` v6, generators). These are thin and follow the C API closely. Expect only small compile fixes, apart from items A1–A2 and B1–B5.

**Not started:** all native UI, the standalone audio host, CoreMIDI, the library implementations and the extension target (§2–4).

## 8. Order of work, and rules to keep

1. Unzip and commit the tree (§0). Apply **A1** and **A2** only.
2. On a Mac: `cd native && swift build && swift test`. macOS 14 is a declared platform, so the Core tests run without a device. Fix compile errors one at a time, minimally.
3. **Any time a C/C++ file or a generated table is touched:** run `sh tests/run_native.sh` from the repo root (needs a C++17 compiler and Node). It must finish with `strict parity OK`. Better still, avoid touching C++ at all; none of the fixes above needs it.
4. Create the Xcode project and both targets (§4). Get an empty SwiftUI screen playing the default kit through `StandaloneAudioHost`, using `VekturDrumAudioUnit` in-process.
5. Fix **B1–B4** before the first TestFlight build. Then build out the UI against `web/src/` as the spec.

**Don't:**
- edit generated files by hand (`vd_params.generated.h`, `ParameterSpec+Generated.swift`, `Manual+Generated.swift`, `Appearance+Generated.swift`, `FactoryKits.json`). Change the web source and run the generator in `tools/` instead.
- change parameter addresses: hosts store automation by them.
- change the AU type, subtype or manufacturer codes.
- change the state format.
- use a WebView.
- use hardware manufacturer names or trademarks anywhere.

## 9. UI requirement: an exact copy of the web app

**Decision by the owner: the native interface copies the web app exactly.** The web app (`web/src/`, built as
`web/dist/index.html`) is the specification for every screen: layout, sizes, colours, typography, labels, wording, order of
controls, states, animations and gestures. It is not a starting point for a "native iOS look". Where this section and an iOS
habit disagree, this section wins. Nothing may be added, dropped, renamed, regrouped or restyled; a change to the design is
made in the web app first, then copied.

### 9.1 Reference package — `design/ui-reference/` (also sent as `VekturDrum-UI-reference.zip`)

Captured from the 0.9.1 web app with `tools/ui_reference.mjs` (commit it with the tree; re-run it after any web UI change:
`node tools/ui_reference.mjs ui-reference`). Touch is emulated, so the panel is scaled exactly as on an iPad.

| Folder | Contents |
|---|---|
| `ipad11-landscape/` (1194 × 834 pt, **master layout**, lossless) | 19 screens (list below) at 2× pixels |
| `ipad13-landscape/` (1366 × 1024), `ipad11-portrait/` (834 × 1194), `iphone-landscape/` (852 × 393), `iphone-portrait/` (393 × 852) | the same 19 screens — how the layout reflows; full-page (scrolling) captures |
| `variants/` | the main screen in all 11 dial designs, 3 step designs and 13 themes |
| `styles/*.json` | **for each screen at the master size: every visible element** — x, y, width, height (CSS px = iOS points), font (weight, size, family), letter spacing, text colour, background (colour or gradient), corner radius, border, shadow, padding, and its text. This is the measurement source; the pictures are the visual check. |
| `index.json` | the list of shots, sizes, dial / step / theme ids |

### 9.2 Screen inventory (each needs a native view that matches its picture and style file)

| # | Screen | Web source | Notes |
|---|---|---|---|
| 01 | Main panel (top strip, TRANSPORT, DISPLAY, PATTERN, MASTER, SEQUENCER, PERFORMANCE, SOUND, STEP, EFFECTS, EQ, TAPE, LFO 1–3) | `panel.js` (+ `style.css`) | the core screen; 6–12 track rows |
| 02 | Main with a kit and a selected step (STEP section filled) | `panel.js` `selectStep`, `renderDrumStep` | |
| 03 | Main with a sample track (SAMPLE engine, slices, short pad names) | `panel.js`, `samples.js`, `drumAbbrev` | |
| 04 | Presets / kit browser | `presets.js` | factory banks, user kits |
| 05 | Slicer window with PATTERNS row and METALISE | `slicer-panel.js`, `glitch-panel.js` | |
| 06 | MOD window (sources, 32 wires, LFO DRAW canvas) | `mod-panel.js` | |
| 07 | Hold-to-modulate pop-up | `mod-panel.js` `modPopup`, `MODLP` | 550 ms hold, cancels on 7 pt move |
| 08 | BREAK LAB | `breaklab.js`, `slices.js` | waveform, marks, slice pads, groove generator |
| 09 | GENERATE (song generator) | `songgen.js` | |
| 10 | EXPORT | `export.js` | |
| 11 | Pads window (large performance pads) | `pads-window.js` | |
| 12 | Ring-mod / step pop-up | `mod-panel.js` `openRing` | |
| 13–19 | SETTINGS: Audio, Appearance (themes, chassis, strips, dial and step designs), Project, MIDI, CC, Manual, About (logo) | `settings.js`, `appearance.js`, `manual.js` | |

Also copy everything these open (menus, confirm dialogs, toasts, tooltips → long-press labels) from the same files.

### 9.3 How to translate the web code

- **Units.** 1 CSS px = 1 iOS point. All sizes are `rem` of a root size `13 px × --scale` (`style.css` line 5). On touch
  screens ≥ 700 pt wide, `--scale = clamp(width / 1060, 1, 1.35)` (`host.js` `fitScale`); below 700 pt it is 1. Implement
  one `uiScale` the same way and multiply every rem value by `13 × uiScale`.
- **Styles.** The CSS lives in `web/src/style.css` **and in a CSS string inside each panel's .js file** (search for
  `` `.`` blocks / `style.textContent`). Copy every value literally: colours, gradients, radii, borders, shadows, padding,
  gaps, letter spacing, uppercase, opacity. Make them named constants in one `VDStyle.swift`, not ad-hoc numbers.
- **Themes.** Already generated into Swift: `AppearanceTheme.all / .chassis / .strips / .dialStyles / .stepStyles`. The web
  turns a theme into CSS variables in `appearance.js` `applyTheme()` (`--led`, `--ledlo`, `--cyan`, `--ice`, `--accent` …,
  using `mixHex`); port `applyTheme` and `mixHex` exactly into an observable `ThemeColors`.
- **Dials.** `dials.js` `dialPaint(k, t, c, bip)` draws each of the 11 dial designs on a canvas. Port each design to a
  SwiftUI `Canvas` line by line (same gradients, arcs, ticks, angles, glow). Default design: `interstellar`.
- **Step designs.** classic / glass / neon are CSS (`appearance.js`, body classes `steps-glass`, `steps-neon`, `color-mix`).
- **Knob gesture** (`helpers.js` `knobCtl`): vertical drag with the same sensitivity and behaviour as coded there, double-tap
  (< 300 ms) resets to default; `slider()` for horizontal sliders; hold-to-modulate on every `data-mod-key` control.
- **Responsive layout.** Reproduce the web's reflow at the same widths: `@media (max-width: 1050 / 760 / 700 / 640 / 560 px)`
  rules in the panel CSS (e.g. ≤ 1050: the top strip wraps and the subtitle hides). Use the measured width, not size classes,
  so iPad split view and the AUv3 window follow the same rules. iPhone portrait is one scrolling column (see
  `iphone-portrait/01-main`).
- **Typography.** The CSS asks for `"Chakra Petch", "Avenir Next", …` and the font is **not** embedded, so on iPad/iPhone
  Safari the app actually renders in **Avenir Next** (the reference pictures, captured on Linux, show a fallback face —
  trust `styles/*.json` sizes and weights, not the glyph shapes). Native: Avenir Next with weight 400 → Regular,
  500 → Medium, 600 → Demi Bold, 700 → Bold, 800/900 → Heavy; `ui-monospace` (readouts, OLED display) → SF Mono
  (`.system(.monospaced)`) at the same size and weight. If the owner later embeds Chakra Petch (SIL OFL) in the web app,
  bundle the same files natively.
- **Logo.** `web/src/logo.js` (`DMT_LOGO_96`, `DMT_LOGO_256`) / `web/assets/logo*.png|webp` → asset catalog images, same
  circular crop and sizes (top strip 1.9 rem; About as in screen 19).
- **Text.** Labels, button captions, units and number formats exactly as the web (`drumFmt` in `panel.js`, value strings in
  `params.js`). Manual text: `UserManual.sections` (generated).
- **AUv3 window.** The plug-in shows the same root view as the app; it reflows by width with the same rules.

### 9.4 Allowed differences (only these)

iOS file pickers / share sheets in place of browser file dialogs; safe-area insets; the status bar; haptics may be added
to taps that already exist. Everything else visible must match.

### 9.5 Acceptance — per screen, before it counts as done

1. Screenshot the native screen on the iPad 11" simulator (landscape, 1194 × 834) in the same state as the reference
   (load **Breakbeat Halo** for kit shots; BREAK LAB shots use an 8-beat break on track 4 as in `tools/ui_reference.mjs`).
2. Compare side by side and overlaid (50 % opacity) with `ipad11-landscape/<screen>.webp`: same elements, same order, same
   text; positions and sizes within ±1 pt of `styles/<screen>.json`; colours identical (theme Amber, default).
3. Repeat at iPad 13" landscape, iPad portrait, iPhone landscape and iPhone portrait against those folders.
4. Spot-check three themes and three dial designs against `variants/`.
5. Interaction check against the web app on the same iPad: knob drag and double-tap, hold-to-modulate, step hold, pads,
   BREAK LAB marks, LFO DRAW.

Report each screen as matched / not matched with the overlay image; a screen that does not match is not finished.
