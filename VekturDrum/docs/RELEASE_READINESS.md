# Vektur Drum — release readiness

Last updated: 2026-11-27

## Verified in CI

- The 0.9.1 native Swift package builds with the Xcode toolchain.
- The iOS app target and AUv3 extension target have both compiled for iOS Simulator.
- The Swift package test suite has passed: 23 tests, 0 failures.
- AU component registration metadata is present for the instrument (`aumu/vkdr`), insert effect (`aufx/vkfx`) and MIDI-capable effect (`aumf/vkfm`).
- App and AUv3 targets are configured for iOS 17 and share the App Group identifier `group.com.dreammusictemple.vekturdrum`.
- The AU render scratch-pointer lifetime and oversized-frame guard have been hardened; Swift-side command queue producers are serialized; stale sample restores are rejected.

CI build verification is not a device test, a signed archive, or an App Store Connect upload.

## Still required before a TestFlight candidate

### App functionality
- A first standalone AVAudioEngine host and native 12-track / 16-step sequencer are now connected to the DSP engine. Play/Stop, pattern selection and step toggles issue native engine commands. The render context currently runs at a fixed 120 BPM; add tempo control and verify playback on physical devices.
- Complete the remaining native sequencer and sound-editing screens using the existing project model and DSP parameters. Do not replace the DSP engine or change parameter addresses/state formats.
- Implement the App Group-backed `SampleLibrary`, `KitLibrary`, `ProjectStore` and `LibraryLocation` services.
- Connect the sample library to `VekturDrumAudioUnit`; it currently initializes its state keeper without a sample library.
- Complete the AUv3 controller UI and factory-preset behavior; the current extension view is only a placeholder label.
- Implement CoreMIDI input and complete standalone interruption, route-change and media-services-reset handling.
- Schedule non-real-time engine garbage collection and finish the render-thread audit, including host buffer edge cases and repeated resource allocation.
- Add a real App Store icon asset, screenshots and final app metadata.

### Validation
- Run the app on a physical iPhone and iPad, not only the simulator.
- Test instrument, effect and MIDI-effect registration in at least one AUv3 host.
- Stress test rapid note triggering, long sessions, sample replacement, project restore, interruptions, route changes and sample-rate changes.
- Confirm that all audio-thread paths remain allocation-free and lock-free.
- Verify sample import/export, project persistence and embedded-sample restore across app and AUv3 instances.

## Apple account and App Store Connect requirements

These are the external items needed after the app functionality and device tests are complete:

1. An active Apple Developer Program membership and the associated Team ID.
2. An App ID for `com.dreammusictemple.vekturdrum` and the extension ID `com.dreammusictemple.vekturdrum.au`.
3. Registration of the App Group `group.com.dreammusictemple.vekturdrum` for that team.
4. An App Store Connect app record using the exact app bundle ID.
5. Automatic signing enabled for both the app and AUv3 extension.
6. App Store privacy details, age rating, export-compliance answers, app description, support URL, privacy-policy URL, screenshots and a 1024×1024 app icon.
7. A successful signed Release archive uploaded to App Store Connect; then enable TestFlight and add internal testers.

Never share an Apple password, two-factor code, distribution certificate private key or provisioning-profile secret in chat. Sign-in and final authorization must be completed by the account holder in Apple's own interface.
