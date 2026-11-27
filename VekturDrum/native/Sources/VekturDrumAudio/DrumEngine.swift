// Vektur Drum — the Swift side of the engine: DrumEngineControl over the C API (vd_engine.h).
// Main-actor only; the render thread uses `rawEngine` directly from the audio unit's render block (Stage 5), never
// this class. Not yet compiled in Xcode (no Swift toolchain where it was written): expect small fixes at first build.
import Foundation
import VekturDrumCore
import VekturDrumDSP

@MainActor
public final class DrumEngine: DrumEngineControl {
    // vd_engine_send is a single-producer queue. All Swift-side producers share this lock;
    // it is never acquired by the render thread.
    private nonisolated static let commandQueueLock = NSLock()
    private nonisolated static func enqueue(_ engine: OpaquePointer, _ command: inout vd_command) -> Bool {
        commandQueueLock.lock()
        defer { commandQueueLock.unlock() }
        return vd_engine_send(engine, &command)
    }

    /// The C engine. Hand this (not `self`) to the render block: it is what vd_engine_render needs, and capturing it
    /// keeps Swift objects, reference counting and the main actor out of the audio thread.
    public let rawEngine: OpaquePointer
    private let ownsEngine: Bool

    public init?(sampleRate: Double, maxFrames: UInt32) {
        guard let e = vd_engine_create(sampleRate, maxFrames) else { return nil }
        rawEngine = e
        ownsEngine = true
    }

    /// Non-owning control facade for an AUv3 instance. The audio unit remains the engine's owner.
    public init(borrowing engine: OpaquePointer) {
        rawEngine = engine
        ownsEngine = false
    }

    deinit {
        if ownsEngine { vd_engine_destroy(rawEngine) }
    }

    /// Audio stopped (route or sample-rate change): rebuilds the DSP buffers, keeps the music.
    @discardableResult public func prepare(sampleRate: Double, maxFrames: UInt32) -> Bool {
        vd_engine_prepare(rawEngine, sampleRate, maxFrames)
    }

    // ---- parameters
    public func setParameter(_ id: ParameterID, _ value: Double) { vd_engine_set_param(rawEngine, id.address, Float(value)) }
    public func parameter(_ id: ParameterID) -> Double { Double(vd_engine_get_param(rawEngine, id.address)) }

    // ---- commands
    @discardableResult public func send(_ command: EngineCommand) -> Bool {
        var c = vd_command()
        func type(_ t: vd_command_type) { c.type = UInt16(t.rawValue) }
        switch command {
        case let .setStep(pattern, track, step, s):
            type(VD_CMD_SET_STEP); c.pattern = UInt8(pattern); c.track = UInt8(track); c.step = UInt8(step)
            var v = vd_step()
            let st = s ?? Step()
            v.on = s == nil ? 0 : 1; v.ratchet = st.ratchet; v.pitch = st.pitch; v.velocity = st.velocity; v.pan = st.pan
            v.crush = st.crush; v.delay_send = st.delaySend; v.reverb_send = st.reverbSend; v.chance = st.chance; v.fm_ratio = st.fmRatio
            v.ring_on = st.ringOn ? 1 : 0; v.ring_master = st.ringMaster; v.ring_slaves = st.ringSlaves; v.ring_amount = st.ringAmount; v.ring_hz = st.ringHz; v.fold = st.fold
            c.u.step = v
            guard Self.enqueue(rawEngine, &c) else { return false }
            // NEW (0.8): the step's pitch shift and spectral settings follow in their own command (a command stays ≤ 64 bytes)
            type(VD_CMD_SET_STEP_FX)
            c.u.step_fx = EngineSamples.stepFx(st)
        case let .setTrackLayout(pattern, track, length, division):
            type(VD_CMD_SET_TRACK_LAYOUT); c.pattern = UInt8(pattern); c.track = UInt8(track)
            c.u.layout.length = UInt8(length); c.u.layout.division = UInt8(division.rawValue)
        case let .setBars(pattern, bars):
            type(VD_CMD_SET_BARS); c.pattern = UInt8(pattern); c.u.bars = UInt8(bars.rawValue)
        case let .setChain(pats, enabled):
            type(VD_CMD_SET_CHAIN); c.u.chain.chain_on = enabled ? 1 : 0
            let list = Array(pats.prefix(TrackLimits.chainMax)); c.u.chain.n = UInt8(list.count)
            withUnsafeMutableBytes(of: &c.u.chain.pats) { b in for (i, p) in list.enumerated() { b[i] = UInt8(clamping: p) } }
        case let .selectPattern(p): type(VD_CMD_SELECT_PATTERN); c.pattern = UInt8(p)
        case let .transport(play): type(VD_CMD_TRANSPORT); c.u.value = play ? 1 : 0
        case let .recordArm(on): type(VD_CMD_RECORD_ARM); c.u.value = on ? 1 : 0
        case let .setTrackCount(n): type(VD_CMD_SET_TRACK_COUNT); c.u.value = Float(n)
        case let .note(track, velocity): type(VD_CMD_NOTE); c.track = UInt8(track); c.u.value = velocity
        case let .enable(on): type(VD_CMD_ENABLE); c.u.value = on ? 1 : 0
        case .panic: type(VD_CMD_PANIC)
        case let .setWire(slot, w):
            type(VD_CMD_SET_WIRE); c.u.wire.slot = UInt8(clamping: slot)
            c.u.wire.w.param = VD_PARAM_NONE
            if let w, let id = ParameterID(key: w.param) { c.u.wire.w.source = UInt8(w.source.rawValue); c.u.wire.w.param = id.address; c.u.wire.w.amount = Float(w.amount) }
        case let .setSlice(slot, s):
            type(VD_CMD_SET_SLICE); c.u.slice.slot = UInt8(clamping: slot); c.u.slice.s = vd_slice(action: UInt8(s.action.rawValue), source: UInt8(clamping: s.source))
        case let .setPatternSlicer(pattern, on):
            type(VD_CMD_SET_PATTERN_SLICER); c.pattern = UInt8(clamping: pattern); c.u.value = on.map { $0 ? 1 : 0 } ?? -1
        case let .noteSlice(track, slice, velocity):
            type(VD_CMD_NOTE_SLICE); c.track = UInt8(clamping: track); c.step = UInt8(clamping: slice); c.u.value = velocity
        case let .setLfoPoints(lfo, start, pts):
            type(VD_CMD_SET_LFO_POINTS); Self.fillLfo(&c, lfo: lfo, start: start, pts)
        }
        return Self.enqueue(rawEngine, &c)
    }

    // ---- samples (decoded off the audio thread; the engine takes ownership)
    public func setSample(_ sample: DecodedSample?, track: Int) {
        vd_engine_set_sample(rawEngine, UInt32(track), sample.flatMap { EngineSamples.make($0, slices: nil, values: [:], tempo: 120) })
    }
    /// NEW (0.9): with the track's slices (prepared off the audio thread: call from a background task for long breaks).
    public func setSample(_ sample: DecodedSample?, track: Int, slices: SampleSlices?, values: [String: Double], tempo: Double) {
        vd_engine_set_sample(rawEngine, UInt32(track), sample.flatMap { EngineSamples.make($0, slices: slices, values: values, tempo: tempo) })
    }
    /// Call regularly from the main thread (e.g. once per UI frame): frees samples the audio thread has let go of.
    public func collectGarbage() { vd_engine_collect_garbage(rawEngine) }

    // ---- audio → UI
    public func telemetry() -> EngineTelemetry? {
        var t = vd_telemetry()
        guard vd_engine_read_telemetry(rawEngine, &t) else { return nil }
        let n = Int(t.track_count)
        let steps = withUnsafeBytes(of: t.current_step) { Array($0.bindMemory(to: Int8.self)).map(Int.init) }
        let hits = withUnsafeBytes(of: t.hit_count) { Array($0.bindMemory(to: UInt32.self)) }
        let env = withUnsafeBytes(of: t.envelope) { Array($0.bindMemory(to: Float.self)) }
        return EngineTelemetry(transport: EngineTelemetry.Transport(rawValue: t.transport) ?? .stopped,
                               currentPattern: Int(t.current_pattern), chainPosition: Int(t.chain_position), trackCount: n,
                               outputLevel: t.output_level, beat: t.beat,
                               currentStep: Array(steps.prefix(n)), hitCount: Array(hits.prefix(n)), envelope: Array(env.prefix(n)),
                               modSources: withUnsafeBytes(of: t.mod_source) { Array($0.bindMemory(to: Float.self)) },
                               slicerSlice: Int(t.slicer_slice), slicerAction: Int(t.slicer_action),
                               modulatedDials: {
                                   let ids = withUnsafeBytes(of: t.mod_param) { Array($0.bindMemory(to: UInt32.self)) }
                                   let pos = withUnsafeBytes(of: t.mod_position) { Array($0.bindMemory(to: Float.self)) }
                                   return (0..<Int(t.mod_count)).map { ModulatedDial(parameter: ParameterID(address: ids[$0]), position: pos[$0]) }
                               }())
    }
    /// The engine's REC ring has one reader. In the plug-in, AUStateKeeper is that reader (takeRecordedHits()), so
    /// recorded steps are in the song whenever the host saves; call this only where no keeper owns the engine.
    public func drainRecordedHits() -> [RecordedHit] {
        var buf = [vd_recorded_hit](repeating: vd_recorded_hit(), count: 64)
        let n = Int(vd_engine_pop_recorded(rawEngine, &buf, 64))
        return buf.prefix(n).map { RecordedHit(pattern: Int($0.pattern), track: Int($0.track), step: Int($0.step), velocity: $0.velocity, slice: Int($0.slice)) }
    }

    // ---- full resync from the model (after loading, a reset or a sample-rate change)
    public func sync(from project: DrumProject) {
        send(.panic)
        for t in 0..<ParameterSpec.trackDefaults.count {
            for spec in ParameterSpec.track {
                let v = project.tracks[t].values[spec.key] ?? ParameterSpec.trackDefaults[t][spec.key] ?? spec.defaultValue
                vd_engine_set_param(rawEngine, ParameterID.trackBase + UInt32(t) * ParameterID.trackStride + spec.index, Float(v))
            }
        }
        for spec in ParameterSpec.master { vd_engine_set_param(rawEngine, spec.index, Float(project.master[spec.key] ?? spec.defaultValue)) }
        for (p, pattern) in project.patterns.prefix(TrackLimits.patterns).enumerated() {
            send(.setBars(pattern: p, pattern.bars)); send(.setPatternSlicer(pattern: p, pattern.slicer))
            for (t, tr) in pattern.tracks.prefix(ParameterSpec.trackDefaults.count).enumerated() {
                send(.setTrackLayout(pattern: p, track: t, length: tr.length, division: tr.division))
                for (s, step) in tr.steps.prefix(TrackLimits.steps).enumerated() { send(.setStep(pattern: p, track: t, step: s, step)) }
            }
        }
        for i in 0..<DrumLists.slicerSlots { send(.setSlice(slot: i, i < project.slicer.count ? project.slicer[i] : SlicerSlot(action: .thru, source: i))) }   // NEW
        for i in 0..<DrumLists.modWires { send(.setWire(slot: i, i < project.wires.count ? project.wires[i] : nil)) }
        Self.sendLfoShapes(project.lfoShapes, to: rawEngine)   // NEW (0.9.1)
        send(.setChain(project.chain, enabled: project.chainEnabled))
        send(.selectPattern(project.selectedPattern))
        send(.setTrackCount(project.trackCount))
    }

    // ---- NEW (0.9.1): LFO DRAW — 16 points go as two 8-point commands per LFO
    nonisolated static func fillLfo(_ c: inout vd_command, lfo: Int, start: Int, _ pts: [Float]) {
        let n = min(8, max(0, pts.count)), st = min(max(0, start), LFOShapes.points - 1)
        c.u.lfo_points.lfo = UInt8(clamping: lfo); c.u.lfo_points.start = UInt8(st); c.u.lfo_points.count = UInt8(min(n, LFOShapes.points - st))
        withUnsafeMutableBytes(of: &c.u.lfo_points.points) { raw in let f = raw.bindMemory(to: Float.self); for j in 0..<n { f[j] = min(max(pts[j], -1), 1) } }
    }
    public nonisolated static func sendLfoShapes(_ shapes: [[Double]], to engine: OpaquePointer) {
        for (l, row) in LFOShapes.clean(shapes).enumerated() {
            for h in 0..<2 {
                var c = vd_command(); c.type = UInt16(VD_CMD_SET_LFO_POINTS.rawValue)
                fillLfo(&c, lfo: l, start: h * 8, row[(h * 8)..<(h * 8 + 8)].map { Float($0) })
                _ = enqueue(engine, &c)
            }
        }
    }

}
