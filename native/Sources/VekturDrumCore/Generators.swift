// Vektur Drum 0.9 — the groove generator (BREAK LAB), the song generator (GENERATE) and the MIDI file export.
// Line for line with web/src/breaklab.js (blBase, blVariation, drumMidiFile) and web/src/songgen.js (songBuild), with
// the same random number generator, so a seed gives the same variation or song in the web app and on iOS.
// Pure Swift, no audio. Not yet compiled in Xcode (no Swift toolchain where it was written).
import Foundation

/// xorshift32 → 0…1 (= web blRng). Seeded with a JavaScript ToUint32 of the seed (0 → 1).
public struct GeneratorRNG {
    private var s: UInt32
    public init(seed: Double) {
        let m = fmod(seed.rounded(.towardZero), 4294967296.0)
        let u = UInt32(m < 0 ? m + 4294967296.0 : m)
        s = u == 0 ? 1 : u
    }
    public mutating func next() -> Double { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return Double(s) / 4294967296.0 }
    public mutating func int(_ a: Int, _ b: Int) -> Int { a + Int((next() * Double(b - a + 1)).rounded(.down)) }
}
private func jsRound(_ x: Double) -> Double { (x + 0.5).rounded(.down) }

// ---------------------------------------------------------------- groove generator
public struct GrooveCell: Hashable, Sendable {
    public var slice: Int          // 1…
    public var hit: HitClass
    public var velocity: Double
    public var reverseChance: Double = 0
    public var stutterChance: Double = 0
}
public struct GrooveOptions: Sendable {
    public var extreme = 0.45, lockKick = true, randomSnares = true, mutateGhosts = true, reverseChance = 0.0, stutterChance = 0.0
    public init() {}
}
public enum GrooveGenerator {
    /// The break's own groove on a 16-step bar: where each slice falls (= web blBase).
    public static func base(_ sx: SampleSlices, frames n: Int, rate: Double, projectTempo: Double) -> [GrooveCell?] {
        let stepLen: Double
        if sx.bpm > 0 { stepLen = 60 / sx.bpm * rate / 4 }
        else { let bars = max(1, jsRound(Double(n) / rate * (projectTempo > 0 ? projectTempo : 120) / 240)); stepLen = Double(n) / (16 * bars) }
        var base = [GrooveCell?](repeating: nil, count: 16)
        for (i, v) in sx.slices.enumerated() {
            let st = Int(jsRound(Double(v.start) / stepLen)), k = st % 16
            if base[k] == nil || st < 16 { base[k] = GrooveCell(slice: i + 1, hit: v.hit, velocity: v.hit == .ghost ? 0.5 : 0.9) }
        }
        return base
    }
    /// One variation (= web blVariation): every cell is still one of the break's own slices.
    public static func variation(_ base: [GrooveCell?], slices: [SliceSettings], seed: Double, index: Int, options o: GrooveOptions) -> [GrooveCell?] {
        var r = GeneratorRNG(seed: seed)
        let x = min(max(o.extreme * (0.55 + 0.9 * (Double(index) / 15)), 0), 1)
        func of(_ c: HitClass) -> [Int] { slices.enumerated().compactMap { $0.element.hit == c ? $0.offset + 1 : nil } }
        func pick(_ a: [Int], _ d: Int) -> Int { a.isEmpty ? d : a[Int((r.next() * Double(a.count)).rounded(.down))] }
        let snares = of(.snare), hats = of(.hat), ghosts = of(.ghost).isEmpty ? of(.snare) : of(.ghost)
        var out = base
        for k in 0..<16 {
            guard var c = out[k] else { continue }
            if c.hit == .kick && !o.lockKick && r.next() < x * 0.5 {
                let to = (k + (r.next() < 0.5 ? 1 : -1) * (1 + Int((r.next() * 2).rounded(.down))) + 16) % 16
                if out[to] == nil { out[to] = c; out[k] = nil }
            } else if c.hit == .snare && o.randomSnares {
                if r.next() < x { c.slice = pick(snares, c.slice); out[k] = c }
                if r.next() < x * 0.45 && k % 4 != 0 { let to = (k + (r.next() < 0.5 ? 1 : 2) + 16) % 16; if out[to] == nil { out[to] = c; out[k] = nil } }
            } else if c.hit == .hat {
                if r.next() < x * 0.3 { out[k] = nil } else if r.next() < x * 0.5 { c.slice = pick(hats, c.slice); out[k] = c }
            } else if c.hit == .ghost && o.mutateGhosts {
                if r.next() < x * 0.5 { out[k] = nil } else if r.next() < x * 0.5 { c.slice = pick(ghosts, c.slice); out[k] = c }
            }
        }
        if o.mutateGhosts && !ghosts.isEmpty { for k in 0..<16 where out[k] == nil && r.next() < x * 0.3 { let sl = pick(ghosts, 1); out[k] = GrooveCell(slice: sl, hit: .ghost, velocity: 0.38 + r.next() * 0.18) } }
        if o.randomSnares && !snares.isEmpty && x > 0.5 { for k in stride(from: 1, to: 16, by: 2) where out[k] == nil && r.next() < (x - 0.5) * 0.35 { out[k] = GrooveCell(slice: pick(snares, 1), hit: .snare, velocity: 0.7) } }
        if x > 0.6 { for k in 0..<16 { guard var c = out[k], !(c.hit == .kick && o.lockKick) else { continue }; if r.next() < (x - 0.6) * 0.5 { c.slice = 1 + Int((r.next() * Double(slices.count)).rounded(.down)); out[k] = c } } }
        for k in 0..<16 { guard var c = out[k] else { continue }; c.velocity = min(max(c.velocity + (r.next() - 0.5) * 0.12, 0.2), 1); c.reverseChance = o.reverseChance; c.stutterChance = o.stutterChance; out[k] = c }
        return out
    }
    /// A cell as a step (= web blWriteStep).
    public static func step(_ c: GrooveCell) -> Step { var s = Step(); s.velocity = Float(c.velocity); s.slice = UInt8(clamping: c.slice); s.reverseChance = Float(c.reverseChance); s.stutterChance = Float(c.stutterChance); return s }
}

// ---------------------------------------------------------------- song generator
public enum SongGenre: String, CaseIterable, Sendable {
    case dnb = "DnB", jungle = "Jungle", dubTechno = "Dub Techno", tripHop = "TripHop", hipHop = "Hip Hop", trance = "Trance", house = "House"
    var usesBreak: Bool { [.dnb, .jungle, .tripHop, .hipHop].contains(self) }
}
public enum SongGenerator {
    struct Def { let bpm: (Double, Double); let swing: Double; let p: [(String, Double)]; let groove: [(Int, String)]; let ghost: Bool; let fill: [Int]; var metal = false; var roll = false }
    // (= web SG_DEF; groove lanes in ascending track order, as JavaScript iterates integer keys)
    static let defs: [SongGenre: Def] = [
        .dnb: Def(bpm: (172, 176), swing: 0.04, p: [("t1.tune", -2), ("t1.decay", 0.45), ("t2.tune", 3), ("t2.decay", 0.2), ("t2.snap", 0.75), ("t3.decay", 0.04), ("t11.level", 0.22), ("dr.revsize", 0.45), ("t2.rev", 0.12), ("t8.dly", 0.3), ("dr.dlydiv", 5)],
                  groove: [(0, "x.........x....."), (1, "....x.......x..."), (2, "x.x.x.x.x.x.x.x."), (6, ".......x.....x.."), (10, "xxxxxxxxxxxxxxxx")], ghost: true, fill: [1, 9, 5]),
        .jungle: Def(bpm: (160, 168), swing: 0.06, p: [("t1.tune", -3), ("t1.decay", 0.6), ("t2.decay", 0.24), ("t2.snap", 0.7), ("t2.metal", 0.35), ("t3.decay", 0.05), ("t4.decay", 0.35), ("dr.temper", -0.25), ("tp.dust", 0.1), ("t2.rev", 0.15), ("dr.revsize", 0.5), ("t8.dly", 0.35), ("dr.dlydiv", 4)],
                     groove: [(0, "x.x.......x..x.."), (1, "....x..x.x..x..x"), (2, "x.x.x.x.x.x.x.x."), (3, "..............x."), (10, "x...x...x...x...")], ghost: true, fill: [1, 5, 9], metal: true),
        .dubTechno: Def(bpm: (118, 124), swing: 0.08, p: [("t1.tune", -4), ("t1.decay", 0.7), ("t1.tone", 0.3), ("t4.decay", 0.5), ("t4.dly", 0.35), ("t7.dly", 0.7), ("t7.rev", 0.5), ("t8.dly", 0.6), ("t8.rev", 0.4), ("dr.dlyfb", 0.72), ("dr.dlydiv", 3), ("dr.dlytone", 0.3), ("dr.revtype", 1), ("dr.revsize", 0.85), ("tp.wow", 0.25), ("tp.dust", 0.15), ("dr.temper", -0.35)],
                        groove: [(0, "x...x...x...x..."), (2, "x.x.x.x.x.x.x.x."), (3, "..x...x...x...x."), (6, "...x.......x..x."), (7, "......x.......x."), (11, "x.xxx.xxx.xxx.xx")], ghost: false, fill: [6, 7]),
        .tripHop: Def(bpm: (80, 92), swing: 0.32, p: [("t1.tune", -3), ("t1.decay", 0.55), ("t2.tune", -2), ("t2.decay", 0.32), ("t2.bits", 11), ("t2.rev", 0.3), ("t3.bits", 12), ("tp.dust", 0.35), ("tp.wow", 0.35), ("tp.flutter", 0.2), ("dr.temper", -0.5), ("dr.revsize", 0.7)],
                      groove: [(0, "x......x..x....."), (1, "....x.......x..."), (2, "x.x.x.x.x.x.x.x."), (5, ".............x.."), (6, "..........x....x")], ghost: true, fill: [1, 5]),
        .hipHop: Def(bpm: (86, 96), swing: 0.26, p: [("t1.tune", -1), ("t1.decay", 0.5), ("t2.decay", 0.26), ("t2.snap", 0.65), ("t3.decay", 0.05), ("t7.level", 0.45), ("dr.temper", -0.3), ("tp.dust", 0.2), ("t2.rsmp", 0.3), ("t1.rsmp", 0.2)],
                     groove: [(0, "x..x....x.x....."), (1, "....x.......x..."), (2, "x.x.x.x.x.x.x.x."), (3, "..............x."), (6, ".......x........")], ghost: true, fill: [1, 0]),
        .trance: Def(bpm: (136, 140), swing: 0, p: [("t1.tune", -1), ("t1.decay", 0.5), ("t1.snap", 0.6), ("t4.decay", 0.25), ("t5.rev", 0.3), ("t5.decay", 0.3), ("dr.revsize", 0.7), ("t11.level", 0.3), ("t8.dly", 0.4), ("dr.dlydiv", 4)],
                     groove: [(0, "x...x...x...x..."), (2, "xxxxxxxxxxxxxxxx"), (3, "..x...x...x...x."), (4, "....x.......x..."), (10, "..x...x...x...x.")], ghost: false, fill: [1, 4], roll: true),
        .house: Def(bpm: (122, 126), swing: 0.14, p: [("t1.tune", -2), ("t1.decay", 0.42), ("t4.decay", 0.3), ("t5.decay", 0.28), ("t5.rev", 0.2), ("t12.level", 0.4), ("t7.level", 0.45)],
                    groove: [(0, "x...x...x...x..."), (2, "x.x.x.x.x.x.x.x."), (3, "..x...x...x...x."), (4, "....x.......x..."), (6, "...x..x.......x."), (11, "xxxxxxxxxxxxxxxx")], ghost: false, fill: [4, 6]),
    ]
    public struct Song { public var bpm: Double; public var params: [String: Double]; public var patterns: [Pattern]; public var chain: [Int] }
    /// The song as data (= web songBuild). `breakTrack`: a track whose sample has ≥ 4 slices (chopped in on the breakbeat genres).
    public static func build(_ genre: SongGenre, seed: UInt32, breakTrack: (track: Int, slices: Int)?) -> Song {
        let G = defs[genre]!
        var r = GeneratorRNG(seed: Double(seed) * 2654435761 + 17)
        let bpm = jsRound((G.bpm.0 + r.next() * (G.bpm.1 - G.bpm.0)) * 2) / 2
        func step(_ vel: Double, _ rat: Int = 1) -> Step { var s = Step(); s.velocity = Float(jsRound(min(max(vel, 0.1), 1) * 100) / 100); s.ratchet = UInt8(rat); return s }
        func lane(_ str: String, _ accent: Bool) -> [Step?] {
            Array(str).enumerated().map { k, ch in
                guard ch == "x" else { return nil }
                if accent && k % 4 == 0 { return step(0.95) }
                return step(0.82 - Double(k % 2) * 0.12 + (r.next() - 0.5) * 0.08)
            }
        }
        let keepFor: [String: [Int]] = ["intro": [0, 2, 11, 10], "break": [2, 3, 6, 7, 10, 11], "build": [0, 1, 4, 2], "outro": [0, 2]]
        func part(_ name: String) -> Pattern {
            var pt = Pattern(); for t in 0..<pt.tracks.count { pt.tracks[t].division = .sixteenth }
            let keep = keepFor[name]
            for (t, str) in G.groove {
                if let keep, !keep.contains(t) { continue }
                var a = lane(str, t == 0)
                if name == "var" || name == "drop" {
                    a = a.map { s in s ?? ((t == 2 && r.next() < 0.25) ? step(0.45) : nil) }
                    a = a.map { s in (s != nil && t != 0 && r.next() < 0.08) ? nil : s }
                }
                if name == "break" && t == 0 { a = a.map { _ in nil } }
                pt.tracks[t].steps = a
            }
            if G.ghost && ["groove", "var", "drop"].contains(name) {
                for k in 0..<16 where pt.tracks[1].steps[k] == nil && k % 2 == 1 { if r.next() < 0.22 { pt.tracks[1].steps[k] = step(0.3 + r.next() * 0.12) } }
            }
            if name == "fill" || (name == "build" && G.roll) {
                let tr = G.fill[0]
                for k in 8..<16 where r.next() < (name == "build" ? 0.9 : 0.55) {
                    let rat = name == "build" && k > 11 ? 2 : (r.next() < 0.25 ? 2 : 1)
                    pt.tracks[tr].steps[k] = step(0.5 + Double(k) / 32, rat)
                }
                for t in G.fill.dropFirst() { let k = r.int(10, 15); pt.tracks[t].steps[k] = step(0.8) }
            }
            if name == "build" { pt.tracks[1].steps = pt.tracks[1].steps.enumerated().map { k, s in s ?? step(0.35 + Double(k) / 24) } }
            if name == "drop" && G.metal { pt.tracks[1].steps = pt.tracks[1].steps.map { s in s.map { var v = $0; v.metalise = 0.6; return v } } }
            if name == "drop", pt.tracks[0].steps[0] != nil { pt.tracks[0].steps[0]!.velocity = 1 }
            if let b = breakTrack, ["groove", "var", "drop", "fill"].contains(name) {
                let n = b.slices, ext = ["groove": 0.1, "var": 0.35, "fill": 0.6, "drop": 0.5][name]!
                for k in 0..<16 {
                    var sl = (k % n) + 1; if r.next() < ext { sl = r.int(1, n) }
                    if name == "groove" && r.next() < 0.1 { continue }
                    var v = Step(); v.velocity = 0.85; v.slice = UInt8(sl)
                    if name != "groove" { v.reverseChance = Float(ext * 0.25); v.stutterChance = Float(ext * 0.3) }
                    pt.tracks[b.track].steps[k] = v
                }
                if name != "drop" { for t in [0, 1, 2] { pt.tracks[t].steps = pt.tracks[t].steps.enumerated().map { k, s in s != nil && (t != 0 || k % 8 == 0) ? s : nil } } }
            }
            if name == "build" || name == "fill" { pt.slicer = genre == .jungle || genre == .dnb ? true : nil }
            return pt
        }
        let patterns = ["intro", "groove", "var", "fill", "break", "build", "drop", "outro"].map(part)
        let forms = [[0, 1, 1, 2, 3, 4, 5, 6, 6, 2, 3, 7], [0, 1, 2, 1, 3, 4, 4, 5, 6, 6, 1, 7], [0, 0, 1, 2, 1, 3, 4, 5, 6, 2, 6, 7]]
        let chain = forms[r.int(0, forms.count - 1)]
        var params: [String: Double] = ["dr.swing": G.swing]; for (k, v) in G.p { params[k] = v }
        return Song(bpm: bpm, params: params, patterns: patterns, chain: chain)
    }
    /// Replaces the song in `p` (= web songGenerate): the kit is reset to its defaults and voiced for the genre; samples stay.
    public static func apply(_ genre: SongGenre, seed: UInt32, to p: inout DrumProject, useBreak: Bool = true) {
        var bt: Int? = nil
        if useBreak && genre.usesBreak { bt = (0..<TrackLimits.playable.upperBound).first { p.tracks[$0].sample != nil && (p.tracks[$0].slices?.slices.count ?? 0) >= 4 } }
        let brk = bt.map { (track: $0, slices: min(16, p.tracks[$0].slices!.slices.count)) }
        let song = build(genre, seed: seed, breakTrack: brk)
        for t in 0..<TrackLimits.capacity { p.tracks[t].values = [:]; if p.tracks[t].sample != nil && t != bt { p.tracks[t].values["engine"] = 0 } }
        let ch = p.master["dr.ch"]; p.master = [:]; if let ch { p.master["dr.ch"] = ch }   // the MIDI channel stays
        for (k, v) in song.params {
            if k.hasPrefix("t"), let dot = k.firstIndex(of: "."), let n = Int(k.dropFirst().prefix(upTo: dot)) { p.tracks[n - 1].values[String(k[k.index(after: dot)...])] = v }
            else { p.master[k] = v }
        }
        if let t = bt {
            p.tracks[t].values["engine"] = 1; p.tracks[t].values["tsmode"] = 2; p.tracks[t].values["decay"] = 3; p.tracks[t].values["level"] = 0.85
            if genre == .jungle { p.tracks[t].values["rsmp"] = 0.45; p.tracks[t].values["smodel"] = 0; p.tracks[t].values["rsmode"] = 0 }
            if genre == .hipHop || genre == .tripHop { p.tracks[t].values["rsmp"] = 0.35; p.tracks[t].values["smodel"] = 3 }
        }
        if genre == .jungle || genre == .dnb { p.master["sl.on"] = 0 }
        p.patterns = song.patterns; p.chain = song.chain; p.chainEnabled = true; p.selectedPattern = 1; p.trackCount = TrackLimits.playable.upperBound
        p.currentKitName = "\(genre.rawValue) · \(seed)"; p.tempo = song.bpm
        p.slicer = (0..<DrumLists.slicerSlots).map { SlicerSlot(action: $0 % 8 == 6 ? .stutter : $0 % 8 == 7 ? .reverse : .thru, source: $0) }
        p.wires = []
    }
}

// ---------------------------------------------------------------- MIDI export
public enum MIDIFileExport {
    /// Standard MIDI file, type 1, 96 PPQ (= web drumMidiFile): the pattern (or the chain when it is on); GM drum notes on
    /// channel 10; a sample track whose steps choose slices is a slice lane — notes 36 + slice, on its own channel.
    public static func data(_ p: DrumProject) -> Data {
        let PPQ = 96
        func vlq(_ n0: Int) -> [UInt8] { var n = n0; var b: [UInt8] = [UInt8(n & 0x7f)]; n >>= 7; while n > 0 { b.insert(UInt8((n & 0x7f) | 0x80), at: 0); n >>= 7 }; return b }
        func trk(_ ev0: [(Int, Int, [UInt8])]) -> [UInt8] {
            let ev = ev0.enumerated().sorted { a, b in a.element.0 != b.element.0 ? a.element.0 < b.element.0 : (a.element.1 != b.element.1 ? a.element.1 < b.element.1 : a.offset < b.offset) }.map(\.element)
            var out: [UInt8] = []; var last = 0
            for (tk, _, bytes) in ev { out += vlq(tk - last) + bytes; last = tk }
            out += [0, 0xff, 0x2f, 0]
            let n = out.count; return [0x4d, 0x54, 0x72, 0x6b, UInt8((n >> 24) & 255), UInt8((n >> 16) & 255), UInt8((n >> 8) & 255), UInt8(n & 255)] + out
        }
        func name(_ s: String) -> [UInt8] { let b = Array(s.utf8); return [0xff, 0x03] + vlq(b.count) + b }
        let us = Int(jsRound(60_000_000 / (p.tempo > 0 ? p.tempo : 120)))
        var tracks: [[UInt8]] = [trk([(0, 0, [0xff, 0x51, 3, UInt8((us >> 16) & 255), UInt8((us >> 8) & 255), UInt8(us & 255)]), (0, 0, [0xff, 0x58, 4, 4, 2, 24, 8]), (0, 1, name("Vektur Drum"))])]
        let order = p.chainEnabled && !p.chain.isEmpty ? Array(p.chain.prefix(16)) : [p.selectedPattern]
        var chn = 0
        for t in 0..<p.trackCount {
            let engine = Int((p.tracks[t].values["engine"] ?? (ParameterSpec.trackDefaults[t]["engine"] ?? 0)).rounded())
            let slice = engine == 1 && p.patterns.contains { $0.tracks[t].steps.contains { ($0?.slice ?? 0) > 0 } }
            var ch = 9; if slice { if chn == 9 { chn += 1 }; ch = chn; chn += 1 }
            var ev: [(Int, Int, [UInt8])] = []; var at = 0
            for pi in order {
                let pt = p.patterns[min(max(pi, 0), TrackLimits.patterns - 1)], tr = pt.tracks[t], beats = 4 * pt.bars.rawValue, sb = tr.division.beats
                let steps = Int(jsRound(Double(beats) / sb))
                for k in 0..<steps {
                    guard let s = tr.steps[k % max(1, tr.length)] else { continue }
                    let vel = UInt8(min(max(Int(jsRound(Double(s.velocity) * 127)), 1), 127)), rat = Int(s.ratchet)
                    let trackSlice = Int((p.tracks[t].values["slice"] ?? 1).rounded())
                    let note = slice ? UInt8(min(max(36 + (s.slice > 0 ? Int(s.slice) - 1 : trackSlice - 1), 0), 127)) : UInt8(ParameterSpec.trackNotes[t])
                    for rr in 0..<rat {
                        let on = at + Int(jsRound((Double(k) * sb + Double(rr) * sb / Double(rat)) * Double(PPQ))), len = max(1, Int(jsRound(sb / Double(rat) * Double(PPQ) * 0.9)))
                        ev.append((on, 1, [0x90 | UInt8(ch), note, vel])); ev.append((on + len, 0, [0x80 | UInt8(ch), note, 0]))
                    }
                }
                at += Int(jsRound(Double(beats) * Double(PPQ)))
            }
            if !ev.isEmpty { ev.append((0, -1, name((slice ? "Slices " : "") + "T\(t + 1)"))); tracks.append(trk(ev)) }
        }
        let hd: [UInt8] = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, UInt8((tracks.count >> 8) & 255), UInt8(tracks.count & 255), 0, UInt8(PPQ)]
        return Data(hd + tracks.flatMap { $0 })
    }
}
