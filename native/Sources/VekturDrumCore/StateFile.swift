// Vektur Drum — vektur-drum-state v2 (docs/STATE.md; v1 files open too): the one format for a song, shared with the web app.
// Used for AUAudioUnit.fullState (the song inside GarageBand, Cubasis, AUM, Logic…), the app's documents and project
// files. Writing: every parameter by key, all 8 patterns, the chain, samples by content hash (bytes optional), the
// MIDI CC map. Reading: never trusts the data — unknown keys ignored, wrong types skipped, everything clamped,
// missing values → defaults; older web autosaves and Vektur VJ sets are read too. Not yet compiled (first Xcode build).
import Foundation

public struct MIDICCAssignment: Codable, Hashable, Sendable {
    public var cc: Int       // 0…127
    public var ch: Int       // 0 = any channel, 1…16
    public init(cc: Int, ch: Int = 0) { self.cc = min(127, max(0, cc)); self.ch = min(16, max(0, ch)) }
}

/// The file as stored. Optional everywhere: decoding a damaged or foreign file never fails half-way.
public struct StateFile: Codable, Sendable {
    public static let format = "vektur-drum-state"
    public static let version = 6   // v2: slicer program, modulation wires, ring fields on steps · v3: step fold (15th value), EQ and tape parameters
                                    // v4: step pitch shift + spectral (values 16–20), reverb type, insert input · v5: TEMPER (replaces Warmth: w → −w) and HUMANISE
                                    // v6 (0.9): 12 tracks (ring oscillator 9 → 12), step Metalise / slice / reverse / stutter chance (values 21–24),
                                    //           each pattern's Slicer, each track's slices (on its sample entry)

    public struct SampleRefJSON: Codable, Sendable {
        public var key: String; public var name: String?
        // NEW v6: the BREAK LAB data (web drumSxOut): marks as [position, manual, accepted, class]; slices with only their non-default settings
        public var bpm: Double?, sens: Double?, gap: Double?, mode: Double?, div: Double?, grid: Double?
        public var marks: [[Double]]?
        public var slices: [SliceJSON]?
        public init(key: String, name: String?) { self.key = key; self.name = name }
    }
    public struct SliceJSON: Codable, Sendable { public var s: Double?, e: Double?, p: Double?, g: Double?, pan: Double?, a: Double?, gate: Double?, r: Double?, st: Double?, stut: Double?, sd: Double?, m: Double?, c: Double?, mode: Double? }
    public struct SampleData: Codable, Sendable { public var key: String; public var name: String?; public var fmt: String?; public var data: String }
    public struct TrackJSON: Codable, Sendable { public var len: Double?; public var div: Double?; public var steps: [[Double]?]? }
    public struct PatternJSON: Codable, Sendable { public var bars: Double?; public var tracks: [TrackJSON?]?; public var slicer: Double? = nil }   // slicer (v6): absent = follow SLICER, 1 on, 0 off
    public struct Project: Codable, Sendable {
        public var tempo: Double?, trackCount: Double?, selected: Double?
        public var chain: [Double]?, chainOn: Bool?, kit: String?
        public var params: [String: Double]?
        public var patterns: [PatternJSON?]?
        public var samples: [SampleRefJSON?]?
        public var slicer: [[Double]]?           // NEW v2: 32 × [action, permute source]
        public var wires: [WireJSON]?            // NEW v2
        public var lfoShapes: [[Double]]? = nil  // NEW (0.9.1): 3 × 16 drawn LFO points (missing = sines)
    }
    public struct WireJSON: Codable, Sendable { public var source: String?; public var param: String?; public var amount: Double? }
    public struct MIDI: Codable, Sendable { public var ccMap: [String: MIDICCAssignment]? }

    public var format: String?
    public var version: Int?
    public var writer: String?
    public var project: Project?
    public var midi: MIDI?
    public var sampleData: [SampleData]?
}

public enum StateError: Error, LocalizedError {
    case notASong, kitFile
    public var errorDescription: String? {
        switch self { case .notASong: return "That is not a Vektur Drum song."; case .kitFile: return "That is a kit file — import it in Presets." }
    }
}

public struct StateReadResult: Sendable {
    public var project: DrumProject
    public var embeddedSamples: [StateFile.SampleData]    // to add to the sample library (App Group) before playing
    public var missingSamples: [(track: Int, name: String)]
    public var warnings: [String]
}

public enum StateCodec {
    // ---------------------------------------------------------------- write
    /// The song as JSON. `embed`: the sample files' bytes by key (portable song); nil = references only.
    public static func encode(_ p: DrumProject, embed: [String: (name: String, fmt: String, bytes: Data)]? = nil, writer: String = "Vektur Drum") throws -> Data {
        var params: [String: Double] = [:]
        for t in 0..<TrackLimits.playable.upperBound {
            for spec in ParameterSpec.track { params["t\(t + 1).\(spec.key)"] = p.tracks[t].values[spec.key] ?? ParameterSpec.trackDefaults[t][spec.key] ?? spec.defaultValue }
        }
        for spec in ParameterSpec.master { params[spec.key] = p.master[spec.key] ?? spec.defaultValue }
        let patterns: [StateFile.PatternJSON?] = p.patterns.prefix(TrackLimits.patterns).map { pt in
            StateFile.PatternJSON(bars: Double(pt.bars.rawValue), tracks: pt.tracks.prefix(TrackLimits.playable.upperBound).map { tr in
                StateFile.TrackJSON(len: Double(tr.length), div: Double(tr.division.rawValue), steps: tr.steps.prefix(TrackLimits.steps).map { s in
                    s.map { st -> [Double] in   // = web drumTrimStep: the shortest of 9 / 14 / 15 / 20 / 24 values that keeps every non-default one
                        let v = [Double(st.velocity), Double(st.pan), Double(st.pitch), Double(st.ratchet), Double(st.crush), Double(st.delaySend), Double(st.reverbSend), Double(st.chance), Double(st.fmRatio)]
                        let ring = st.ringOn ? [1, Double(st.ringMaster), Double(st.ringSlaves), Double(st.ringAmount), Double(st.ringHz)] : [0, Double(DrumLists.ringOscillator), 0, 1, 220]
                        let x = [Double(st.fold), Double(st.shiftSemitones), Double(st.shiftMix), Double(st.spectral), Double(st.spectralColour), Double(st.spectralMix)]
                        if st.hasSampler { return v + ring + x + [Double(st.metalise < 0 ? -1 : st.metalise), Double(st.slice), Double(st.reverseChance), Double(st.stutterChance)] }   // 24 (v6)
                        if st.hasShiftOrSpectral || st.shiftMix != 1 || st.spectralMix != 1 || st.spectralColour != 0 { return v + ring + x }   // 20 (v4)
                        if st.fold > 0 { return v + ring + [Double(st.fold)] }   // 15 values with a fold
                        return st.ringOn ? v + ring : v                          // 14 with a ring
                    } })
            }, slicer: pt.slicer.map { $0 ? 1 : 0 })
        }
        let samples: [StateFile.SampleRefJSON?] = (0..<TrackLimits.playable.upperBound).map { t in p.tracks[t].sample.map { ref in
            var j = StateFile.SampleRefJSON(key: ref.key, name: ref.name)
            if let sx = p.tracks[t].slices, !sx.isEmpty { sliceJSON(sx, into: &j) }
            return j } }
        var f = StateFile(format: StateFile.format, version: StateFile.version, writer: writer,
                          project: .init(tempo: p.tempo, trackCount: Double(p.trackCount), selected: Double(p.selectedPattern), chain: p.chain.map(Double.init),
                                         chainOn: p.chainEnabled, kit: p.currentKitName ?? "", params: params, patterns: patterns, samples: samples,
                                         slicer: p.slicer.prefix(DrumLists.slicerSlots).map { [Double($0.action.rawValue), Double($0.source)] },
                                         wires: p.wires.prefix(DrumLists.modWires).map { .init(source: $0.source.id, param: $0.param, amount: ($0.amount * 1e4).rounded() / 1e4) },
                                         lfoShapes: LFOShapes.clean(p.lfoShapes)),
                          midi: .init(ccMap: p.midiCC), sampleData: nil)
        if let embed {
            let used = Set(samples.compactMap { $0?.key })
            f.sampleData = embed.filter { used.contains($0.key) }.map { .init(key: $0.key, name: $0.value.name, fmt: $0.value.fmt, data: $0.value.bytes.base64EncodedString()) }
        }
        let enc = JSONEncoder(); enc.outputFormatting = [.sortedKeys]   // stable output: unchanged songs encode to identical bytes
        return try enc.encode(f)
    }

    /// NEW v6: a track's slices on its sample entry (= web drumSxOut: defaults left out).
    static func sliceJSON(_ sx: SampleSlices, into j: inout StateFile.SampleRefJSON) {
        j.bpm = sx.bpm; j.sens = sx.sensitivity; j.gap = sx.gapMs; j.mode = Double(sx.mode.rawValue); j.div = Double(sx.divisions); j.grid = Double(sx.grid)
        j.marks = sx.marks.map { [Double($0.position), $0.manual ? 1 : 0, $0.accepted ? 1 : 0, Double($0.hit.rawValue)] }
        j.slices = sx.slices.map { v in
            var o = StateFile.SliceJSON(); o.s = Double(v.start); o.e = Double(v.end)
            if v.pitch != 0 { o.p = v.pitch }; if v.gain != 1 { o.g = v.gain }; if v.pan != 0 { o.pan = v.pan }; if v.attackMs != 0 { o.a = v.attackMs }; if v.gate != 1 { o.gate = v.gate }
            if v.reverse { o.r = 1 }; if v.stretch != 1 { o.st = v.stretch }; if v.stutter != 0 { o.stut = Double(v.stutter) }; if v.stutterBeats != 0.125 { o.sd = v.stutterBeats }
            if v.metalise >= 0 { o.m = v.metalise }; if v.hit != .other { o.c = Double(v.hit.rawValue) }
            return o
        }
    }
    /// = web drumSxClean: anything → valid slices (clamped, sorted, at most 256 marks and 32 slices).
    static func slices(from j: StateFile.SampleRefJSON) -> SampleSlices? {
        func n(_ v: Double?, _ lo: Double, _ hi: Double, _ d: Double) -> Double { guard let v, v.isFinite else { return d }; return min(max(v, lo), hi) }
        var x = SampleSlices()
        x.bpm = n(j.bpm, 0, 400, 0); x.sensitivity = n(j.sens, 0, 1, 0.5); x.gapMs = n(j.gap, 5, 1000, 50)
        x.mode = SampleSlices.Mode(rawValue: Int(n(j.mode, 0, 4, 0).rounded())) ?? .transient; x.divisions = Int(n(j.div, 1, 32, 8).rounded()); x.grid = Int(n(j.grid, 0, 5, 2).rounded())
        x.marks = (j.marks ?? []).prefix(256).compactMap { m -> TransientMark? in
            guard let p = m.first, p.isFinite, p >= 0 else { return nil }
            return TransientMark(position: Int(p.rounded()), manual: m.count > 1 && m[1] != 0, accepted: !(m.count > 2 && m[2] == 0), hit: HitClass(rawValue: Int(n(m.count > 3 ? m[3] : nil, 0, 4, 4).rounded())) ?? .other)
        }.sorted { $0.position < $1.position }
        x.slices = (j.slices ?? []).prefix(SampleSlices.maxSlices).map { o in
            let s = max(0, Int((o.s ?? 0).isFinite ? (o.s ?? 0).rounded() : 0)), e = max(s + 2, Int((o.e ?? Double(s + 2)).isFinite ? (o.e ?? Double(s + 2)).rounded() : Double(s + 2)))
            var v = SliceSettings(start: s, end: e, hit: HitClass(rawValue: Int(n(o.c, 0, 4, 4).rounded())) ?? .other)
            v.pitch = n(o.p, -24, 24, 0); v.gain = n(o.g, 0, 2, 1); v.pan = n(o.pan, -1, 1, 0); v.attackMs = n(o.a, 0, 200, 0); v.gate = n(o.gate, 0.02, 1, 1)
            v.reverse = (o.r ?? 0) != 0; v.stretch = n(o.st, 0.25, 4, 1); v.stutter = Int(n(o.stut, 0, 8, 0).rounded()); v.stutterBeats = n(o.sd, 1.0 / 32, 1, 0.125)
            v.metalise = (o.m ?? -1) >= 0 ? n(o.m, 0, 1, 0) : -1
            return v
        }
        return x.isEmpty ? nil : x
    }

    // ---------------------------------------------------------------- read
    /// Reads any song Vektur Drum or Vektur VJ wrote. `librarySamples`: keys already on this device.
    public static func decode(_ data: Data, librarySamples: Set<String>) throws -> StateReadResult {
        guard let any = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw StateError.notASong }
        var warnings: [String] = []
        let file: StateFile
        if (any["format"] as? String) == StateFile.format {
            file = (try? JSONDecoder().decode(StateFile.self, from: data)) ?? StateFile()
            if (file.version ?? 1) > StateFile.version { warnings.append("Saved by a newer Vektur Drum: anything this version doesn't know is skipped.") }
        } else if (any["format"] as? String) == "vektur-pulse-presets" {
            throw StateError.kitFile
        } else if let drums = any["drums"] as? [String: Any] {   // earlier web autosave, or a Vektur VJ set
            file = legacy(drums, bpm: any["bpm"] as? Double)
            if any["app"] as? String != "vektur-drum" { warnings.append("Opened the drums of a Vektur VJ set.") }
        } else { throw StateError.notASong }
        return build(file, librarySamples: librarySamples, warnings: warnings)
    }

    private static func clamp(_ v: Double?, _ lo: Double, _ hi: Double, _ def: Double) -> Double {
        guard let v, v.isFinite else { return def }; return min(hi, max(lo, v))
    }
    private static func build(_ f: StateFile, librarySamples: Set<String>, warnings w: [String]) -> StateReadResult {
        var warnings = w
        var p = DrumProject()
        let pr = f.project ?? StateFile.Project()
        let params = pr.params ?? [:]
        func value(_ spec: ParameterSpec, _ v: Double?) -> Double? {
            guard let v, v.isFinite else { return nil }
            let c = min(spec.range.upperBound, max(spec.range.lowerBound, v)); return spec.kind == .continuous ? c : c.rounded()
        }
        for t in 0..<TrackLimits.playable.upperBound {
            for spec in ParameterSpec.track { if let v = value(spec, params["t\(t + 1).\(spec.key)"]) { p.tracks[t].values[spec.key] = v } }
        }
        for spec in ParameterSpec.master { if let v = value(spec, params[spec.key]) { p.master[spec.key] = v } }
        migrate(&p, params: params, samples: pr.samples)
        p.tempo = (clamp(pr.tempo, 40, 240, 120) * 10).rounded() / 10
        p.trackCount = Int(clamp(pr.trackCount, Double(TrackLimits.playable.lowerBound), Double(TrackLimits.playable.upperBound), Double(TrackLimits.playable.upperBound)))
        p.selectedPattern = Int(clamp(pr.selected, 0, 7, 0))
        p.chain = (pr.chain ?? []).prefix(TrackLimits.chainMax).map { Int(clamp($0, 0, 7, 0)) }
        p.chainEnabled = pr.chainOn ?? false
        p.currentKitName = pr.kit.map { String($0.prefix(60)) }
        let pats = pr.patterns ?? []
        let oldRing = (f.version ?? 1) < 6   // before 0.9 the ring's sine oscillator was master 9 (it is 12 now)
        for i in 0..<TrackLimits.patterns {
            guard i < pats.count, let pt = pats[i] else { continue }
            let b = Int(clamp(pt.bars, 1, 4, 1)); p.patterns[i].bars = b >= 4 ? .four : (b >= 2 ? .two : .one)
            if let sl = pt.slicer, sl == 0 || sl == 1 { p.patterns[i].slicer = sl == 1 }
            let trs = pt.tracks ?? []
            for t in 0..<min(trs.count, TrackLimits.playable.upperBound) {
                guard let tr = trs[t] else { continue }
                p.patterns[i].tracks[t].length = Int(clamp(tr.len, 1, 16, 16))
                p.patterns[i].tracks[t].division = StepDivision(rawValue: Int(clamp(tr.div, 0, 9, 5))) ?? .sixteenth
                let steps = tr.steps ?? []
                for k in 0..<min(steps.count, TrackLimits.steps) {
                    guard let s = steps[k], !s.isEmpty else { continue }
                    func f(_ i: Int) -> Double? { i < s.count ? s[i] : nil }
                    var st = Step()
                    st.velocity = Float(clamp(f(0), 0, 1, 0.8)); st.pan = Float(clamp(f(1), -1, 1, 0))
                    st.pitch = Int8(clamp(f(2), -12, 12, 0).rounded()); st.ratchet = UInt8(clamp(f(3), 1, 4, 1).rounded())
                    st.crush = Float(clamp(f(4), 0, 1, 0)); st.delaySend = Float(clamp(f(5), 0, 1, 0)); st.reverbSend = Float(clamp(f(6), 0, 1, 0))
                    st.chance = Float(clamp(f(7), 0, 1, 1)); let r = clamp(f(8), 0, 16, 0); st.fmRatio = r > 0 ? Float(max(0.25, r)) : 0
                    if clamp(f(9), 0, 1, 0) > 0 {   // v2 ring step
                        var m = clamp(f(10), 0, 99, Double(DrumLists.ringOscillator)).rounded(); if oldRing && m >= 9 { m = Double(DrumLists.ringOscillator) }
                        st.ringOn = true; st.ringMaster = UInt8(min(m, Double(DrumLists.ringOscillator)))
                        st.ringSlaves = UInt16(clamp(f(11), 0, Double((1 << TrackLimits.playable.upperBound) - 1), 0).rounded()); st.ringAmount = Float(clamp(f(12), 0, 1, 1)); st.ringHz = Float(clamp(f(13), 20, 5000, 220))
                    }
                    st.fold = Float(clamp(f(14), 0, 1, 0))   // v3
                    st.shiftSemitones = Float(clamp(f(15), -24, 24, 0)); st.shiftMix = Float(clamp(f(16), 0, 1, 1))   // v4
                    st.spectral = Float(clamp(f(17), 0, 1, 0)); st.spectralColour = Float(clamp(f(18), 0, 1, 0)); st.spectralMix = Float(clamp(f(19), 0, 1, 1))
                    let mt = clamp(f(20), -1, 1, -1); st.metalise = mt < 0 ? -1 : Float(mt)   // v6
                    st.slice = UInt8(clamp(f(21), 0, 32, 0).rounded()); st.reverseChance = Float(clamp(f(22), 0, 1, 0)); st.stutterChance = Float(clamp(f(23), 0, 1, 0))
                    p.patterns[i].tracks[t].steps[k] = st
                }
            }
        }
        let embedded = (f.sampleData ?? []).filter { !$0.key.isEmpty && Data(base64Encoded: $0.data) != nil }
        let available = librarySamples.union(embedded.map(\.key))
        var missing: [(Int, String)] = []
        for (t, ref) in (pr.samples ?? []).prefix(TrackLimits.playable.upperBound).enumerated() {
            guard let ref, !ref.key.isEmpty else { continue }
            if available.contains(ref.key) { p.tracks[t].sample = SampleRef(key: String(ref.key.prefix(24)), name: String((ref.name ?? "Sample").prefix(40))) }
            else { missing.append((t, ref.name ?? ref.key)); warnings.append("Track \(t + 1): the sample “\(ref.name ?? ref.key)” is not on this device.") }
            p.tracks[t].slices = slices(from: ref)   // v6: kept even when the sample is missing (it comes back with the sample)
        }
        for (k0, a) in f.midi?.ccMap ?? [:] { let k = k0 == "dr.warmth" ? "dr.temper" : k0; if DrumParameterKeys.all.contains(k) { p.midiCC[k] = MIDICCAssignment(cc: a.cc, ch: a.ch) } }   // v5: Warmth's CC → TEMPER
        // v2: slicer program and wires (v1: a clear program, no wires)
        let sl = pr.slicer ?? []
        p.slicer = (0..<DrumLists.slicerSlots).map { i in
            guard i < sl.count, !sl[i].isEmpty else { return SlicerSlot(action: .thru, source: i) }
            let a = SlicerAction(rawValue: Int(clamp(sl[i][0], 0, Double(SlicerAction.allCases.count - 1), 0).rounded())) ?? .thru
            return SlicerSlot(action: a, source: Int(clamp(sl[i].count > 1 ? sl[i][1] : nil, 0, Double(DrumLists.slicerSlots - 1), 0).rounded()))
        }
        p.wires = (pr.wires ?? []).compactMap { w0 -> ModWire? in
            var w = w0; if w.param == "dr.warmth" { w.param = "dr.temper"; w.amount = w.amount.map { -0.5 * $0 } }   // v5: a wire on Warmth → the warm half of TEMPER
            guard let s = w.source.flatMap(ModSource.init(id:)), let k = w.param, let spec = ParameterSpec.spec(forKey: k), spec.isModulatable, DrumParameterKeys.all.contains(k) else { return nil }
            return ModWire(source: s, param: k, amount: clamp(w.amount, -1, 1, 0.5))
        }.prefix(DrumLists.modWires).map { $0 }
        p.lfoShapes = LFOShapes.clean(pr.lfoShapes)   // 0.9.1 (older songs: sines)
        return StateReadResult(project: p, embeddedSamples: embedded, missingSamples: missing, warnings: warnings)
    }
    /// Vektur Pulse songs and kits: master hat choke → group A on tracks 3–4 (or none); a track with a sample → Sample engine.
    private static func migrate(_ p: inout DrumProject, params: [String: Double], samples: [StateFile.SampleRefJSON?]?) {
        for t in [2, 3] where params["t\(t + 1).choke"] == nil { p.tracks[t].values["choke"] = params["dr.choke"] == 0 ? 0 : 1 }
        // v5 (0.8): master Warmth (0…1) became TEMPER (−1 warm … +1 cold): an old value keeps its sound on the warm side
        if params["dr.temper"] == nil, let w = params["dr.warmth"], w.isFinite { p.master["dr.temper"] = -min(max(w, 0), 1) }
        for (t, s) in (samples ?? []).prefix(TrackLimits.playable.upperBound).enumerated() where s != nil && params["t\(t + 1).engine"] == nil { p.tracks[t].values["engine"] = 1 }
    }
    private static func legacy(_ d: [String: Any], bpm: Double?) -> StateFile {
        var pr = StateFile.Project()
        pr.tempo = bpm; pr.trackCount = (d["ntr"] as? Double) ?? 6; pr.selected = d["sel"] as? Double
        pr.chain = d["chain"] as? [Double]; pr.chainOn = d["chainOn"] as? Bool; pr.kit = d["preset"] as? String
        pr.params = (d["p"] as? [String: Any])?.compactMapValues { ($0 as? NSNumber)?.doubleValue }
        pr.patterns = (d["pats"] as? [Any])?.map { any -> StateFile.PatternJSON? in
            guard let pt = any as? [String: Any] else { return nil }
            return StateFile.PatternJSON(bars: (pt["bars"] as? NSNumber)?.doubleValue, tracks: (pt["tr"] as? [Any])?.map { tAny -> StateFile.TrackJSON? in
                guard let tr = tAny as? [String: Any] else { return nil }
                return StateFile.TrackJSON(len: (tr["len"] as? NSNumber)?.doubleValue, div: (tr["div"] as? NSNumber)?.doubleValue,
                                           steps: (tr["s"] as? [Any])?.map { ($0 as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } })
            })
        }
        pr.samples = (d["smp"] as? [Any])?.map { ($0 as? String).map { StateFile.SampleRefJSON(key: $0, name: nil) } }
        return StateFile(format: StateFile.format, version: 1, writer: nil, project: pr, midi: nil, sampleData: nil)   // no slicer / wires: defaults
    }
}

/// Every parameter key ("t3.fmindex", "gl.mix" …), for validating CC maps and files.
public enum DrumParameterKeys {
    public static let all: Set<String> = {
        var s = Set<String>()
        for t in 1...TrackLimits.playable.upperBound { for spec in ParameterSpec.track { s.insert("t\(t).\(spec.key)") } }
        for spec in ParameterSpec.master { s.insert(spec.key) }
        return s
    }()
}
