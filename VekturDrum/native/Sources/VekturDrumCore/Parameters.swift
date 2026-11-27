// Vektur Drum — parameter addressing and specs (Swift side of vd_engine.h).
// Addresses are permanent: they become AUParameter addresses, and hosts store automation by them.
import Foundation

/// A parameter's stable address. Mirrors the layout in vd_engine.h (checked by ParameterLayoutTests).
public struct ParameterID: Hashable, Codable, Sendable, CustomStringConvertible {
    public let address: UInt32

    public static let masterBase: UInt32 = 0
    public static let trackBase: UInt32 = 1024
    public static let trackStride: UInt32 = 256
    public static let trackFMBase: UInt32 = 64

    public init(address: UInt32) { self.address = address }

    public static func master(_ p: MasterParameter) -> ParameterID { ParameterID(address: masterBase + p.rawValue) }
    public static func track(_ track: Int, _ p: TrackParameter) -> ParameterID {
        precondition((0..<TrackLimits.capacity).contains(track), "track out of range")
        return ParameterID(address: trackBase + UInt32(track) * trackStride + p.rawValue)
    }

    /// Track index and track-local index, or nil for a master parameter.
    public var trackSlot: (track: Int, index: UInt32)? {
        guard address >= Self.trackBase else { return nil }
        let rel = address - Self.trackBase
        return (Int(rel / Self.trackStride), rel % Self.trackStride)
    }

    public var description: String {
        if let s = trackSlot { return "t\(s.track + 1).\(TrackParameter(rawValue: s.index).map { "\($0)" } ?? String(s.index))" }
        return "master.\(MasterParameter(rawValue: address).map { "\($0)" } ?? String(address))"
    }
}

public enum TrackLimits {
    public static let capacity = 16          // VD_TRACK_CAPACITY — storage, never the limit
    public static let playable = 6...12      // VD_TRACKS_MIN…VD_TRACKS_MAX (0.9: 12)
    public static let patterns = 8           // VD_PATTERNS
    public static let steps = 16             // VD_STEPS
    public static let chainMax = 16          // VD_CHAIN_MAX
}

/// Track-local indices (vd_track_param). 0–14 are Vektur Pulse's, in its order.
public enum TrackParameter: UInt32, CaseIterable, Sendable {
    case model = 0, tune, decay, tone, snap, level, pan, bend, bits, rate, delaySend, reverbSend, mute, solo, bendRate
    // new in Vektur Drum
    case engine = 32, chokeGroup, midiNote, sweep, sweepTime
    case eq1Freq = 40, eq1Gain, eq2Freq, eq2Gain, eq3Freq, eq3Gain, eq4Freq, eq4Gain   // NEW (0.7): 4-band EQ
    case metalise = 48, resample, transientMode, transientSensitivity, slice, tuneMode, stretch, samplerModel   // NEW (0.9): vintage sampler, slices
    case long = 56   // NEW (0.9.1): extended decay toggle
    case fmAlgorithm = 64, fmFreq, fmRatio, fmRatio2, fmIndex, fmIndexDecay, fmFeedback, fmFold, fmNoise
}

/// Master indices (vd_master_param), Vektur Pulse's order.
public enum MasterParameter: UInt32, CaseIterable, Sendable {
    case midiChannel = 0, swing, temper /* NEW 0.8: −1 warm … 0 neutral (bypassed) … +1 cold — was Warmth */, level, hatChoke, delayDivision, delayFeedback, delayTone, delayPingPong,
         reverbSize, reverbDamping, reverbType /* NEW 0.8: Room · Spring · Gate · Expanse */, humanise /* NEW 0.8: 0…1 */
    // new in Vektur Drum: global glitch (LFOs: lfoBase + n × lfoStride + field, see vd_engine.h)
    case glitchOn = 32, glitchMode, glitchMix, glitchSize, glitchSpeed, metaliseCharacter /* NEW 0.9 */
    // NEW: the Slicer, the envelope follower and chaos
    case slicerOn = 80, slicerMix, slicerDivision, slicerCycle, slicerDensity, slicerEvolve, slicerSeed, slicerSpeed, slicerStutter,
         slicerTape, slicerPitch, slicerHold
    case envInput = 96, envAttack, envRelease, envGain
    case chaosMode = 104, chaosRate
    case tapeWow = 112, tapeFlutter, vinylDust   // NEW (0.7)
    case inputLevel = 120, inputDelay, inputReverb, inputDrums   // NEW (0.8): the insert input (AUv3 effect)
    public static let lfoBase: UInt32 = 48, lfoStride: UInt32 = 8
}

extension ParameterID {
    /// The address of a parameter key — "t3.decay", "sl.density", "lfo1.rate" … — or nil if there is none.
    public init?(key: String) {
        if key.first == "t", let dot = key.firstIndex(of: "."), let n = Int(key[key.index(after: key.startIndex)..<dot]) {
            let k = String(key[key.index(after: dot)...])
            guard (1...TrackLimits.playable.upperBound).contains(n), let s = ParameterSpec.track.first(where: { $0.key == k }) else { return nil }
            self.init(address: Self.trackBase + UInt32(n - 1) * Self.trackStride + s.index); return
        }
        guard let s = ParameterSpec.master.first(where: { $0.key == key }) else { return nil }
        self.init(address: Self.masterBase + s.index)
    }
}

/// Display and range information for one parameter (what Vektur Pulse's DRUM_PARAMS rows hold).
public struct ParameterSpec: Sendable {
    public enum Kind: Sendable { case continuous, integer, choice, toggle }
    public enum Scale: Sendable { case linear, logarithmic }

    public let key: String               // Vektur Pulse key without the track prefix ("decay", "dlyfb" …)
    public let index: UInt32             // track-local or master index
    public let name: String
    public let kind: Kind
    public let range: ClosedRange<Double>
    public let defaultValue: Double
    public let scale: Scale
    public let unit: String
    public let choices: [String]

    /// NEW: can be a modulation-matrix destination (every dial: continuous, or stepped with a range — not the MIDI channel).
    public var isModulatable: Bool { kind == .continuous || (kind == .integer && key != "dr.ch") || key == "gl.on" }   // 0.9.1: the Metalise switch too
    /// The spec for a full key ("t3.decay", "gl.mix" …).
    public static func spec(forKey key: String) -> ParameterSpec? {
        if key.first == "t", let dot = key.firstIndex(of: "."), Int(key[key.index(after: key.startIndex)..<dot]) != nil { let k = String(key[key.index(after: dot)...]); return track.first { $0.key == k } }
        return master.first { $0.key == key }
    }

    /// 0…1 control position ↔ value, as Vektur Pulse's synthNorm / synthDenorm.
    public func normalized(_ v: Double) -> Double {
        let lo = range.lowerBound, hi = range.upperBound
        switch scale {
        case .linear: return (v - lo) / (hi - lo)
        case .logarithmic: return lo > 0 ? log(v / lo) / log(hi / lo) : cbrt(min(max(v / hi, 0), 1))
        }
    }
    public func value(atNormalized t: Double) -> Double {
        let t = min(max(t, 0), 1), lo = range.lowerBound, hi = range.upperBound
        let v: Double
        switch scale {
        case .linear: v = lo + t * (hi - lo)
        case .logarithmic: v = lo > 0 ? lo * pow(hi / lo, t) : hi * t * t * t
        }
        return kind == .continuous ? v : v.rounded()
    }
}

