import AVFoundation
import AudioToolbox
import SwiftUI
import VekturDrumAudio
import VekturDrumCore
import VekturDrumDSP

/// Standalone native audio host. The render closure captures only the C engine and
/// lifetime-stable buffer pointers; it never calls back into SwiftUI or DrumEngine.
@MainActor
final class StandaloneAudioHost: ObservableObject, StandaloneAudioHosting {
    @Published private(set) var isRunning = false

    private let audioEngine = AVAudioEngine()
    private let busSlots = UnsafeMutablePointer<UnsafeMutablePointer<Float>?>.allocate(capacity: 2)
    private var drumEngine: DrumEngine?
    private var sourceNode: AVAudioSourceNode?
    private var garbageTimer: Timer?

    var engine: DrumEngineControl? { drumEngine }
    var onEngineRebuilt: (() -> Void)?

    init() {
        busSlots.initialize(repeating: nil, count: 2)
    }

    deinit {
        garbageTimer?.invalidate()
        busSlots.deinitialize(count: 2)
        busSlots.deallocate()
    }

    func start() async throws {
        guard !isRunning else { return }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [])
        try session.setActive(true)

        let sampleRate = session.sampleRate > 0 ? session.sampleRate : 48_000
        guard let drum = DrumEngine(sampleRate: sampleRate, maxFrames: 4096) else {
            try? session.setActive(false)
            throw NSError(domain: "VekturDrum", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "The drum engine could not be created."])
        }

        let renderEngine = drum.rawEngine
        let buses = busSlots
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2)!
        let source = AVAudioSourceNode(format: format) { isSilence, _, frameCount, audioBufferList in
            guard frameCount > 0 else { return noErr }
            guard frameCount <= 4096 else { return kAudioUnitErr_TooManyFramesToProcess }

            let buffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
            guard buffers.count >= 2,
                  let left = buffers[0].mData?.assumingMemoryBound(to: Float.self),
                  let right = buffers[1].mData?.assumingMemoryBound(to: Float.self) else {
                return kAudioUnitErr_FormatNotSupported
            }

            buses[0] = left
            buses[1] = right
            var context = vd_render_context()
            context.tempo = 120
            withUnsafePointer(to: &context) { ctx in
                vd_engine_render(renderEngine, ctx, buses, buses + 1, 1, frameCount)
            }
            isSilence.pointee = false
            return noErr
        }

        audioEngine.attach(source)
        audioEngine.connect(source, to: audioEngine.mainMixerNode, format: format)
        audioEngine.prepare()

        do {
            try audioEngine.start()
        } catch {
            audioEngine.detach(source)
            try? session.setActive(false)
            throw error
        }

        drumEngine = drum
        sourceNode = source
        isRunning = true
        garbageTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.drumEngine?.collectGarbage()
        }
    }

    func stop() {
        drumEngine?.send(.transport(play: false))
        audioEngine.stop()
        if let sourceNode {
            audioEngine.detach(sourceNode)
        }
        sourceNode = nil
        drumEngine = nil
        garbageTimer?.invalidate()
        garbageTimer = nil
        isRunning = false
        try? AVAudioSession.sharedInstance().setActive(false)
    }
}
