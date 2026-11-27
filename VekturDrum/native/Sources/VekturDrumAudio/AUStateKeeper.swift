// Vektur Drum — the song of one plug-in instance, and its life inside a host (GarageBand, Cubasis, AUM, Logic, Drambo…).
//
// The audio unit (Stage 5) uses it like this:
//     override var fullState: [String: Any]? {
//         get { keeper.fullState(base: super.fullState) }
//         set { super.fullState = newValue; keeper.restore(newValue, reason: .song) }
//     }
//     override var fullStateForDocument: [String: Any]? { get { fullState } set { fullState = newValue } }
//     override var currentPreset: AUAudioUnitPreset? { … keeper.applyKit(…) for factory presets; user presets arrive
//                                                       through fullStateForDocument with reason .preset }
//
// Rules it keeps (docs/STATE.md):
//  · The song is complete without the view: hosts save and restore plug-ins whose window was never opened.
//  · Saving captures what only the engine knows: values set by host automation or MIDI CC (read back from the
//    engine's parameters) and steps recorded with REC (drained from the engine's ring).
//  · Restoring is atomic: parameters, then one vd_engine_load_sequence — never half a song, whether or not audio runs.
//  · Thread-safe: hosts call fullState from any thread, sometimes while rendering. One lock, never taken on the audio
//    thread; the audio thread only sees atomics and the sequence hand-off.
//  · Portable: sample files travel inside the song (up to kEmbedLimit), so a project opens complete on another device.
//  · Fast and stable: an unchanged song returns the cached bytes (hosts like AUM and Logic ask often); keys are
//    sorted, so an unchanged song never looks "edited" to a host.
// Not yet compiled (first Xcode build in Stage 5).
import Foundation
import VekturDrumCore
import VekturDrumDSP

public final class AUStateKeeper: @unchecked Sendable {
    public static let stateKey = "vekturDrumState", versionKey = "vekturDrumStateVersion"
    /// Total sample bytes embedded in one song; above this the song keeps references only (and says so).
    public static let embedLimit = 32 * 1024 * 1024

    public enum Reason: Sendable { case song, preset }
    public struct Notice: Sendable { public var result: StateReadResult; public var reason: Reason }

    private let lock = NSLock()
    private var project = DrumProject()
    private var cache: (project: DrumProject, data: Data)?
    private let engine: OpaquePointer
    private let library: SampleLibrary?
    /// Monotonic token prevents a slow decode from an older restore replacing a newer song's samples.
    private var sampleLoadGeneration: UInt64 = 0
    public var embedSamples = true
    /// Called on the main queue after a restore: refresh the AUParameterTree and the UI, show `missingSamples`.
    public var onRestored: ((Notice) -> Void)?
    /// Last save that could not embed its samples (too large), for the UI to explain.
    public private(set) var lastSaveSkippedSamples = false

    public init(engine: OpaquePointer, library: SampleLibrary?) { self.engine = engine; self.library = library }

    // ---------------------------------------------------------------- model access (UI, view model)
    /// The song as it is now, including automation / CC values and recorded steps.
    public func currentProject() -> DrumProject { lock.lock(); defer { lock.unlock() }; capture(); return project }
    /// Edits from the UI (patterns, samples, names): the engine is updated by the caller (DrumEngine commands).
    public func update(_ edit: (inout DrumProject) -> Void) { lock.lock(); edit(&project); lock.unlock() }
    /// Recorded hits for the UI. The keeper is the only reader of the engine's REC ring.
    public func takeRecordedHits() -> [RecordedHit] { lock.lock(); defer { lock.unlock() }; return drainRecorded() }

    // ---------------------------------------------------------------- save
    public func fullState(base: [String: Any]?) -> [String: Any] {
        var d = base ?? [:]
        lock.lock(); defer { lock.unlock() }
        capture()
        let data: Data
        if let c = cache, c.project == project { data = c.data }
        else {
            data = (try? StateCodec.encode(project, embed: embedSamples ? embedded(for: project) : nil, writer: "Vektur Drum")) ?? Data()
            cache = (project, data)
        }
        d[Self.stateKey] = data
        d[Self.versionKey] = StateFile.version
        return d
    }

    // ---------------------------------------------------------------- restore
    public func restore(_ dict: [String: Any]?, reason: Reason) {
        guard let data = dict?[Self.stateKey] as? Data, !data.isEmpty else { return }   // not one of ours: keep the current song
        guard var r = try? StateCodec.decode(data, librarySamples: library?.allKeys() ?? []) else { return }
        for s in r.embeddedSamples {   // samples carried in the song → this device's library (App Group)
            guard let bytes = Data(base64Encoded: s.data) else { continue }
            try? library?.store(bytes: bytes, key: s.key, name: s.name ?? "Sample", fmt: s.fmt ?? "wav")
        }
        lock.lock()
        if reason == .preset { r.project.midiCC = project.midiCC; r.project.tempo = project.tempo }   // a kit never changes your CC map or tempo
        _ = drainRecorded()                 // steps recorded into the old song belong to it
        project = r.project; cache = nil
        apply(project, stopTransport: reason == .song)
        sampleLoadGeneration &+= 1
        let generation = sampleLoadGeneration
        lock.unlock()
        loadSamples(for: r.project, generation: generation)
        let notice = Notice(result: r, reason: reason)
        DispatchQueue.main.async { [weak self] in self?.onRestored?(notice) }
    }
    /// A factory or user kit from the browser: sound + patterns + chain, keeps playing.
    public func applyKit(_ kit: Kit) {
        lock.lock()
        project.tracks = kit.tracks + Array(repeating: Track(), count: max(0, TrackLimits.capacity - kit.tracks.count))
        project.master.merge(kit.master) { _, new in new }
        project.patterns = kit.patterns + Array(repeating: Pattern(), count: max(0, TrackLimits.patterns - kit.patterns.count))
        project.chain = kit.chain; project.chainEnabled = kit.chainEnabled; project.currentKitName = kit.name
        project.slicer = kit.slicer ?? SlicerSlot.clearProgram; project.wires = kit.wires ?? []; project.lfoShapes = LFOShapes.clean(kit.lfoShapes)   // NEW
        if TrackLimits.playable.contains(kit.trackCount) { project.trackCount = kit.trackCount }
        cache = nil
        apply(project, stopTransport: false)
        sampleLoadGeneration &+= 1
        let generation = sampleLoadGeneration
        let restoredProject = project
        lock.unlock()
        loadSamples(for: restoredProject, generation: generation)
    }

    // ---------------------------------------------------------------- internals (lock held)
    private func capture() {
        for t in 0..<TrackLimits.playable.upperBound {
            for spec in ParameterSpec.track {
                project.tracks[t].values[spec.key] = Double(vd_engine_get_param(engine, ParameterID.trackBase + UInt32(t) * ParameterID.trackStride + spec.index))
            }
        }
        for spec in ParameterSpec.master { project.master[spec.key] = Double(vd_engine_get_param(engine, spec.index)) }
        _ = drainRecorded()
    }
    private func drainRecorded() -> [RecordedHit] {
        var out: [RecordedHit] = []
        var buf = [vd_recorded_hit](repeating: vd_recorded_hit(), count: 64)
        while true {
            let n = Int(vd_engine_pop_recorded(engine, &buf, 64)); if n == 0 { break }
            for h in buf.prefix(n) {
                let p = Int(h.pattern), t = Int(h.track), s = Int(h.step)
                guard p < TrackLimits.patterns, t < TrackLimits.capacity, s < TrackLimits.steps else { continue }
                var st = Step(); st.velocity = h.velocity; st.slice = h.slice   // 0.9: a slice pad records its slice
                project.patterns[p].tracks[t].steps[s] = st
                out.append(RecordedHit(pattern: p, track: t, step: s, velocity: h.velocity, slice: Int(h.slice)))
            }
        }
        if !out.isEmpty { cache = nil }
        return out
    }
    private func embedded(for p: DrumProject) -> [String: (name: String, fmt: String, bytes: Data)] {
        var out: [String: (name: String, fmt: String, bytes: Data)] = [:], total = 0
        lastSaveSkippedSamples = false
        for t in 0..<TrackLimits.playable.upperBound {
            guard let ref = p.tracks[t].sample, out[ref.key] == nil, let f = library?.fileBytes(key: ref.key) else { continue }
            if total + f.bytes.count > Self.embedLimit { lastSaveSkippedSamples = true; continue }
            out[ref.key] = f; total += f.bytes.count
        }
        return out
    }
    /// NEW (0.8): for the offline export — loads a song into this keeper's (dedicated, not playing) engine, samples
    /// included and awaited, so the render that follows has everything.
    public func loadForOffline(_ p: DrumProject) async {
        lock.withLock { project = p; cache = nil; apply(p, stopTransport: true) }
        guard let library else { return }
        for t in 0..<TrackLimits.playable.upperBound {
            guard let ref = p.tracks[t].sample, let s = try? await library.decoded(ref), !s.channels.isEmpty else { continue }
            vd_engine_set_sample(engine, UInt32(t), EngineSamples.make(s, slices: p.tracks[t].slices, values: p.tracks[t].values, tempo: p.tempo))   // 0.9: prepared slices
        }
    }
    /// Parameters, then the whole sequence in one hand-off.
    private func apply(_ p: DrumProject, stopTransport: Bool) {
        Self.applyProject(p, to: engine, stopTransport: stopTransport)
    }

    /// Shared full-sequence hand-off. Uses the engine's atomic sequence swap instead of flooding its SPSC command queue.
    static func applyProject(_ p: DrumProject, to engine: OpaquePointer, stopTransport: Bool) {
        for t in 0..<TrackLimits.playable.upperBound {
            for spec in ParameterSpec.track {
                let v = p.tracks[t].values[spec.key] ?? ParameterSpec.trackDefaults[t][spec.key] ?? spec.defaultValue
                vd_engine_set_param(engine, ParameterID.trackBase + UInt32(t) * ParameterID.trackStride + spec.index, Float(v))
            }
        }
        for spec in ParameterSpec.master { vd_engine_set_param(engine, spec.index, Float(p.master[spec.key] ?? spec.defaultValue)) }
        let seq = UnsafeMutablePointer<vd_sequence>.allocate(capacity: 1)
        defer { seq.deallocate() }
        memset(seq, 0, MemoryLayout<vd_sequence>.size)
        withUnsafeMutableBytes(of: &seq.pointee.patterns) { raw in
            let pats = raw.bindMemory(to: vd_pattern.self)
            for (i, pt) in p.patterns.prefix(TrackLimits.patterns).enumerated() {
                pats[i].bars = UInt8(pt.bars.rawValue); pats[i].slicer = pt.slicer == nil ? 0 : (pt.slicer! ? 1 : 2)   // 0.9: 0 follows SLICER · 1 on · 2 off
                withUnsafeMutableBytes(of: &pats[i].tracks) { traw in
                    let trs = traw.bindMemory(to: vd_track_sequence.self)
                    for (t, tr) in pt.tracks.prefix(TrackLimits.capacity).enumerated() {
                        trs[t].length = UInt8(tr.length); trs[t].division = UInt8(tr.division.rawValue)
                        withUnsafeMutableBytes(of: &trs[t].steps_fx) { xraw in   // NEW (0.8): pitch shift + spectral
                            let xs = xraw.bindMemory(to: vd_step_fx.self)
                            for (k, s) in tr.steps.prefix(TrackLimits.steps).enumerated() {
                                let st = s ?? Step()
                                xs[k] = EngineSamples.stepFx(st)   // + Metalise, slice, chances (0.9)
                            }
                        }
                        withUnsafeMutableBytes(of: &trs[t].steps) { sraw in
                            let steps = sraw.bindMemory(to: vd_step.self)
                            for (k, s) in tr.steps.prefix(TrackLimits.steps).enumerated() {
                                let st = s ?? Step()
                                steps[k] = vd_step(on: s == nil ? 0 : 1, ratchet: st.ratchet, pitch: st.pitch, _pad: 0, velocity: st.velocity, pan: st.pan,
                                                   crush: st.crush, delay_send: st.delaySend, reverb_send: st.reverbSend, chance: st.chance, fm_ratio: st.fmRatio,
                                                   ring_on: st.ringOn ? 1 : 0, ring_master: st.ringMaster, ring_slaves: st.ringSlaves, ring_amount: st.ringAmount, ring_hz: st.ringHz, fold: st.fold)
                            }
                        }
                    }
                }
            }
        }
        // NEW: the Slicer program and the modulation wires travel in the same hand-off
        withUnsafeMutableBytes(of: &seq.pointee.slicer) { raw in
            let sl = raw.bindMemory(to: vd_slice.self)
            for i in 0..<DrumLists.slicerSlots { let s = i < p.slicer.count ? p.slicer[i] : SlicerSlot(action: .thru, source: i); sl[i] = vd_slice(action: UInt8(s.action.rawValue), source: UInt8(s.source)) }
        }
        withUnsafeMutableBytes(of: &seq.pointee.wires) { raw in
            let ws = raw.bindMemory(to: vd_mod_wire.self)
            for i in 0..<DrumLists.modWires {
                var w = vd_mod_wire(); w.param = VD_PARAM_NONE
                if i < p.wires.count, let id = ParameterID(key: p.wires[i].param) { w.source = UInt8(p.wires[i].source.rawValue); w.param = id.address; w.amount = Float(p.wires[i].amount) }
                ws[i] = w
            }
        }
        withUnsafeMutableBytes(of: &seq.pointee.chain) { raw in for (i, c) in p.chain.prefix(TrackLimits.chainMax).enumerated() { raw[i] = UInt8(clamping: c) } }
        seq.pointee.chain_length = UInt8(min(p.chain.count, TrackLimits.chainMax))
        seq.pointee.chain_on = p.chainEnabled ? 1 : 0
        seq.pointee.selected_pattern = UInt8(clamping: p.selectedPattern)
        seq.pointee.track_count = UInt8(clamping: p.trackCount)
        seq.pointee.stop_transport = stopTransport ? 1 : 0
        vd_engine_load_sequence(engine, seq)
        DrumEngine.sendLfoShapes(p.lfoShapes, to: engine)   // NEW (0.9.1): drawn LFO shapes ride the command queue
    }
    /// Samples decode off the audio thread, then reach the engine by pointer hand-off; a track whose sample is
    /// missing plays nothing (Sample engine) and the restore notice names it.
    private func loadSamples(for p: DrumProject, generation: UInt64) {
        guard let library else { return }
        let engine = self.engine
        for t in 0..<TrackLimits.playable.upperBound {
            let ref = p.tracks[t].sample, sx = p.tracks[t].slices, values = p.tracks[t].values, tempo = p.tempo
            Task.detached(priority: .userInitiated) { [weak self] in
                // Decode and slice preparation stay off the audio thread. A superseded restore must
                // never install stale samples after a later project or kit has been selected.
                guard let ref, let s = try? await library.decoded(ref) else {
                    guard self?.isCurrentSampleLoad(generation) == true else { return }
                    vd_engine_set_sample(engine, UInt32(t), nil)
                    return
                }
                guard self?.isCurrentSampleLoad(generation) == true else { return }
                vd_engine_set_sample(engine, UInt32(t), EngineSamples.make(s, slices: sx, values: values, tempo: tempo))
            }
        }
    }

    private func isCurrentSampleLoad(_ generation: UInt64) -> Bool {
        lock.withLock { sampleLoadGeneration == generation }
    }
}
