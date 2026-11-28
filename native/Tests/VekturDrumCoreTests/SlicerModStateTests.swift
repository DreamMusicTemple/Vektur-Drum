// Vektur Drum — NEW: Slicer program, modulation wires, ring steps, banks and the manual in the Swift model.
// (Written without a Swift toolchain; the same behaviour is tested in the web app: tests/state.test.mjs.)
import XCTest
@testable import VekturDrumCore

final class SlicerModStateTests: XCTestCase {
    func testNewAddressesMatchTheCHeader() {
        XCTAssertEqual(ParameterID.master(.slicerOn).address, 80)       // VD_MP_SLICER_ON
        XCTAssertEqual(ParameterID.master(.slicerHold).address, 91)     // VD_MP_SLICER_HOLD
        XCTAssertEqual(ParameterID.master(.envInput).address, 96)       // VD_MP_ENV_INPUT
        XCTAssertEqual(ParameterID.master(.chaosRate).address, 105)     // VD_MP_CHAOS_RATE
        // tracks 10–12 (0.9) sit in the master table at track addresses (≥ 1024): not master parameters
        for spec in ParameterSpec.master where spec.index >= 80 && spec.index < 1024 { XCTAssertNotNil(MasterParameter(rawValue: spec.index), spec.key) }
        XCTAssertEqual(ParameterID(key: "sl.density")?.address, 84)
        XCTAssertEqual(ParameterID(key: "t3.decay")?.address, 1024 + 2 * 256 + 2)
        XCTAssertEqual(ParameterID(key: "t12.decay")?.address, 1024 + 11 * 256 + 2)   // 0.9: 12 tracks
        XCTAssertNil(ParameterID(key: "t13.decay")); XCTAssertNil(ParameterID(key: "nope"))
        XCTAssertEqual(DrumLists.slicerActions.count, SlicerAction.allCases.count)
        XCTAssertEqual(DrumLists.modSources.count, ModSource.allCases.count)
    }

    func testModulatableDials() {
        XCTAssertTrue(ParameterSpec.spec(forKey: "t1.tune")!.isModulatable)
        XCTAssertTrue(ParameterSpec.spec(forKey: "sl.seed")!.isModulatable)          // stepped, with a range
        XCTAssertFalse(ParameterSpec.spec(forKey: "dr.ch")!.isModulatable)           // the MIDI channel
        XCTAssertFalse(ParameterSpec.spec(forKey: "gl.mode")!.isModulatable)         // a choice
    }

    func testStateV2RoundTripsSlicerWiresAndRing() throws {
        var p = DrumProject()
        p.slicer[3] = SlicerSlot(action: .permute, source: 12); p.slicer[7] = SlicerSlot(action: .tapeStop, source: 7)
        p.wires = [ModWire(source: .chaos, param: "sl.density", amount: -0.35), ModWire(source: .envelope, param: "t2.decay", amount: 0.8)]
        var s = Step(); s.ringOn = true; s.ringMaster = 9; s.ringSlaves = 5; s.ringAmount = 0.6; s.ringHz = 880
        p.patterns[3].tracks[1].steps[2] = s
        let data = try StateCodec.encode(p)
        let any = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(any["version"] as? Int, StateFile.version)   // was a stale literal 2 (the codec writes its current version)
        let back = try StateCodec.decode(data, librarySamples: []).project
        XCTAssertEqual(back.slicer, p.slicer)
        XCTAssertEqual(back.wires, p.wires)
        XCTAssertEqual(back.patterns[3].tracks[1].steps[2], s)
    }

    func testV1FilesOpenWithAClearProgramAndNoWires() throws {
        let v1 = #"{"format":"vektur-drum-state","version":1,"project":{"tempo":120,"patterns":[{"bars":1,"tracks":[{"len":16,"div":5,"steps":[[0.8,0,0,1,0,0,0,1,0]]}]}]}}"#
        let r = try StateCodec.decode(Data(v1.utf8), librarySamples: [])
        XCTAssertEqual(r.project.slicer, SlicerSlot.clearProgram)
        XCTAssertTrue(r.project.wires.isEmpty)
        XCTAssertFalse(r.project.patterns[0].tracks[0].steps[0]!.ringOn)
        XCTAssertTrue(r.warnings.isEmpty)
    }

    func testWiresToUnknownOrNonDialParametersAreDropped() throws {
        let j = #"{"format":"vektur-drum-state","version":2,"project":{"wires":[{"source":"lfo1","param":"dr.ch","amount":1},{"source":"nope","param":"t1.tune","amount":1},{"source":"chaos","param":"t1.tune","amount":7}]}}"#
        let w = try StateCodec.decode(Data(j.utf8), librarySamples: []).project.wires
        XCTAssertEqual(w, [ModWire(source: .chaos, param: "t1.tune", amount: 1)])
    }

    func testOlderStepsDecodeWithDefaults() throws {
        let s = try JSONDecoder().decode(Step.self, from: Data(#"{"velocity":0.5}"#.utf8))
        XCTAssertEqual(s.velocity, 0.5); XCTAssertFalse(s.ringOn); XCTAssertEqual(s.ringHz, 220)
    }

    func testBanks() throws {
        var b = KitBank(number: 120)
        XCTAssertEqual(b.number, 20); XCTAssertEqual(b.slots.count, KitBanks.slots); XCTAssertEqual(b.name, "Bank 20")
        let kit = Kit(name: "K", trackCount: 9, tracks: [], master: [:], patterns: [], chain: [], chainEnabled: false)
        XCTAssertEqual(b.add(Array(repeating: kit, count: 100)), 1); XCTAssertEqual(b.count, 99)
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = FileKitBankStore(directory: dir)
        try store.save(b); XCTAssertEqual(store.bank(20).count, 99); XCTAssertEqual(store.bank(5).count, 0)
    }

    func testFactoryKitsLoad() {
        let kits = FactoryKits.load()
        XCTAssertEqual(kits.count, 89)   // 88 + INIT
        for style in ["IDM", "Lo-Fi & Downtempo", "80s Electro", "Breakbeat", "Ambient"] { XCTAssertEqual(kits.filter { $0.category == style }.count, 10, style) }
        XCTAssertEqual(kits.filter { $0.category == "Techno" }.count, 11)   // + Steel Frame Groove (0.9 FM demo)
        let ini = FactoryKits.initKit(in: kits); XCTAssertNotNil(ini); XCTAssertTrue(ini?.patterns.allSatisfy(\.isEmpty) ?? false); XCTAssertTrue(ini?.master.isEmpty ?? false)
        XCTAssertTrue(kits.filter { $0.category == "Ambient" }.allSatisfy { ($0.tempo ?? 120) < 90 && $0.master["dr.revtype"] == 3 })
        XCTAssertEqual(kits.filter { $0.category == "Hard Trance" || $0.category == "Psytrance" }.count, 10)
        XCTAssertTrue(kits.contains { ($0.wires ?? []).count > 0 && ($0.slicer ?? []).contains { $0.action != .thru } })
        XCTAssertTrue(kits.contains { $0.patterns.contains { $0.tracks.contains { $0.steps.contains { ($0?.fold ?? 0) > 0 } } } })
    }

    func testStateV3FoldEqTape() throws {
        var p = DrumProject(); var s = Step(); s.fold = 0.55; p.patterns[0].tracks[2].steps[1] = s
        p.tracks[3].values["eq2g"] = 6.5; p.master["tp.wow"] = 0.3
        let back = try StateCodec.decode(try StateCodec.encode(p), librarySamples: []).project
        XCTAssertEqual(back.patterns[0].tracks[2].steps[1]?.fold, 0.55)
        XCTAssertEqual(back.tracks[3].values["eq2g"], 6.5); XCTAssertEqual(back.master["tp.wow"], 0.3)
        XCTAssertEqual(ParameterID.track(3, .eq2Gain).address, 1024 + 3 * 256 + 43); XCTAssertEqual(ParameterID.master(.vinylDust).address, 114)
    }

    func testStateV5TemperHumaniseShiftSpectral() throws {
        var p = DrumProject(); var s = Step(); s.shiftSemitones = 7; s.shiftMix = 0.4; s.spectral = 0.8; s.spectralColour = 0.93; s.spectralMix = 0.7
        p.patterns[1].tracks[4].steps[9] = s; p.master["dr.temper"] = 0.35; p.master["dr.human"] = 0.6; p.master["dr.revtype"] = 3
        let back = try StateCodec.decode(try StateCodec.encode(p), librarySamples: []).project
        XCTAssertEqual(back.patterns[1].tracks[4].steps[9], s); XCTAssertEqual(back.master["dr.temper"], 0.35); XCTAssertEqual(back.master["dr.human"], 0.6)
        // a v4 song with Warmth: the value, its CC and its wire move to TEMPER's warm side
        let v4 = #"{"format":"vektur-drum-state","version":4,"project":{"params":{"dr.warmth":0.45},"wires":[{"source":"lfo1","param":"dr.warmth","amount":0.4}]},"midi":{"ccMap":{"dr.warmth":{"cc":12,"ch":0}}}}"#
        let m = try StateCodec.decode(Data(v4.utf8), librarySamples: []).project
        XCTAssertEqual(m.master["dr.temper"], -0.45); XCTAssertNil(m.master["dr.warmth"]); XCTAssertEqual(m.midiCC["dr.temper"]?.cc, 12)
        XCTAssertEqual(m.wires.first?.param, "dr.temper"); XCTAssertEqual(m.wires.first?.amount ?? 0, -0.2, accuracy: 1e-9)
        let none = try StateCodec.decode(Data(#"{"format":"vektur-drum-state","version":3,"project":{}}"#.utf8), librarySamples: []).project
        XCTAssertNil(none.master["dr.temper"]); XCTAssertNil(none.master["dr.human"])   // → the defaults: neutral, off
        XCTAssertEqual(ParameterID.master(.temper).address, 2); XCTAssertEqual(ParameterID.master(.humanise).address, 12); XCTAssertEqual(ParameterID.master(.inputDrums).address, 123)
    }

    func testManualIsTheWebManual() {
        XCTAssertTrue(UserManual.sections.contains { $0.title == "The Slicer" })
        XCTAssertTrue(UserManual.sections.contains { $0.title == "Modulation" })
        XCTAssertTrue(UserManual.sections.contains { $0.title == "Ring modulation" })
        XCTAssertTrue(UserManual.sections.contains { $0.title == "Master: TEMPER and HUMANISE" })
        XCTAssertTrue(UserManual.sections.contains { $0.title == "Reverb types" })
        XCTAssertTrue(UserManual.sections.contains { $0.title == "Export: master and stems" })
        XCTAssertTrue(UserManual.sections.contains { $0.title == "Metalise and LFOs" })
        XCTAssertFalse(UserManual.sections.flatMap(\.blocks).contains { $0.contains("<") })
    }

    // NEW (0.9.1)
    func testLfoDrawShapesRoundTripAndDefaultToSines() throws {
        var p = DrumProject()
        XCTAssertEqual(p.lfoShapes.count, 3); XCTAssertEqual(p.lfoShapes[0].count, LFOShapes.points)
        XCTAssertEqual(p.lfoShapes[1][4], 1, accuracy: 1e-9)   // a sine's peak at a quarter
        p.lfoShapes[2] = (0..<16).map { Double($0) / 15 * 2 - 1 }
        let back = try StateCodec.decode(try StateCodec.encode(p), librarySamples: []).project
        XCTAssertEqual(back.lfoShapes, LFOShapes.clean(p.lfoShapes))
        XCTAssertEqual(LFOShapes.clean([[9, -9, .nan]])[0].prefix(3), [1, -1, 0])
        let old = #"{"format":"vektur-drum-state","version":6,"project":{}}"#
        XCTAssertEqual(try StateCodec.decode(Data(old.utf8), librarySamples: []).project.lfoShapes, LFOShapes.defaults)
    }

    func testLongAndMetaliseChanceParameters() {
        XCTAssertEqual(ParameterID(key: "t1.long")?.address, 1024 + 56)
        XCTAssertEqual(ParameterID(key: "gl.chance")?.address, 38)
        XCTAssertEqual(ParameterID(key: "gl.chdiv")?.address, 39)
        XCTAssertTrue(ParameterSpec.spec(forKey: "gl.on")!.isModulatable)   // long-press: an LFO can switch METALISE
        XCTAssertEqual(ParameterSpec.spec(forKey: "lfo1.shape")!.range.upperBound, 5)   // Draw
    }

}
