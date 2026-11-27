// Vektur Drum — the AUv3 audio unit. One class, two components (declared in the extension's Info.plist, see
// docs/AUV3.md):
//   · Vektur Drum      aumu 'vkdr' 'DMTp'   instrument: drums out, MIDI in
//   · Vektur Drum FX   aufx 'vkfx' 'DMTp'   NEW (0.8) insert effect: any track's audio in → delay / reverb sends,
//                                            glitch, Slicer, tape, TEMPER → out, with or without the drums
//                      (aumf 'vkfm' 'DMTp'  the same as a "music effect": an effect that also takes MIDI, for hosts that
//                                            let you play the pads into an insert)
// The render block touches only the C engine (vd_engine_render), preallocated buffers and the host's blocks: no Swift
// objects, no locks, no allocation, no Objective-C messaging on the audio thread.
//
// Low latency: the engine adds no latency of its own except the spectral step effect (256 samples, only on steps that
// use it, aligned dry/wet inside the track), so `latency` is 0; the effect processes in place, block by block.
// Not yet compiled (no Swift toolchain where it was written): first Xcode build.
import AVFoundation
import AudioToolbox
import CoreAudioKit
import VekturDrumCore
import VekturDrumDSP

public final class VekturDrumAudioUnit: AUAudioUnit {
    public static let manufacturer: FourCharCode = 0x444D_5470   // 'DMTp'
    public static let instrumentSubtype: FourCharCode = 0x766B_6472   // 'vkdr'
    public static let effectSubtype: FourCharCode = 0x766B_6678       // 'vkfx'
    public static let musicEffectSubtype: FourCharCode = 0x766B_666D  // 'vkfm'

    public let isEffect: Bool
    public private(set) var engine: OpaquePointer?
    public private(set) var keeper: AUStateKeeper?
    private var outputBus: AUAudioUnitBus!
    private var inputBus: AUAudioUnitBus?
    private var _outputBusses: AUAudioUnitBusArray!
    private var _inputBusses: AUAudioUnitBusArray!
    private var _parameterTree: AUParameterTree?
    // Render-thread scratch. Allocated ONCE in init and freed only in deinit: hosts may fetch (and cache) the render block
    // before or across allocate / deallocate cycles, so its captured pointers must stay valid for the unit's lifetime.
    private let midiScratch: UnsafeMutablePointer<vd_midi_event>
    private let busScratch: UnsafeMutablePointer<UnsafeMutablePointer<Float>?>   // [L, R] bus pointer slots for vd_engine_render
    private let outScratchL: UnsafeMutablePointer<Float>, outScratchR: UnsafeMutablePointer<Float>
    private let inScratchL: UnsafeMutablePointer<Float>, inScratchR: UnsafeMutablePointer<Float>
    private let inputList: UnsafeMutableAudioBufferListPointer   // 2 non-interleaved buffers for the effect's pull-input
    private let inputChannels: UnsafeMutablePointer<UInt32>      // the input bus's channel count (1 or 2), set in allocate
    private let tempoBox: UnsafeMutablePointer<Double>           // the tempo used when no host provides one (standalone app)
    /// BPM when no host musical context leads (the standalone app's own clock). Read by the render thread; a plain
    /// aligned double store, so a new value takes effect at the next render call.
    public var standaloneTempo: Double {
        get { tempoBox.pointee }
        set { tempoBox.pointee = min(400, max(20, newValue)) }
    }
    private static let midiCapacity = 512
    /// The most frames one render call may ask for (scratch capacity). Larger requests are refused, never overrun.
    public static let maxFramesCapacity: AUAudioFrameCount = 8192

    public override init(componentDescription: AudioComponentDescription, options: AudioComponentInstantiationOptions = []) throws {
        isEffect = componentDescription.componentType != kAudioUnitType_MusicDevice
        let cap = Int(Self.maxFramesCapacity)
        midiScratch = .allocate(capacity: Self.midiCapacity)
        busScratch = .allocate(capacity: 2); busScratch.initialize(repeating: nil, count: 2)
        outScratchL = .allocate(capacity: cap); outScratchL.initialize(repeating: 0, count: cap)
        outScratchR = .allocate(capacity: cap); outScratchR.initialize(repeating: 0, count: cap)
        inScratchL = .allocate(capacity: cap); inScratchL.initialize(repeating: 0, count: cap)
        inScratchR = .allocate(capacity: cap); inScratchR.initialize(repeating: 0, count: cap)
        inputChannels = .allocate(capacity: 1); inputChannels.initialize(to: 2)
        tempoBox = .allocate(capacity: 1); tempoBox.initialize(to: 120)
        inputList = AudioBufferList.allocate(maximumBuffers: 2)
        inputList[0] = AudioBuffer(mNumberChannels: 1, mDataByteSize: UInt32(cap * 4), mData: UnsafeMutableRawPointer(inScratchL))
        inputList[1] = AudioBuffer(mNumberChannels: 1, mDataByteSize: UInt32(cap * 4), mData: UnsafeMutableRawPointer(inScratchR))
        try super.init(componentDescription: componentDescription, options: options)
        let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2)!
        outputBus = try AUAudioUnitBus(format: format); outputBus.maximumChannelCount = 2
        _outputBusses = AUAudioUnitBusArray(audioUnit: self, busType: .output, busses: [outputBus])
        if isEffect { let b = try AUAudioUnitBus(format: format); b.maximumChannelCount = 2; inputBus = b }
        _inputBusses = AUAudioUnitBusArray(audioUnit: self, busType: .input, busses: inputBus.map { [$0] } ?? [])
        guard let e = vd_engine_create(48000, 4096) else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(kAudioUnitErr_FailedInitialization)) }
        engine = e
        keeper = AUStateKeeper(engine: e, library: nil)
        _parameterTree = Self.makeParameterTree(engine: e)
        maximumFramesToRender = 4096
        // The effect starts as a pure effect (DRUMS OFF) with the input at unity; the instrument ignores these.
        if isEffect { vd_engine_set_param(e, ParameterID.master(.inputDrums).address, 0); vd_engine_set_param(e, ParameterID.master(.inputLevel).address, 1) }
        var c = vd_command(); c.type = UInt16(VD_CMD_ENABLE.rawValue); c.u.value = 1; EngineCommandGate.send(e, &c)
    }
    deinit {
        if let e = engine { vd_engine_destroy(e) }
        midiScratch.deallocate(); busScratch.deallocate()
        outScratchL.deallocate(); outScratchR.deallocate(); inScratchL.deallocate(); inScratchR.deallocate()
        free(inputList.unsafeMutablePointer); inputChannels.deallocate(); tempoBox.deallocate()
    }

    // ---------------------------------------------------------------- buses, parameters
    public override var outputBusses: AUAudioUnitBusArray { _outputBusses }
    public override var inputBusses: AUAudioUnitBusArray { _inputBusses }
    public override var parameterTree: AUParameterTree? { get { _parameterTree } set { } }
    public override var channelCapabilities: [NSNumber]? { isEffect ? [2, 2, 1, 1, 1, 2] : [0, 2] }   // effect: stereo / mono in → stereo out
    public override var latency: TimeInterval { 0 }
    public override var tailTime: TimeInterval { isEffect ? 60 : 12 }   // Expanse washes can ring a long time
    public override var supportsMPE: Bool { false }
    public override var canProcessInPlace: Bool { true }

    /// Every parameter, at its stable address (vd_engine.h): 12 tracks (0.9) × the track set, then the master set. TEMPER shows
    /// WARM / NEUTRAL / COLD; HUMANISE OFF / % (+ GHOSTS above 50 %).
    static func makeParameterTree(engine e: OpaquePointer) -> AUParameterTree {
        func make(_ spec: ParameterSpec, _ id: ParameterID, prefix: String) -> AUParameter {
            let unit: AudioUnitParameterUnit = spec.kind == .toggle ? .boolean : (spec.kind == .choice ? .indexed : .generic)
            var flags: AudioUnitParameterOptions = [.flag_IsReadable, .flag_IsWritable]
            if spec.kind == .continuous { flags.insert(.flag_CanRamp) }
            if spec.scale == .logarithmic { flags.insert(.flag_DisplayLogarithmic) }
            let p = AUParameterTree.createParameter(withIdentifier: spec.key.replacingOccurrences(of: ".", with: "_") + prefix, name: (prefix.isEmpty ? "" : "T\(prefix.dropFirst()) ") + spec.name,
                                                    address: AUParameterAddress(id.address), min: AUValue(spec.range.lowerBound), max: AUValue(spec.range.upperBound),
                                                    unit: unit, unitName: spec.unit.isEmpty ? nil : spec.unit, flags: flags,
                                                    valueStrings: spec.choices.isEmpty ? nil : spec.choices, dependentParameters: nil)
            p.value = AUValue(spec.defaultValue)
            return p
        }
        var tracks: [AUParameterNode] = []
        for t in 0..<TrackLimits.playable.upperBound {
            let ps = ParameterSpec.track.map { make($0, ParameterID(address: ParameterID.trackBase + UInt32(t) * ParameterID.trackStride + $0.index), prefix: "_\(t + 1)") }
            tracks.append(AUParameterTree.createGroup(withIdentifier: "track\(t + 1)", name: "Track \(t + 1)", children: ps))
        }
        let master = ParameterSpec.master.map { make($0, ParameterID(address: ParameterID.masterBase + $0.index), prefix: "") }
        let tree = AUParameterTree.createTree(withChildren: tracks + [AUParameterTree.createGroup(withIdentifier: "master", name: "Master", children: master)])
        tree.implementorValueObserver = { p, v in vd_engine_set_param(e, UInt32(p.address), v) }
        tree.implementorValueProvider = { p in vd_engine_get_param(e, UInt32(p.address)) }
        tree.implementorStringFromValueCallback = { p, v in
            let x = Double(v?.pointee ?? p.value)
            if p.address == AUParameterAddress(ParameterID.master(.temper).address) { let pc = Int((abs(x) * 100).rounded()); return pc == 0 ? "NEUTRAL" : (x < 0 ? "WARM \(pc)%" : "COLD \(pc)%") }
            if p.address == AUParameterAddress(ParameterID.master(.humanise).address) { let pc = Int((x * 100).rounded()); return pc == 0 ? "OFF" : (pc > 50 ? "\(pc)% +GHOSTS" : "\(pc)%") }
            if let s = p.valueStrings, !s.isEmpty { return s[min(max(Int(x.rounded()) - Int(p.minValue), 0), s.count - 1)] }
            return String(format: "%.2f", x)
        }
        return tree
    }

    // ---------------------------------------------------------------- song (AUStateKeeper)
    public override var fullState: [String: Any]? {
        get { keeper?.fullState(base: super.fullState) ?? super.fullState }
        set { super.fullState = newValue; keeper?.restore(newValue, reason: .song) }
    }
    public override var fullStateForDocument: [String: Any]? { get { fullState } set { fullState = newValue } }

    // ---------------------------------------------------------------- render resources
    public override func allocateRenderResources() throws {
        try super.allocateRenderResources()
        guard let e = engine else { return }
        if maximumFramesToRender > Self.maxFramesCapacity { maximumFramesToRender = Self.maxFramesCapacity }
        let sr = outputBus.format.sampleRate, maxF = maximumFramesToRender
        if isEffect, let ib = inputBus, ib.format.sampleRate != sr { throw NSError(domain: NSOSStatusErrorDomain, code: Int(kAudioUnitErr_FormatNotSupported)) }
        inputChannels.pointee = min(2, max(1, inputBus?.format.channelCount ?? 2))
        guard vd_engine_prepare(e, sr, maxF) else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(kAudioUnitErr_FailedInitialization)) }
    }

    public override var internalRenderBlock: AUInternalRenderBlock {
        // Everything the block needs, captured as plain values / pointers (never `self`).
        let e = engine!, effect = isEffect, midiCap = Self.midiCapacity, cap = Self.maxFramesCapacity
        let midi = midiScratch, bus = busScratch, outL = outScratchL, outR = outScratchR
        let inList = inputList, inL = inScratchL, inR = inScratchR, inCh = inputChannels, standaloneBPM = tempoBox
        let musical = musicalContextBlock, transport = transportStateBlock
        return { actionFlags, timestamp, frameCount, outputBusNumber, outputData, realtimeEventListHead, pullInputBlock in
            if frameCount > cap { return kAudioUnitErr_TooManyFramesToProcess }
            var ctx = vd_render_context()
            ctx.tempo = standaloneBPM.pointee
            var tempo = 0.0, beat = 0.0
            if let musical, musical(&tempo, nil, nil, &beat, nil, nil) { ctx.tempo = tempo; ctx.host_beat = beat; ctx.host_beat_valid = true }
            var flags = AUHostTransportStateFlags(), pos = 0.0, cs = 0.0, ce = 0.0
            if let transport, transport(&flags, &pos, &cs, &ce) { ctx.host_playing_valid = true; ctx.host_playing = flags.contains(.moving) }
            // events: MIDI → sample-stamped list; parameter (ramp) events → the engine's atomics
            var n = 0, ev = realtimeEventListHead
            while let p = ev {
                let h = p.pointee.head
                switch h.eventType {
                case .MIDI, .midiSysEx:
                    let m = p.pointee.MIDI
                    if h.eventType == .MIDI, n < midiCap {
                        let off = UInt32(max(0, min(Int64(frameCount) - 1, Int64(m.eventSampleTime) - Int64(timestamp.pointee.mSampleTime))))
                        midi[n] = vd_midi_event(sample_offset: off, status: m.data.0, data1: m.data.1, data2: m.data.2, _pad: 0); n += 1
                    }
                case .parameter, .parameterRamp:
                    let pe = p.pointee.parameter; vd_engine_set_param(e, UInt32(pe.parameterAddress), pe.value)
                default: break
                }
                ev = UnsafePointer(h.next)
            }
            // keep MIDI in time order (hosts send it sorted; this is cheap insurance, no allocation)
            if n > 1 { for i in 1..<n { var j = i; let x = midi[i]; while j > 0 && midi[j - 1].sample_offset > x.sample_offset { midi[j] = midi[j - 1]; j -= 1 }; midi[j] = x } }
            ctx.midi = UnsafePointer(midi); ctx.midi_count = UInt32(n)
            // the insert input
            if effect, let pull = pullInputBlock {
                // point at our scratch every call: an upstream unit may have swapped in its own buffers last time
                inList.unsafeMutablePointer.pointee.mNumberBuffers = 2   // (the subscript checks the count: fill both first)
                inList[0].mData = UnsafeMutableRawPointer(inL); inList[1].mData = UnsafeMutableRawPointer(inR)
                inList[0].mDataByteSize = frameCount * 4; inList[1].mDataByteSize = frameCount * 4
                inList.unsafeMutablePointer.pointee.mNumberBuffers = inCh.pointee   // 1 for a mono bus
                var pf = AudioUnitRenderActionFlags()
                if pull(&pf, timestamp, frameCount, 0, inList.unsafeMutablePointer) == noErr, let l = inList[0].mData {
                    ctx.input_left = UnsafePointer(l.assumingMemoryBound(to: Float.self))
                    ctx.input_right = inList.count > 1 ? inList[1].mData.map { UnsafePointer($0.assumingMemoryBound(to: Float.self)) } : nil
                }
            }
            // output: the host's buffers, or ours when the host passes none (in-place convention)
            let out = UnsafeMutableAudioBufferListPointer(outputData)
            let L = out[0].mData?.assumingMemoryBound(to: Float.self) ?? outL
            let R = out.count > 1 ? (out[1].mData?.assumingMemoryBound(to: Float.self) ?? outR) : L
            if out[0].mData == nil { out[0].mData = UnsafeMutableRawPointer(outL) }
            if out.count > 1, out[1].mData == nil { out[1].mData = UnsafeMutableRawPointer(outR) }
            for i in 0..<out.count { out[i].mDataByteSize = frameCount * 4 }
            bus[0] = L; bus[1] = R   // preallocated slots: no allocation here
            withUnsafePointer(to: &ctx) { c in vd_engine_render(e, c, bus, bus + 1, 1, frameCount) }
            return noErr
        }
    }
}
