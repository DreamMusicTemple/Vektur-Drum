# Vektur Drum — AUv3 components (0.9)

One audio-unit class, `VekturDrumAudioUnit` (native/Sources/VekturDrumAudio/VekturDrumAudioUnit.swift), registered three
times by the app extension. The instrument and the effect share everything: the engine, the song state
(AUStateKeeper → `fullState`), the parameter tree (stable addresses from vd_engine.h), the UI.

| Name | type | subtype | manufacturer | What it is |
|---|---|---|---|---|
| Vektur Drum | `aumu` | `vkdr` | `DMTp` | the drum machine (instrument): MIDI in, stereo out |
| Vektur Drum FX | `aufx` | `vkfx` | `DMTp` | **insert effect**: any track's audio → delay / reverb sends → glitch → Slicer → tape → TEMPER → out. Starts with DRUMS OFF (a pure effect); turn the drums on to play them over the input |
| Vektur Drum FX (MIDI) | `aumf` | `vkfm` | `DMTp` | the same effect as a *music effect*: hosts that route MIDI to inserts (AUM, Cubasis, Logic) can also play the pads |

## Info.plist of the extension (NSExtension → NSExtensionAttributes → AudioComponents)

```xml
<array>
  <dict><key>name</key><string>Dream Music Temple: Vektur Drum</string><key>description</key><string>Vektur Drum</string>
    <key>manufacturer</key><string>DMTp</string><key>type</key><string>aumu</string><key>subtype</key><string>vkdr</string>
    <key>version</key><integer>2304</integer><key>sandboxSafe</key><true/><key>tags</key><array><string>Drums</string><string>Synthesizer</string></array></dict>
  <dict><key>name</key><string>Dream Music Temple: Vektur Drum FX</string><key>description</key><string>Vektur Drum effects and Slicer</string>
    <key>manufacturer</key><string>DMTp</string><key>type</key><string>aufx</string><key>subtype</key><string>vkfx</string>
    <key>version</key><integer>2304</integer><key>sandboxSafe</key><true/><key>tags</key><array><string>Effects</string><string>Delay</string><string>Reverb</string></array></dict>
  <dict><key>name</key><string>Dream Music Temple: Vektur Drum FX (MIDI)</string><key>description</key><string>Vektur Drum effects, playable</string>
    <key>manufacturer</key><string>DMTp</string><key>type</key><string>aumf</string><key>subtype</key><string>vkfm</string>
    <key>version</key><integer>2304</integer><key>sandboxSafe</key><true/><key>tags</key><array><string>Effects</string><string>Drums</string></array></dict>
</array>
```
(`version` 2304 = 0x00000900 = 0.9.0.) The extension's principal class / `AUViewController` factory returns
`VekturDrumAudioUnit(componentDescription:)` for all three; the class reads the component type to decide.

## Render path (real-time rules)

* The render block captures only the C engine pointer, preallocated scratch (MIDI events, bus-pointer slots, an input
  buffer list) and the host's musical-context / transport blocks — never `self`.
* Effect: `pullInputBlock` fills the preallocated input buffers; their pointers go to `vd_render_context.input_left /
  input_right` (mono hosts: right = NULL). The engine adds the input to the mix and to its own delay / reverb sends
  (`in.level`, `in.dly`, `in.rev`), then glitch → Slicer → tape → TEMPER → level. `in.drums` mutes the drum tracks.
* Output buffers: the host's, or the unit's own when the host passes `mData == NULL` (in-place convention).
* No allocation, no locks, no Swift reference counting on the audio thread; the engine itself is checked allocation-
  free in `native/Tests/dsp/test_engine.cpp` (0.8 features included) and under Address/Thread sanitizers.
* Latency 0 (the spectral step effect's 256-sample window is aligned inside its track and only on steps that use it).
  Tail time: 12 s (instrument), 60 s (effect — the Expanse reverb's washes).

## CPU (Linux, one core, -O2, 48 kHz; tests/run_native.sh)
* 0.9: 12 tracks with METALISE and RESAMPLE on every one, a sliced break with reverse / stutter chances and the Metalise character: ≈ 9 % of a core (no allocations).
* Everything at once in 0.7 (9 tracks, FM feedback, glitch, Slicer, ring, 32 wires, EQ ×9, tape): ≈ 3.8 % of a core.
* Worst case 0.8 (every second step of all 9 tracks with pitch shift **and** spectral, Expanse wash, HUMANISE 100 %,
  TEMPER, insert input, Slicer, glitch, tape): ≈ 11 % of a core. TEMPER + HUMANISE on a groove: < 0.05 %.
