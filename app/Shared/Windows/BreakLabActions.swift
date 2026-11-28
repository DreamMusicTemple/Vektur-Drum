// Vektur Drum — the BREAK LAB's actions (web/src/breaklab.js): playing slices, sending them to steps and tracks, the
// groove variations, RESAMPLE (an offline render of the track through the existing Exporter) and EXPORT MIDI.
import SwiftUI
import AVFoundation
import VekturDrumCore
import VekturDrumAudio

extension DrumController {
    /// web blHitSlice: a slice pad (REC records the slice).
    func hitSlice(_ t: Int, _ i: Int, velocity127: Double) {
        if !on { setOn(true) }
        engine.send(.noteSlice(track: t, slice: i + 1, velocity: Float(min(1, max(0, velocity127 / 127)))))
    }
    private func trackEmpty(_ u: Int) -> Bool { project.tracks[u].sample == nil && !project.patterns.contains { $0.tracks[u].steps.contains { $0 != nil } } }
    /// web blCopySampleTo: track u gets the source's sample and slices (and the sample engine).
    func copySample(from t: Int, to u: Int) {
        guard u != t else { return }
        edit { $0.tracks[u].sample = $0.tracks[t].sample; $0.tracks[u].slices = $0.tracks[t].slices }
        set("t\(u + 1).engine", 1); set("t\(u + 1).tsmode", value("t\(t + 1).tsmode")); set("t\(u + 1).stretch", value("t\(t + 1).stretch")); set("t\(u + 1).decay", 3)
        decodedSamples[u] = decodedSamples[t]
        if let s = decodedSamples[t] { engine.setSample(s, track: u, slices: project.tracks[u].slices, values: project.tracks[u].values, tempo: project.tempo) }
    }
    /// web blSendSlices: slices → tracks from `from` (−1: only empty tracks), one each, as the track's Slice.
    func sendSlices(_ list: [Int], from: Int, source t: Int) {
        let n = trackCount; var used: [Int] = []; var u = from
        for i in list {
            if from < 0 { u = 0; while u < n && (!trackEmpty(u) || used.contains(u)) { u += 1 } }
            if u >= n { break }
            copySample(from: t, to: u); set("t\(u + 1).slice", Double(i + 1)); used.append(u); u += 1
        }
        edit { $0.currentKitName = "" }
        toast(used.isEmpty ? "No free track" : (list.count > 1 ? "Slices" : "Slice \(list[0] + 1)") + " → track" + (used.count > 1 ? "s " : " ") + used.map { String($0 + 1) }.joined(separator: ", "))
    }
    private func write(_ p: inout Pattern, _ u: Int, _ k: Int, _ c: GrooveCell) { p.tracks[u].steps[k] = GrooveGenerator.step(c) }
    /// web blSlicesToLane: the slices in order on this track's steps.
    func slicesToLane(_ t: Int) {
        let sel = project.selectedPattern, sx = project.tracks[t].slices ?? SampleSlices(), n = min(16, sx.slices.count)
        edit { p in
            p.patterns[sel].tracks[t].steps = Array(repeating: nil, count: TrackLimits.steps); p.patterns[sel].tracks[t].length = max(n, 1)
            for k in 0..<n { var s = Step(); s.velocity = sx.slices[k].hit == .ghost ? 0.5 : 0.9; s.slice = UInt8(k + 1); p.patterns[sel].tracks[t].steps[k] = s }
        }
        set("t\(t + 1).engine", 1); pushPattern(sel)
        toast("\(n) slices on track \(t + 1), pattern \(sel + 1)")
    }
    /// web blApplyVariation (this lane).
    func applyVariation(_ v: [GrooveCell?], track t: Int) {
        let sel = project.selectedPattern
        edit { p in
            p.patterns[sel].tracks[t].steps = Array(repeating: nil, count: TrackLimits.steps); p.patterns[sel].tracks[t].length = 16; p.patterns[sel].tracks[t].division = .sixteenth
            for (k, c) in v.enumerated() { if let c { p.patterns[sel].tracks[t].steps[k] = GrooveGenerator.step(c) } }
        }
        set("t\(t + 1).engine", 1); pushPattern(sel)
    }
    /// web blSplitByClass: kick / snare / hat / ghost → this track and the next three.
    func splitByClass(_ v: [GrooveCell?], source t: Int, announce: Bool) {
        let sel = project.selectedPattern, n = trackCount, lanes = (0..<4).map { min(t + $0, n - 1) }
        for u in lanes { copySample(from: t, to: u) }
        edit { p in
            for u in lanes { p.patterns[sel].tracks[u].steps = Array(repeating: nil, count: TrackLimits.steps); p.patterns[sel].tracks[u].length = 16; p.patterns[sel].tracks[u].division = .sixteenth }
            for (k, c) in v.enumerated() { if let c { p.patterns[sel].tracks[lanes[min(c.hit.rawValue, 3)]].steps[k] = GrooveGenerator.step(c) } }
        }
        pushPattern(sel)
        if announce { toast("Kick, snare, hat, ghost → tracks " + lanes.map { String($0 + 1) }.joined(separator: ", ")) }
    }

    /// web blResample: the track alone, dry (no sends, cut at the end), rendered offline over the pattern or chain with the
    /// existing Exporter, normalised, and loaded back as a new sample with its own slices.
    func resampleTrack(_ t: Int) async -> String {
        guard var p = unit.keeper?.currentProject() else { return "Resample failed" }
        for u in 0..<TrackLimits.capacity where u != t { p.tracks[u].values["mute"] = 1 }
        p.tracks[t].values["mute"] = 0; p.tracks[t].values["solo"] = 0; p.tracks[t].values["dly"] = 0; p.tracks[t].values["rev"] = 0
        var o = ExportOptions(); o.what = .master; o.format = .wav; o.wavBits = 32; o.sampleRate = 48000; o.ringOut = false
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("resample-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let names = (0..<TrackLimits.capacity).map { trackName($0) }, opts = o, proj = p
        guard let url = try? await Task.detached(priority: .userInitiated, operation: { try await Exporter.export(proj, library: nil, options: opts, trackName: { names[$0] }, to: dir) }).value.first,
              let s = try? SampleDecode.decode(url), var mono = s.channels.first else { return "Resample failed" }
        let pk = mono.map(abs).max() ?? 0
        guard pk >= 1e-5 else { return "Track \(t + 1) is silent in this pattern" }
        let g = min(0.98 / pk, 8); for i in mono.indices { mono[i] *= g }
        let sample = DecodedSample(channels: [mono], sampleRate: s.sampleRate)
        resampleCount += 1
        let base = (project.tracks[t].sample?.name ?? trackName(t)).replacingOccurrences(of: #" RS\d+$"#, with: "", options: .regularExpression)
        let bytes = mono.withUnsafeBufferPointer { Data(buffer: $0) }
        let ref = Self.sampleRef(key: SampleDecode.key(bytes), name: String((base + " RS\(resampleCount)").prefix(40)))
        decodedSamples[t] = sample
        edit { $0.tracks[t].sample = ref; $0.currentKitName = "" }
        for k in ["metal", "rsmp", "tsmode", "tune"] { set("t\(t + 1).\(k)", 0) }
        set("t\(t + 1).engine", 1); set("t\(t + 1).slice", 1)
        var sx = SampleSlices(); sx.bpm = project.tempo
        SampleAnalysis.redetect(&sx, sample: sample, projectTempo: project.tempo); sx.makeSlices(frames: mono.count, rate: sample.sampleRate)
        setSlices(t, sx)
        return "Resampled into a new sample on track \(t + 1) — \(sx.slices.count) slices"
    }

    /// web drumMidiFile: a type-1 standard MIDI file (96 PPQ), one track per drum track that plays; GM notes on channel 10,
    /// slice lanes as notes 36 + slice on their own channel.
    func exportMIDIFile() -> URL? {
        let p = unit.keeper?.currentProject() ?? project, plan = Exporter.plan(p), PPQ = 96
        func vlq(_ v: Int) -> [UInt8] { var n = v, b = [UInt8(n & 0x7f)]; n >>= 7; while n > 0 { b.insert(UInt8((n & 0x7f) | 0x80), at: 0); n >>= 7 }; return b }
        func trk(_ ev: [(Int, Int, [UInt8])]) -> [UInt8] {
            let e = ev.sorted { $0.0 != $1.0 ? $0.0 < $1.0 : $0.1 < $1.1 }
            var out: [UInt8] = [], last = 0
            for (tk, _, bytes) in e { out += vlq(tk - last) + bytes; last = tk }
            out += [0, 0xff, 0x2f, 0]
            let n = out.count
            return [0x4d, 0x54, 0x72, 0x6b, UInt8((n >> 24) & 255), UInt8((n >> 16) & 255), UInt8((n >> 8) & 255), UInt8(n & 255)] + out
        }
        func name(_ s: String) -> [UInt8] { let b = Array(s.utf8); return [0xff, 0x03] + vlq(b.count) + b }
        let us = Int((60_000_000 / max(1, p.tempo)).rounded())
        var tracks: [[UInt8]] = [trk([(0, 0, [0xff, 0x51, 3, UInt8((us >> 16) & 255), UInt8((us >> 8) & 255), UInt8(us & 255)]), (0, 0, [0xff, 0x58, 4, 4, 2, 24, 8]), (0, 1, name("Vektur Drum"))])]
        var chn = 0
        for t in 0..<p.trackCount {
            let eng = Int((p.tracks[t].values["engine"] ?? ParameterSpec.trackDefaults[t]["engine"] ?? 0).rounded())
            let slice = eng == 1 && p.patterns.contains { $0.tracks[t].steps.contains { ($0?.slice ?? 0) > 0 } }
            var ch = 9
            if slice { if chn == 9 { chn += 1 }; ch = chn; chn += 1 }
            var ev: [(Int, Int, [UInt8])] = [], at = 0
            for pi in plan.order {
                let pt = p.patterns[pi], tr = pt.tracks[t], beats = Double(4 * pt.bars.rawValue), sb = tr.division.beats, steps = Int((beats / sb).rounded())
                for k in 0..<steps {
                    guard let s = tr.steps[k % max(1, tr.length)] else { continue }
                    let vel = UInt8(min(127, max(1, Int((Double(s.velocity) * 127).rounded())))), rat = Int(s.ratchet)
                    let trackSlice = Int((p.tracks[t].values["slice"] ?? 1).rounded())
                    let note = UInt8(slice ? min(127, max(0, 36 + (s.slice > 0 ? Int(s.slice) - 1 : trackSlice - 1))) : ParameterSpec.trackNotes[t])
                    for r in 0..<max(1, rat) {
                        let on = at + Int(((Double(k) * sb + Double(r) * sb / Double(max(1, rat))) * Double(PPQ)).rounded()), len = max(1, Int((sb / Double(max(1, rat)) * Double(PPQ) * 0.9).rounded()))
                        ev.append((on, 1, [UInt8(0x90 | ch), note, vel])); ev.append((on + len, 0, [UInt8(0x80 | ch), note, 0]))
                    }
                }
                at += Int((beats * Double(PPQ)).rounded())
            }
            if !ev.isEmpty { ev.append((0, -1, name((slice ? "Slices " : "") + "T\(t + 1) " + trackName(t)))); tracks.append(trk(ev)) }
        }
        let hd: [UInt8] = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, UInt8(tracks.count), 0, UInt8(PPQ)]
        let data = Data(hd + tracks.flatMap { $0 })
        let file = "Vektur Drum" + (p.currentKitName.flatMap { $0.isEmpty ? nil : " - " + $0 } ?? "") + " - " + (plan.chain ? "Chain" : "Pattern \(p.selectedPattern + 1)") + ".mid"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(file.replacingOccurrences(of: "/", with: "-"))
        return (try? data.write(to: url)) != nil ? url : nil
    }
}
