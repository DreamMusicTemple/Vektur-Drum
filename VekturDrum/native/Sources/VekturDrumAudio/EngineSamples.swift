// Vektur Drum 0.9 — samples as the engine plays them, and the BREAK LAB's analysis, over vd_slice.h.
// Everything here runs off the audio thread (main actor or a background task): detection, tempo, stretching and the
// prepared buffer can take a while for a long break. Same results as the web app (tests/native_slice).
// Not yet compiled in Xcode (no Swift toolchain where it was written): expect small fixes at first build.
import Foundation
import VekturDrumCore
import VekturDrumDSP

public enum EngineSamples {
    /// The step's pitch shift, spectral and (0.9) sampler fields, for VD_CMD_SET_STEP_FX and vd_track_sequence.steps_fx.
    public static func stepFx(_ st: Step) -> vd_step_fx {
        var x = vd_step_fx()
        x.shift_semitones = st.shiftSemitones; x.shift_mix = st.shiftMix; x.spectral = st.spectral; x.spectral_colour = st.spectralColour; x.spectral_mix = st.spectralMix
        x.slice = st.slice; x.metal_set = st.metalise >= 0 ? 1 : 0; x.metal = max(0, st.metalise)
        x.reverse_chance = st.reverseChance; x.stutter_chance = st.stutterChance
        return x
    }
    /// Mono, as the web app decodes every sample (the average of the channels, in Float).
    public static func mono(_ s: DecodedSample) -> [Float] {
        guard let first = s.channels.first else { return [] }
        if s.channels.count == 1 { return first }
        let n = s.channels.map(\.count).min() ?? 0
        var d = [Float](repeating: 0, count: n)
        for ch in s.channels { for i in 0..<n { d[i] += ch[i] } }
        let k = Float(s.channels.count); for i in 0..<n { d[i] /= k }
        return d
    }
    /// A vd_sample for the engine (ownership passes to vd_engine_set_sample): the prepared slices when the track has
    /// any, or a tune mode other than Rate; otherwise the sample as it is.
    public static func make(_ s: DecodedSample, slices: SampleSlices?, values: [String: Double], tempo: Double) -> OpaquePointer? {
        guard !s.channels.isEmpty, s.channels.count <= 2 else { return nil }
        let mode = Int((values["tsmode"] ?? 0).rounded())
        let sx = slices ?? SampleSlices()
        if sx.slices.isEmpty && mode == 0 {
            let frames = UInt32(s.channels.map(\.count).min() ?? 0)
            return s.channels[0].withUnsafeBufferPointer { a -> OpaquePointer? in
                if s.channels.count == 1 { var ch: [UnsafePointer<Float>?] = [a.baseAddress]; return vd_sample_create(&ch, 1, frames, s.sampleRate) }
                return s.channels[1].withUnsafeBufferPointer { b in var ch: [UnsafePointer<Float>?] = [a.baseAddress, b.baseAddress]; return vd_sample_create(&ch, 2, frames, s.sampleRate) }
            }
        }
        let d = mono(s)
        let defs: [vd_slice_def] = sx.slices.map { v in
            var o = vd_slice_def()
            o.start = UInt32(max(0, v.start)); o.end = UInt32(max(0, v.end)); o.pitch = v.pitch; o.gain = v.gain; o.pan = v.pan; o.attack_ms = v.attackMs; o.gate = v.gate
            o.reverse = v.reverse ? 1 : 0; o.stutter = UInt8(clamping: v.stutter); o.stretch = v.stretch; o.stutter_beats = v.stutterBeats; o.metalise = v.metalise
            return o
        }
        var opts = vd_prepare_opts(tune_mode: Int32(mode), stretch: values["stretch"] ?? 1, tune: values["tune"] ?? 0, bpm: tempo, sample_bpm: sx.bpm)
        return d.withUnsafeBufferPointer { b in defs.withUnsafeBufferPointer { q in vd_slice_prepare(b.baseAddress, UInt32(d.count), s.sampleRate, q.baseAddress, UInt32(defs.count), &opts) } }
    }
}

/// The BREAK LAB's analysis (= web sxRedetect, sxBpm, sxClassify).
public enum SampleAnalysis {
    /// Detects again: new detected marks replace the detected ones; marks placed by hand stay (and get a class).
    public static func redetect(_ sx: inout SampleSlices, sample s: DecodedSample, projectTempo: Double) {
        let d = EngineSamples.mono(s), n = UInt32(d.count), rate = s.sampleRate
        var marks = [UInt32](repeating: 0, count: 256)
        let k = d.withUnsafeBufferPointer { vd_slice_detect($0.baseAddress, n, rate, sx.sensitivity, sx.gapMs, &marks, 256) }
        let det = Array(marks.prefix(Int(k)))
        let near = Int((0.01 * rate).rounded())
        let keep = sx.marks.filter(\.manual)
        var out = keep
        for p in det where !keep.contains(where: { abs($0.position - Int(p)) < near }) { out.append(TransientMark(position: Int(p), hit: .other)) }
        out.sort { $0.position < $1.position }
        let cls = classifyAll(d, rate: rate, positions: out.map(\.position))   // 0.9.1: judged together
        for i in out.indices where !out[i].manual || out[i].hit == .other { out[i].hit = cls[i] }
        sx.marks = out
        if sx.bpm == 0 { sx.bpm = bpm(s, projectTempo: projectTempo) }
    }
    /// Classifies every hit against the others (= web sxClassifyAll): kicks are the darkest group, hats the brightest.
    public static func classifyAll(_ d: [Float], rate: Double, positions: [Int]) -> [HitClass] {
        guard !positions.isEmpty else { return [] }
        let pos = positions.map { UInt32(max(0, $0)) }
        var out = [Int32](repeating: 4, count: pos.count)
        d.withUnsafeBufferPointer { b in pos.withUnsafeBufferPointer { q in out.withUnsafeMutableBufferPointer { o in
            vd_slice_classify_all(b.baseAddress, UInt32(d.count), rate, q.baseAddress, UInt32(pos.count), o.baseAddress) } } }
        return out.map { HitClass(rawValue: Int($0)) ?? .other }
    }
    public static func bpm(_ s: DecodedSample, projectTempo: Double) -> Double {
        let d = EngineSamples.mono(s); return d.withUnsafeBufferPointer { vd_slice_bpm($0.baseAddress, UInt32(d.count), s.sampleRate, projectTempo) }
    }
    /// A mark placed by hand at `position` (classified like the detected ones).
    public static func addMark(_ sx: inout SampleSlices, at position: Int, sample s: DecodedSample) {
        let d = EngineSamples.mono(s), p = UInt32(min(max(0, position), max(0, d.count - 8)))
        sx.marks.append(TransientMark(position: Int(p), manual: true, accepted: true, hit: .other)); sx.marks.sort { $0.position < $1.position }
        let cls = classifyAll(d, rate: s.sampleRate, positions: sx.marks.map(\.position))
        if let i = sx.marks.firstIndex(where: { $0.position == Int(p) && $0.manual }) { sx.marks[i].hit = cls[i] }
    }
}
