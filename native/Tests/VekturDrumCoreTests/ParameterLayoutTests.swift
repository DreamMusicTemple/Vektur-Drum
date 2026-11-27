// Vektur Drum — the Swift parameter layout must match vd_engine.h and Vektur Pulse's table.
import XCTest
@testable import VekturDrumCore

final class ParameterLayoutTests: XCTestCase {
    func testAddressesMatchTheCHeader() {
        XCTAssertEqual(ParameterID.track(0, .model).address, 1024)                 // VD_PARAM_TRACK_BASE
        XCTAssertEqual(ParameterID.track(8, .level).address, 1024 + 8 * 256 + 5)   // track 9 level
        XCTAssertEqual(ParameterID.track(2, .engine).address, 1024 + 2 * 256 + 32) // VD_TP_ENGINE
        XCTAssertEqual(ParameterID.master(.reverbDamping).address, 10)            // VD_MP_REVERB_DAMPING
    }

    func testGeneratedTableMatchesTheEnums() {
        XCTAssertEqual(ParameterSpec.track.count, 44)   // 0.9: + Metalise, Resample, transient mode / sens, slice, tune mode, stretch, sampler model
        for spec in ParameterSpec.track { XCTAssertNotNil(TrackParameter(rawValue: spec.index), "\(spec.key) has a TrackParameter case") }
        for spec in ParameterSpec.master where spec.index < 32 { XCTAssertNotNil(MasterParameter(rawValue: spec.index), spec.key) }
        XCTAssertEqual(ParameterSpec.trackDefaults.count, 12)
        XCTAssertEqual(ParameterSpec.trackNotes, [36, 38, 42, 46, 39, 45, 37, 56, 49, 50, 51, 54])
        XCTAssertEqual(ParameterID.track(0, .metalise).address, 1024 + 48)   // VD_TP_METALISE
        XCTAssertEqual(ParameterID.track(11, .samplerModel).address, 1024 + 11 * 256 + 55)
        XCTAssertEqual(ParameterID.master(.metaliseCharacter).address, 37)
    }

    func testNormalisationRoundTrips() {
        for spec in ParameterSpec.track + ParameterSpec.master where spec.kind == .continuous {
            for t in stride(from: 0.0, through: 1.0, by: 0.125) {
                XCTAssertEqual(spec.normalized(spec.value(atNormalized: t)), t, accuracy: 1e-9, spec.key)
            }
        }
    }

    func testProjectClampsTrackCountAndRoundTrips() throws {
        var p = DrumProject()
        p.trackCount = 13; XCTAssertEqual(p.trackCount, 12)
        p.trackCount = 2; XCTAssertEqual(p.trackCount, 6)
        p.patterns[0].tracks[8].steps[3] = Step()
        let back = try JSONDecoder().decode(DrumProject.self, from: JSONEncoder().encode(p))
        XCTAssertEqual(back, p)
    }
}
