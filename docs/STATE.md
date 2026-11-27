# Vektur Drum — State Saving (AUv3, app, web)

Saving the song reliably inside a host is a release requirement. A drum machine that comes back from a GarageBand, Cubasis or AUM project with a missing pattern, a reset knob or a lost sample has lost the user's work.

This document covers four things:
1. the single song format;
2. what the plug-in does in each situation a host creates;
3. how it is tested here;
4. the checklist to run in real hosts once the AUv3 builds (Stage 5).

---

## 1. One format: `vektur-drum-state` v6 (reads v1–v5)

The same JSON is used for:
- the plug-in's state inside a host (`AUAudioUnit.fullState`);
- the app's documents;
- project files;
- the web app's project files and autosave.

```jsonc
{
  "format": "vektur-drum-state", "version": 6, "writer": "Vektur Drum 0.9",
  "project": {
    "tempo": 172.5,                 // standalone clock (a host's tempo leads inside a DAW)
    "trackCount": 12, "selected": 3, "chain": [0, 3, 3, 1], "chainOn": true, "kit": "Jungle Metal Grain",
    "params": { "t1.model": 0, "t1.decay": 0.35, …, "gl.mix": 0.35, "sl.density": 0.8, "ch.rate": 0.5 },   // all 590, by key (v3 adds t1–9.eq1f…eq4g and tp.wow / tp.flutter / tp.dust; v6: 12 tracks, t*.metal … t*.smodel, gl.metal)
    "patterns": [ { "bars": 4, "slicer": 1, "tracks": [ { "len": 7, "div": 6,                 // slicer (v6): 1 on, 0 off, absent = follow SLICER
        "steps": [ null, [0.66, -0.4, 7, 3, 0.25, 0.5, 0.75, 0.6, 5.04], … ] }, … ] }, … ],   // 8 × 12 × 16
    "samples": [ null, { "key": "s8e1f…", "name": "Amen", "bpm": 170, "sens": 0.5, "gap": 50, "mode": 0, "div": 8, "grid": 2,
                         "marks": [[0, 0, 1, 0], [8471, 1, 1, 2], …],                              // v6: [frame, by hand, accepted, type 0 kick…4 other]
                         "slices": [ { "s": 0, "e": 8471, "p": 5, "r": 1, "stut": 3 }, … ] }, … ],   // v6: only non-default settings
    "slicer": [ [0, 0], [1, 1], [2, 2], [9, 12], … ],                                         // NEW v2: 32 × [action, permute source]
    "wires": [ { "source": "chaos", "param": "sl.density", "amount": -0.35 }, … ],             // NEW v2: ≤ 32; source lfo1|lfo2|lfo3|env|chaos
    "lfoShapes": [ [0, 0.383, 0.707, …16], […16], […16] ]                                     // NEW 0.9.1: LFO 1–3 Draw shapes, −1…1 (optional)
  },
  "midi": { "ccMap": { "t9.fmindex": { "cc": 71, "ch": 2 }, … } },
  "sampleData": [ { "key": "s8e1f…", "name": "Test Sine", "fmt": "wav", "data": "<base64>" } ]   // optional
}
```

A step is `[velocity, pan, pitch, ratchet, crush, delay send, reverb send, chance, FM ratio]`, and in v2 a ring-modulated step adds
`[1, ring master (0–8 track, 9 oscillator), slave mask (bit t = track t+1), amount, oscillator Hz]` — 14 values; in v3 a folded step adds the fold (0…1) as a 15th value (with the ring fields, ring off if unused); in v4 a step with a pitch
shift or spectral effect has 20 values: `… fold, shift semitones (−24…24), shift mix, spectral, colour, spectral mix` (mixes default 1).

**v4 → v5 (0.8): Warmth → TEMPER.** `dr.warmth` (0…1) is gone; `dr.temper` (−1 warm … 0 neutral … +1 cold) takes its address (2).
Reading an older file: if it has `dr.warmth` = w and no `dr.temper`, TEMPER = −w (the same amount, on the warm side, which keeps
Warmth's curve with a gentler drive and a slightly softer top); a CC mapped to Warmth moves to TEMPER; a wire on Warmth becomes a
wire on TEMPER with amount −a/2 (TEMPER's travel is twice as long). A file with neither opens neutral. `dr.human` (HUMANISE,
0…1) is new: missing = 0 (off). v4 added `dr.revtype` and `in.level`, `in.dly`, `in.rev`, `in.drums` (the insert input).
Native: `VD_MP_TEMPER` = 2, `VD_MP_REVERB_TYPE` = 11, `VD_MP_HUMANISE` = 12, `VD_MP_INPUT_*` = 120–123; a step's shift and
spectral values travel in `vd_step_fx` (command `VD_CMD_SET_STEP_FX`, and `steps_fx` in `vd_track_sequence`).

**v5 → v6 (0.9): 12 tracks, the vintage sampler, slices.** Tracks 10–12 are new (missing = defaults). The ring's sine oscillator
moved from master 9 to **12** (9–11 are tracks 10–12 now): reading a file before v6, a ring master of 9 becomes 12; a kit without
`v: 2` is migrated the same way. A step can have **24 values**: `… spectral mix, Metalise (−1 = the slice's / track's), slice
(0 = the track's, 1–32), reverse chance, stutter chance` — written at the shortest of 9 / 14 / 15 / 20 / 24 values that keeps
every non-default one. A pattern's `slicer` (1 / 0) overrides SLICER. A track's sample entry carries its BREAK LAB data (marks,
slices, tempo, detector settings); positions are frames of the decoded sample. Native: `VD_TRACKS_MAX` = 12,
`VD_RING_OSCILLATOR` = 12, `vd_step_fx` grew (`slice`, `metal_set`, `metal`, `reverse_chance`, `stutter_chance`; zero = the
track's), `vd_pattern.slicer` (0 follow, 1 on, 2 off), `VD_CMD_SET_PATTERN_SLICER`, `VD_CMD_NOTE_SLICE`, `vd_sample_set_slices`,
`vd_recorded_hit.slice`; new track addresses 48–55 (`VD_TP_METALISE` … `VD_TP_SAMPLER_MODEL`) and master 37 (`VD_MP_METALISE_CHARACTER`).

**v1 → v2.** A v1 file opens with a clear Slicer program (every slice THRU), no wires and no ring steps; nothing else changes.
A v2 file opened by a v1 reader loses only those three (its reader ignores unknown keys and extra step values).
Slicer actions: 0 THRU, 1 REPEAT, 2 STUTTER, 3 REVERSE, 4 TAPE STOP, 5 TAPE START, 6 PITCH, 7 SPEED, 8 GATE, 9 PERMUTE, 10 SCRATCH, 11 ECHO.
Wires to unknown parameters, to the MIDI channel or to choices/switches are dropped; amounts are clamped to −1…1.

**User banks** (20 × 99 presets) are not part of a song: they are the device's library (web: IndexedDB `bank:N`; iOS: the App Group,
`Kits/Banks/NN.json`, shared by the app and every plug-in instance), like the kits and samples. Exported banks are
`vektur-pulse-presets` files with a `bank` name; their kits carry the Slicer program and wires.

**Rules.**

| Rule | Why |
|---|---|
| **Every parameter is written**, not just the changed ones | If an update changes a default, saved songs must still sound as they did |
| **Parameters by key** (`t3.fmindex`), never by index | New parameters can be added without moving old ones |
| **Reading never trusts the data**: unknown keys are ignored, wrong types skipped, every number clamped, missing values fall back to defaults | A damaged, hand-edited or future file opens as far as it can, and never crashes the host |
| **Older files open**: the earlier web autosave, Vektur VJ sets (their drums), Vektur Pulse kits | Pulse's hat-choke becomes group A, and a sampled track gets the Sample engine |
| **Samples by content hash**, with the bytes optionally inside | Portable songs. Missing samples are named, never silently dropped |
| **Sorted keys, stable output** | An unchanged song encodes to identical bytes, so hosts don't see phantom edits |

**Size.** A full 12-track song is about 22 KB without samples. Samples add their file size plus about a third (base64). The plug-in embeds samples up to 32 MB per song. Above that, the song keeps references only, and the UI says so.

---

## 2. Inside a host: what the plug-in does

| Situation | What happens | Where |
|---|---|---|
| Host saves the project (GarageBand / Logic save, Cubasis save, AUM session save, autosaves) | `fullState` returns the host's base keys plus `vekturDrumState` (the JSON as Data) and `vekturDrumStateVersion` | `AUStateKeeper.fullState(base:)` |
| …while the song is playing, or after the user recorded steps with REC | The save first drains the engine's REC ring into the song, so **recorded steps are always in the save** | `capture()` / `drainRecorded()` |
| …after host automation or MIDI CC moved knobs | The save reads every parameter back from the engine, so **the save holds what you hear**, not what the UI last set | `capture()` |
| …many times a minute (AUM, Logic autosave) | An unchanged song returns cached bytes: no work, no allocation churn | `cache` |
| Host reopens the project | Parameters, then **one whole-sequence hand-off** (`vd_engine_load_sequence`): the engine switches songs at a block boundary, never half-loaded, whether or not audio is running yet. The transport stops (a song restore) | `restore(_:reason: .song)` + engine |
| …with samples inside the song | They are added to the App Group library first (hash-checked), then decoded off the audio thread and handed to the engine | `restore` → `loadSamples` |
| …on a device without the samples (song saved without them) | The song opens. Those tracks are silent, and a notice names each missing sample | `StateReadResult.missingSamples` |
| …before the view is ever opened | Fully supported: the song lives in the keeper, not in the view | `AUStateKeeper` |
| …from any thread, while rendering | One lock, never taken on the audio thread. The audio thread sees only atomics and hand-offs. Several threads may hand off samples and songs at once (tested under ThreadSanitizer) | keeper + `vd_engine.h` |
| Several instances in one project | Each instance has its own keeper, engine and song. Kits and samples are shared through the App Group | |
| Duplicating a track / instance (GarageBand, Cubasis) | The host copies `fullState` to the new instance: identical song | |
| Undo in the host | Hosts restore the previous `fullState`: same path as reopening | |
| User preset saved in the host's preset menu | AU user presets store `fullStateForDocument` (the same song). Loading one keeps **your CC map and tempo** and keeps playing | `restore(_:reason: .preset)` |
| Factory preset chosen in the host's preset menu | `currentPreset` → `applyKit`: kit sound, patterns and chain, keeps playing | `applyKit` |
| A song from a newer Vektur Drum | Opens. Unknown parts are skipped, with a notice | `StateCodec.decode` |

**Parameter tree.** After a restore, the AU sets its `AUParameterTree` values from the restored song, so the host's automation lanes and generic views show the right values. Parameter addresses never change (`vd_engine.h`), so host automation recorded in one version plays back in the next.

---

## 3. Tested here (Linux, headless Chrome)

| Test | Result |
|---|---|
| `tests/state.test.mjs`: a rich song (factory kit, edited steps with per-step FM ratio, a ring step, a Slicer program, two wires, 4-bar pattern, polymeter, chain, 8 tracks, 172.5 BPM, a WAV sample, a learned CC on channel 2) saved and opened on a **fresh device** | Identical, no warnings |
| …the same song written as v1 (no slicer / wires / ring) | Opens: clear program, no wires, no warnings |
| …then autosave + reload (sample bytes from IndexedDB) | Identical |
| …the restored sample track plays in the engine | Yes |
| …opened on a device without the samples (song saved without them) | Opens, names "Track 2: Test Sine" |
| Earlier web autosave · Vektur VJ set · Pulse "hat choke off" | Open correctly, with the migration |
| Kit file, `null`, numbers, empty object | Refused with a message, no crash |
| **300 randomly corrupted songs** | No crash, every value in range, every pattern in shape |
| `native/Tests/dsp/test_engine.cpp` (also under ASan/UBSan and TSan): a whole-sequence load — with ring steps, a Slicer program and wires — sounds **bit-identical** to the same song sent edit by edit; after 1,000 queued loads the last wins with no leaks; song restore stops the transport and a kit change keeps playing; 400 restores during playback; four threads handing off samples and songs while audio runs | All pass, no races, no leaks |

**Not testable here.** The Swift codec (`StateCodec`) and `AUStateKeeper` have not been compiled; that is the first Xcode build. `StateCodec` mirrors the web reader rule for rule, so the web tests above double as its specification. In Stage 5 the same fixtures (the saved song, the legacy files, the fuzz seeds) become XCTest cases.

---

## 4. Host checklist (run in Stage 5 / 10, on device)

Run each test in **GarageBand, Cubasis 3, AUM**, and also Logic Pro for iPad, Drambo and Loopy Pro. Use an iPad and an iPhone.

1. **Save / reopen.** Program a song: change sounds on all 9 tracks, record steps with REC, set per-step FM ratios, a chain, glitch with LFOs, load a sample, learn a CC. Save, close the host completely (swipe away), reopen. Everything must be back, and the first playback must sound identical.
2. **Never opened.** Reopen the project and play without opening the plug-in window: it must play the song.
3. **Automation.** Record host automation on Track 1 Tune and Glitch Mix. Save mid-song and reopen: the automation lanes play back, and the saved value is where the automation left it.
4. **Two instances.** Two Vektur Drums with different songs in one project: save, reopen, each keeps its own.
5. **Duplicate.** Duplicate the track / instance (GarageBand, Cubasis): the copy has the same song.
6. **Undo.** Change a pattern and use the host's undo: the pattern comes back.
7. **Presets.** Save a user preset from the host's menu, change things, load it: sound and patterns come back, the CC map and tempo stay. Choose a factory preset: it loads while playing without a glitch.
8. **Another device.** AirDrop or iCloud the project to a second device that has never had the sample: the song opens complete (samples embedded). Repeat with a song over 32 MB of samples: it opens and names the missing samples.
9. **Offline / bounce.** Bounce or export the song in GarageBand and Cubasis: the bounce matches real-time playback.
10. **Stress.** Reopen a project 20 times quickly, and switch sessions in AUM while playing: no crash, no hang, no audio glitch on load.
11. **Memory.** Nine 30-second samples in two instances on the oldest supported iPhone: no extension memory kill. Measure with Instruments.
12. **Update.** Open a project saved by the previous build: it sounds the same.


**0.9.1 (still v6).** `project.lfoShapes` — three rows of 16 numbers (−1…1, rounded to 0.001) — the LFOs' drawn shapes, played
when an LFO's shape is 5 (Draw). It is optional: a missing row is a sine (`round(sin(2πj/16)·1000)/1000`), a bad point 0,
so older files open unchanged and older readers ignore it. Kits carry it as `lfo`. New parameters (written in `params` like
every other): `t1…t12.long` (0 / 1: Decay ×20, up to 60 s), `gl.chance` (0…1) and `gl.chdiv` (0–3: 1/16, 1/8, 1/4, 1 bar).
A wire may now target `gl.on` (it switches above the middle). Native: `StateCodec` reads and writes `lfoShapes`
(`LFOShapes.clean`); the engine gets them as `VD_CMD_SET_LFO_POINTS` (two 8-point commands per LFO).
