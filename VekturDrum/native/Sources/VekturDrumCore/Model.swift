// Vektur Drum — the project model: the source of truth for the music. Value types, Codable, no audio code.
// Shapes follow Vektur Pulse's S.drums (8 patterns × tracks × 16 steps, chain, per-track samples, user kits),
// with the track count made a setting (6–12 since 0.9) and every track carrying its sound engine.
import Foundation

public enum StepDivision: Int, Codable, CaseIterable, Sendable {   // Vektur Pulse DRUM_DIVS, same order
    case quarter, quarterTriplet, eighth, eighthTriplet, eighthDotted,
         sixteenth, sixteenthTriplet, sixteenthDotted, thirtySecond, thirtySecondTriplet

    public var beats: Double {
        [1.0, 2.0 / 3.0, 0.5, 1.0 / 3.0, 0.75, 0.25, 1.0 / 6.0, 0.375, 0.125, 1.0 / 12.0][rawValue]
    }
    public var label: String { ["1/4", "1/4T", "1/8", "1/8T", "1/8.", "1/16", "1/16T", "1/16.", "1/32", "1/32T"][rawValue] }
}

/// One step: Vektur Pulse's 8 fields, the FM ratio and (NEW) ring modulation. A step that is off is `nil` in TrackPattern.steps.
public struct Step: Codable, Hashable, Sendable {
    public var velocity: Float = 0.8       // 0…1
    public var pan: Float = 0              // −1…1, added to the track pan
    public var pitch: Int8 = 0             // −12…12 semitones
    public var ratchet: UInt8 = 1          // 1…4
    public var crush: Float = 0            // 0…1, 0 = off
    public var delaySend: Float = 0        // 0…1, added to the track send
    public var reverbSend: Float = 0       // 0…1
    public var chance: Float = 1           // 0…1
    public var fmRatio: Float = 0          // FM tracks: 0.25…16, 0 = the track's ratio
    // NEW: ring modulation, for the length of this step
    public var ringOn = false
    public var ringMaster: UInt8 = UInt8(DrumLists.ringOscillator)   // 0–11 = track 1–12, 12 = the sine oscillator (0.9; files before v6 used 9)
    public var ringSlaves: UInt16 = 0      // bit t = track t+1 is multiplied by the master
    public var ringAmount: Float = 1       // 0…1
    public var ringHz: Float = 220         // oscillator, 20…5000 Hz
    public var fold: Float = 0             // NEW (0.7): this step's wavefolder, 0…1 (0 = off)
    // NEW (0.8): this step's pitch shifter and spectral processor (any engine)
    public var shiftSemitones: Float = 0   // −24…24, 0 = off
    public var shiftMix: Float = 1         // 0…1
    public var spectral: Float = 0         // 0…1, 0 = off
    public var spectralColour: Float = 0   // 0…1: Smear · Shift · Harmonic · Robot · Whisper · Freeze (+ each one's setting)
    public var spectralMix: Float = 1      // 0…1
    // NEW (0.9): the vintage sampler on this step
    public var metalise: Float = -1        // −1 = the slice's, else the track's · 0…1 this step's own METALISE
    public var slice: UInt8 = 0            // 0 = the track's Slice · 1…32 this slice of the track's sample
    public var reverseChance: Float = 0    // 0…1: chance the hit plays its slice backwards
    public var stutterChance: Float = 0    // 0…1: chance of a 1/32 stutter (2–3 repeats)
    public var hasShiftOrSpectral: Bool { shiftSemitones != 0 || spectral > 0 }
    public var hasSampler: Bool { metalise >= 0 || slice > 0 || reverseChance > 0 || stutterChance > 0 }
    public init() {}

    private enum CodingKeys: String, CodingKey { case velocity, pan, pitch, ratchet, crush, delaySend, reverbSend, chance, fmRatio, ringOn, ringMaster, ringSlaves, ringAmount, ringHz, fold, shiftSemitones, shiftMix, spectral, spectralColour, spectralMix, metalise, slice, reverseChance, stutterChance }
    /// Tolerant: kits and documents saved before a field existed decode with its default.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self); var s = Step()
        s.velocity = try c.decodeIfPresent(Float.self, forKey: .velocity) ?? s.velocity; s.pan = try c.decodeIfPresent(Float.self, forKey: .pan) ?? s.pan
        s.pitch = try c.decodeIfPresent(Int8.self, forKey: .pitch) ?? s.pitch; s.ratchet = try c.decodeIfPresent(UInt8.self, forKey: .ratchet) ?? s.ratchet
        s.crush = try c.decodeIfPresent(Float.self, forKey: .crush) ?? s.crush; s.delaySend = try c.decodeIfPresent(Float.self, forKey: .delaySend) ?? s.delaySend
        s.reverbSend = try c.decodeIfPresent(Float.self, forKey: .reverbSend) ?? s.reverbSend; s.chance = try c.decodeIfPresent(Float.self, forKey: .chance) ?? s.chance
        s.fmRatio = try c.decodeIfPresent(Float.self, forKey: .fmRatio) ?? s.fmRatio
        s.ringOn = try c.decodeIfPresent(Bool.self, forKey: .ringOn) ?? s.ringOn; s.ringMaster = try c.decodeIfPresent(UInt8.self, forKey: .ringMaster) ?? s.ringMaster
        s.ringSlaves = try c.decodeIfPresent(UInt16.self, forKey: .ringSlaves) ?? s.ringSlaves; s.ringAmount = try c.decodeIfPresent(Float.self, forKey: .ringAmount) ?? s.ringAmount
        s.ringHz = try c.decodeIfPresent(Float.self, forKey: .ringHz) ?? s.ringHz
        s.fold = try c.decodeIfPresent(Float.self, forKey: .fold) ?? s.fold
        s.shiftSemitones = try c.decodeIfPresent(Float.self, forKey: .shiftSemitones) ?? s.shiftSemitones; s.shiftMix = try c.decodeIfPresent(Float.self, forKey: .shiftMix) ?? s.shiftMix
        s.spectral = try c.decodeIfPresent(Float.self, forKey: .spectral) ?? s.spectral; s.spectralColour = try c.decodeIfPresent(Float.self, forKey: .spectralColour) ?? s.spectralColour
        s.spectralMix = try c.decodeIfPresent(Float.self, forKey: .spectralMix) ?? s.spectralMix
        s.metalise = try c.decodeIfPresent(Float.self, forKey: .metalise) ?? s.metalise; s.slice = try c.decodeIfPresent(UInt8.self, forKey: .slice) ?? s.slice
        s.reverseChance = try c.decodeIfPresent(Float.self, forKey: .reverseChance) ?? s.reverseChance; s.stutterChance = try c.decodeIfPresent(Float.self, forKey: .stutterChance) ?? s.stutterChance
        self = s
    }
}

/// NEW: one slice of the Slicer program (vd_slice_action order).
public enum SlicerAction: Int, Codable, CaseIterable, Sendable {
    case thru = 0, repeatPrevious, stutter, reverse, tapeStop, tapeStart, pitch, speed, gate, permute, scratch, echo
    public var name: String { DrumLists.slicerActions[rawValue] }
    public var short: String { DrumLists.slicerShort[rawValue] }
}
public struct SlicerSlot: Codable, Hashable, Sendable {
    public var action: SlicerAction = .thru
    public var source: Int = 0                 // the slice a PERMUTE plays, 0…31
    public init(action: SlicerAction = .thru, source: Int = 0) { self.action = action; self.source = min(max(source, 0), DrumLists.slicerSlots - 1) }
    /// A clear program: every slice passes through (and would permute to itself).
    public static var clearProgram: [SlicerSlot] { (0..<DrumLists.slicerSlots).map { SlicerSlot(action: .thru, source: $0) } }
}

/// NEW: a modulation source (vd_mod_source order) and a wire from it to any dial.
public enum ModSource: Int, Codable, CaseIterable, Sendable {
    case lfo1 = 0, lfo2, lfo3, envelope, chaos
    public var id: String { DrumLists.modSourceIDs[rawValue] }           // as in state files: "lfo1" … "chaos"
    public var name: String { DrumLists.modSources[rawValue] }
    public init?(id: String) { guard let i = DrumLists.modSourceIDs.firstIndex(of: id) else { return nil }; self.init(rawValue: i) }
}
public struct ModWire: Codable, Hashable, Sendable {
    public var source: ModSource
    public var param: String                   // parameter key: "t3.decay", "sl.density", "lfo1.rate" …
    public var amount: Double                  // −1…1 of the dial's travel
    public init(source: ModSource, param: String, amount: Double) { self.source = source; self.param = param; self.amount = min(max(amount, -1), 1) }
}

public struct TrackPattern: Codable, Hashable, Sendable {
    public var length: Int = TrackLimits.steps                    // 1…16
    public var division: StepDivision = .sixteenth
    public var steps: [Step?] = Array(repeating: nil, count: TrackLimits.steps)
    public init() {}
}

public struct Pattern: Codable, Hashable, Sendable {
    public enum Bars: Int, Codable, Sendable { case one = 1, two = 2, four = 4 }
    public var bars: Bars = .one
    /// NEW (0.9): this pattern's own Slicer — nil follows the SLICER switch, false keeps it dry, true slices it.
    public var slicer: Bool? = nil
    /// Always TrackLimits.capacity entries: hidden tracks keep their data when the track count is lowered.
    public var tracks: [TrackPattern] = Array(repeating: TrackPattern(), count: TrackLimits.capacity)
    public init() {}
    public var isEmpty: Bool { !tracks.contains { $0.steps.contains { $0 != nil } } }
}

public enum TrackEngineKind: Int, Codable, CaseIterable, Sendable {   // vd_track_engine
    case analog = 0, sample = 1, fm = 2
}

/// A sample in the shared library, identified by the hash of its file bytes (as Vektur Pulse: dedupes imports, and
/// lets a project or kit refer to a sample without embedding it).
public struct SampleRef: Codable, Hashable, Sendable {
    public var key: String           // content hash
    public var name: String

    public init(key: String, name: String) {
        self.key = key
        self.name = name
    }
}

/// NEW (0.9): a track's sample editor data (BREAK LAB) — the transient marks, the slices and their settings, the
/// sample's tempo and the detector's settings. Same fields as the web app's S.drums.sx[t] (web/src/slices.js).
public struct TransientMark: Codable, Hashable, Sendable {
    public var position: Int        // frames of the decoded sample
    public var manual = false       // placed or moved by hand: kept when detecting again
    public var accepted = true      // rejected marks don't cut slices
    public var hit: HitClass = .other
    public init(position: Int, manual: Bool = false, accepted: Bool = true, hit: HitClass = .other) { self.position = position; self.manual = manual; self.accepted = accepted; self.hit = hit }
}
public enum HitClass: Int, Codable, CaseIterable, Sendable { case kick = 0, snare, hat, ghost, other
    public var name: String { ["Kick", "Snare", "Hat", "Ghost", "Other"][rawValue] } }
public struct SliceSettings: Codable, Hashable, Sendable {
    public var start: Int, end: Int             // frames
    public var pitch: Double = 0                // semitones −24…24
    public var gain: Double = 1                 // 0…2
    public var pan: Double = 0                  // −1…1
    public var attackMs: Double = 0             // 0…200
    public var gate: Double = 1                 // 0.02…1
    public var reverse = false
    public var stretch: Double = 1              // ×0.25…4
    public var stutter = 0                      // repeats 0…8
    public var stutterBeats: Double = 0.125     // 1/32
    public var metalise: Double = -1            // −1 = the track's
    public var hit: HitClass = .other
    public init(start: Int, end: Int, hit: HitClass = .other) { self.start = start; self.end = max(end, start + 2); self.hit = hit }
}
public struct SampleSlices: Codable, Hashable, Sendable {
    public enum Mode: Int, Codable, CaseIterable, Sendable { case transient = 0, equal, beat, bar, grid
        public var name: String { ["Transient", "Equal", "Beat", "Bar", "Grid"][rawValue] } }
    public static let grids: [(label: String, beats: Double)] = [("1/4", 1), ("1/8", 0.5), ("1/16", 0.25), ("1/32", 0.125), ("1/8T", 1.0 / 3.0), ("1/16T", 1.0 / 6.0)]
    public static let maxSlices = 32
    public var bpm: Double = 0                  // the sample's own tempo (0 = unknown)
    public var sensitivity: Double = 0.5
    public var gapMs: Double = 50               // minimum spacing
    public var mode: Mode = .transient
    public var divisions = 8                    // Equal (and grids without a tempo)
    public var grid = 2                         // index into grids
    public var marks: [TransientMark] = []
    public var slices: [SliceSettings] = []
    public init() {}
    public var isEmpty: Bool { marks.isEmpty && slices.isEmpty && bpm == 0 }
    /// Cuts the sample into slices by the mode (= web sxMakeSlices); a slice starting where an old one started keeps its settings.
    public mutating func makeSlices(frames n: Int, rate: Double) {
        let beat = bpm > 0 ? 60 / bpm * rate : 0
        var pts: [Int] = []
        switch mode {
        case .transient: pts = marks.filter(\.accepted).map(\.position)
        case .equal: pts = (0..<divisions).map { Int((Double($0 * n) / Double(divisions)).rounded()) }
        default:
            let step = mode == .beat ? beat : mode == .bar ? beat * 4 : beat * Self.grids[min(max(grid, 0), Self.grids.count - 1)].beats
            if step > 16 { var p = 0.0; while p < Double(n - 16) { pts.append(Int((p).rounded())); p += step } }
            else { pts = (0..<divisions).map { Int((Double($0 * n) / Double(divisions)).rounded()) } }
        }
        pts = Array(Set(pts.filter { $0 >= 0 && $0 < n - 8 })).sorted().prefix(Self.maxSlices).map { $0 }
        if pts.isEmpty { pts = [0] }
        let near = Int((0.01 * rate).rounded()), old = slices
        slices = pts.enumerated().map { i, s in
            let e = i + 1 < pts.count ? pts[i + 1] : n
            let mk = marks.first { abs($0.position - s) < near }
            if var o = old.first(where: { abs($0.start - s) < near }) { o.start = s; o.end = e; return o }
            return SliceSettings(start: s, end: e, hit: mk?.hit ?? .other)
        }
    }
}

public struct Track: Codable, Hashable, Sendable {
    public var engine: TrackEngineKind = .analog
    public var sample: SampleRef?                         // used when engine == .sample
    public var slices: SampleSlices?                      // NEW (0.9): the BREAK LAB data for the sample (nil = none yet)
    /// Parameter values by key — Vektur Pulse's keys ("tune", "decay", "dly" …; FM keys from Stage 7).
    /// Missing = the spec default. Keys keep project and kit files readable and import Pulse kits directly.
    public var values: [String: Double] = [:]
    public init() {}
}

/// A kit: the sound and the music, like a Vektur Pulse preset (params + 8 patterns + chain + track samples).
public struct Kit: Codable, Hashable, Sendable, Identifiable {
    public var id = UUID()
    public var name: String
    public var category: String?
    public var trackCount: Int
    public var tracks: [Track]
    public var master: [String: Double]
    public var patterns: [Pattern]
    public var chain: [Int]
    public var chainEnabled: Bool
    public var slicer: [SlicerSlot]?           // NEW (nil in older kits: a clear program)
    public var wires: [ModWire]?               // NEW (nil in older kits: no wires)
    public var lfoShapes: [[Double]]? = nil    // NEW (0.9.1): the LFOs' drawn shapes (nil in older kits: sines)
    public var tempo: Double? = nil            // NEW (0.8): the kit's own tempo (80s Electro, Breakbeat, Ambient); the standalone app takes it, a host leads in the plug-in
    public var isInit: Bool { category == "Init" }   // NEW (0.8): INIT — every parameter at its default, empty patterns
}

extension Kit {
    /// A kit from a decoded song (the factory kits ship as vektur-drum-state documents: one reader for everything).
    public init(name: String, category: String?, project p: DrumProject) {
        self.init(name: name, category: category, trackCount: p.trackCount, tracks: p.tracks, master: p.master,
                  patterns: p.patterns, chain: p.chain, chainEnabled: p.chainEnabled, slicer: p.slicer, wires: p.wires, lfoShapes: p.lfoShapes)
    }
}

public struct DrumProject: Codable, Hashable, Sendable {
    public static let schemaVersion = 1
    public var schemaVersion = DrumProject.schemaVersion
    public var name = "Untitled"
    public var tempo: Double = 120                         // standalone clock; ignored when a host or MIDI clock leads
    public var trackCount = 12 {                           // 6…12 (0.9)
        didSet { trackCount = min(max(trackCount, TrackLimits.playable.lowerBound), TrackLimits.playable.upperBound) }
    }
    public var tracks: [Track] = Array(repeating: Track(), count: TrackLimits.capacity)
    public var master: [String: Double] = [:]
    public var patterns: [Pattern] = Array(repeating: Pattern(), count: TrackLimits.patterns)
    public var chain: [Int] = []
    public var chainEnabled = false
    public var selectedPattern = 0
    public var currentKitName: String?
    /// MIDI learn: parameter key → CC. Saved with the song (in a host, each instance keeps its own mapping).
    public var midiCC: [String: MIDICCAssignment] = [:]
    /// NEW: the Slicer program (32 slices) and the modulation matrix (up to 32 wires).
    public var slicer: [SlicerSlot] = SlicerSlot.clearProgram
    public var wires: [ModWire] = []
    /// NEW (0.9.1): the three LFOs' drawn shapes (16 points each, −1…1), played when an LFO's shape is Draw.
    public var lfoShapes: [[Double]] = LFOShapes.defaults
    public init() {}
}

/// NEW (0.9.1): the LFO DRAW shapes (= web drumLfoDefault / drumLfoClean).
public enum LFOShapes {
    public static let points = 16
    public static let drawShape = 5   // lfoN.shape index of "Draw"
    public static var defaultShape: [Double] { (0..<points).map { j in (sin(2 * Double.pi * Double(j) / Double(points)) * 1000).rounded() / 1000 } }
    public static var defaults: [[Double]] { Array(repeating: defaultShape, count: 3) }
    /// Three rows of 16 points, clamped to −1…1 and rounded to 0.001; a missing row is a sine, a bad point 0.
    public static func clean(_ a: [[Double]]?) -> [[Double]] {
        (0..<3).map { i in
            guard let a, i < a.count else { return defaultShape }
            let r = a[i]
            return (0..<points).map { j in let v = j < r.count ? r[j] : 0; return v.isFinite ? (min(max(v, -1), 1) * 1000).rounded() / 1000 : 0 }
        }
    }
}
