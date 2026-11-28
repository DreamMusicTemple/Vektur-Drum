// swift-tools-version: 5.9
// Vektur Drum — shared code for the app and the AUv3 extension. The Xcode project (two targets: the universal
// iPhone/iPad app and the AUv3 instrument extension) depends on these three libraries.
//
// STATUS (Stage 4): VekturDrumDSP is the complete C++ engine (port of Vektur VJ's Drums.h + Vektur Drum's features),
// tested on Linux with gcc/clang, sanitizers and a parity harness against the web engine (tests/run_native.sh).
// The Swift targets have not been compiled yet (no Swift toolchain where they were written): first Xcode build.
import PackageDescription

let package = Package(
    name: "VekturDrumKit",
    platforms: [.iOS(.v17), .macOS(.v14)],   // macOS only so DSP and model tests run on a Mac without a device
    products: [
        .library(name: "VekturDrumDSP", targets: ["VekturDrumDSP"]),
        .library(name: "VekturDrumCore", targets: ["VekturDrumCore"]),
        .library(name: "VekturDrumAudio", targets: ["VekturDrumAudio"]),
    ],
    targets: [
        // C++ real-time engine behind a C header (include/vd_engine.h). No Swift/C++ interop needed.
        .target(name: "VekturDrumDSP"),
        // Project model, parameter specs, kits, samples, persistence. Pure Swift, no audio.
        .target(name: "VekturDrumCore", resources: [.process("Resources")]),   // FactoryKits.json (tools/gen_factory.mjs)
        // Engine wrapper, the AUAudioUnit, the standalone audio host, MIDI.
        .target(name: "VekturDrumAudio", dependencies: ["VekturDrumDSP", "VekturDrumCore"]),
        .testTarget(name: "VekturDrumCoreTests", dependencies: ["VekturDrumCore"]),
    ],
    cxxLanguageStandard: .cxx17
)
