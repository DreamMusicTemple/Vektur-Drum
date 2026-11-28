// Vektur Drum 0.9 — 12 tracks, step sampler fields, each pattern's Slicer, track slices, state v6 and its migration,
// the groove and song generators (the same results as the web app for the same seed) and the MIDI file.
// (Written without a Swift toolchain; the same behaviour is tested in the web app: tests/breaklab.test.mjs, tests/sampler.test.js.)
import XCTest
@testable import VekturDrumCore

final class SamplerTests: XCTestCase {
    func testStateV6RoundTripsSamplerStepsPatternSlicerAndSlices() throws {
        var p = DrumProject()
        XCTAssertEqual(p.trackCount, 12)
        var s = Step(); s.metalise = 0.6; s.slice = 7; s.reverseChance = 0.25; s.stutterChance = 0.5
        p.patterns[2].tracks[11].steps[3] = s
        p.patterns[2].slicer = true; p.patterns[5].slicer = false
        var sx = SampleSlices(); sx.bpm = 170; sx.marks = [TransientMark(position: 0, hit: .kick), TransientMark(position: 8471, manual: true, hit: .hat), TransientMark(position: 16941, accepted: false, hit: .snare)]
        var a = SliceSettings(start: 0, end: 8471, hit: .kick); a.pitch = 5; a.reverse = true; a.stutter = 3; a.metalise = 0.4
        sx.slices = [a, SliceSettings(start: 8471, end: 30000, hit: .hat)]
        p.tracks[3].sample = SampleRef(key: "s1234abcd", name: "Break"); p.tracks[3].slices = sx
        let data = try StateCodec.encode(p)
        let any = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(any["version"] as? Int, 6)
        let step = (((any["project"] as! [String: Any])["patterns"] as! [[String: Any]])[2]["tracks"] as! [[String: Any]])[11]["steps"] as! [Any]
        XCTAssertEqual((step[3] as! [Double]).count, 24, "a step with sampler fields is written with 24 values")
        let back = try StateCodec.decode(data, librarySamples: ["s1234abcd"]).project
        XCTAssertEqual(back.patterns[2].tracks[11].steps[3], s)
        XCTAssertEqual(back.patterns[2].slicer, true); XCTAssertEqual(back.patterns[5].slicer, false); XCTAssertNil(back.patterns[0].slicer)
        XCTAssertEqual(back.tracks[3].slices, sx)
    }

    func testV5FilesMoveTheRingOscillatorFrom9To12() throws {
        let json = """
        {"format":"vektur-drum-state","version":5,"project":{"patterns":[{"bars":1,"tracks":[{"len":16,"div":5,"steps":[[0.8,0,0,1,0,0,0,1,0,1,9,6,1,700],[0.8,0,0,1,0,0,0,1,0,1,3,1,1,220]]}]}]}}
        """
        let p = try StateCodec.decode(Data(json.utf8), librarySamples: []).project
        XCTAssertEqual(p.patterns[0].tracks[0].steps[0]?.ringMaster, UInt8(DrumLists.ringOscillator))   // the oscillator stays the oscillator
        XCTAssertEqual(p.patterns[0].tracks[0].steps[1]?.ringMaster, 3)                                 // a track master is unchanged
        XCTAssertEqual(DrumLists.ringOscillator, 12)
    }

    func testSlicesFromModes() {
        var sx = SampleSlices(); sx.bpm = 170
        let n = Int((8 * 60 / 170.0 * 48000).rounded())
        sx.marks = [0, 8471, 16941, 25412].map { TransientMark(position: $0) }
        sx.makeSlices(frames: n, rate: 48000); XCTAssertEqual(sx.slices.count, 4)
        sx.slices[1].pitch = 7
        sx.makeSlices(frames: n, rate: 48000); XCTAssertEqual(sx.slices[1].pitch, 7, "settings stay with their slice")
        sx.mode = .equal; sx.divisions = 8; sx.makeSlices(frames: n, rate: 48000); XCTAssertEqual(sx.slices.count, 8)
        sx.mode = .beat; sx.makeSlices(frames: n, rate: 48000); XCTAssertEqual(sx.slices.count, 8)
        sx.mode = .bar; sx.makeSlices(frames: n, rate: 48000); XCTAssertEqual(sx.slices.count, 2)
        sx.mode = .grid; sx.grid = 2; sx.makeSlices(frames: n, rate: 48000); XCTAssertEqual(sx.slices.count, 32)
    }

    /// The same seed gives the same song as the web app (fingerprints from songBuild in web/src/songgen.js).
    func testSongGeneratorMatchesTheWebApp() {
        let j = SongGenerator.build(.jungle, seed: 12345, breakTrack: (track: 11, slices: 8))
        XCTAssertEqual(j.bpm, 166.5)
        XCTAssertEqual(j.chain, [0, 0, 1, 2, 1, 3, 4, 5, 6, 2, 6, 7])
        XCTAssertEqual(j.patterns.map { $0.tracks.reduce(0) { $0 + $1.steps.compactMap { $0 }.count } }, [16, 36, 37, 40, 13, 28, 41, 12])
        XCTAssertEqual(j.patterns[1].tracks[11].steps.map { Int($0?.slice ?? 0) }, [1, 2, 3, 4, 0, 6, 7, 8, 1, 2, 0, 4, 4, 8, 7, 8])
        let h = SongGenerator.build(.house, seed: 12345, breakTrack: nil)
        XCTAssertEqual(h.bpm, 125); XCTAssertEqual(h.patterns.map { $0.tracks.reduce(0) { $0 + $1.steps.compactMap { $0 }.count } }, [28, 37, 39, 42, 31, 30, 36, 12])
        let d = SongGenerator.build(.dubTechno, seed: 12345, breakTrack: nil)
        XCTAssertEqual(d.bpm, 123); XCTAssertEqual(d.chain, [0, 1, 1, 2, 3, 4, 5, 6, 6, 2, 3, 7])
        for g in SongGenre.allCases { var p = DrumProject(); SongGenerator.apply(g, seed: 7, to: &p); XCTAssertEqual(p.patterns.count, 8); XCTAssertTrue(p.chainEnabled); XCTAssertFalse(p.patterns[1].isEmpty, g.rawValue) }
    }

    func testGrooveVariationsKeepTheKickAndUseTheBreaksOwnSlices() {
        var sx = SampleSlices(); sx.bpm = 170
        let hits: [HitClass] = [.kick, .hat, .snare, .hat, .ghost, .kick, .snare, .hat]
        sx.slices = hits.enumerated().map { SliceSettings(start: $0.offset * 4235, end: ($0.offset + 1) * 4235, hit: $0.element) }
        let base = GrooveGenerator.base(sx, frames: 8 * 4235, rate: 48000, projectTempo: 170)
        var o = GrooveOptions(); o.extreme = 1; o.lockKick = true
        var seen = Set<[Int]>()
        for i in 0..<16 {
            let v = GrooveGenerator.variation(base, slices: sx.slices, seed: Double(99 + i * 131), index: i, options: o)
            for k in 0..<16 { if let c = base[k], c.hit == .kick { XCTAssertEqual(v[k]?.slice, c.slice) } }
            XCTAssertTrue(v.allSatisfy { $0 == nil || (1...sx.slices.count).contains($0!.slice) })
            seen.insert(v.map { $0?.slice ?? 0 })
        }
        XCTAssertGreaterThan(seen.count, 10, "16 variations, nearly all different")
    }

    func testMIDIFile() {
        var p = DrumProject(); p.patterns[0].tracks[0].steps[0] = Step(); p.patterns[0].tracks[1].steps[4] = Step()
        let d = MIDIFileExport.data(p)
        XCTAssertEqual(String(decoding: d.prefix(4), as: UTF8.self), "MThd")
        XCTAssertEqual(d[9], 1)       // type 1
        XCTAssertEqual(d[11], 3)      // tempo track + 2 drum tracks
    }
}
