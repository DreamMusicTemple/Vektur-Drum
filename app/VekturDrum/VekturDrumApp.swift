// Vektur Drum — the standalone app. It plays the same audio unit the AUv3 extension vends (VekturDrumAudioUnit),
// registered in-process and run in an AVAudioEngine, and shows the panel over it.
import SwiftUI
import AVFoundation
import VekturDrumCore
import VekturDrumAudio

@main
struct VekturDrumApp: App {
    @State private var host = StandaloneHost()
    var body: some Scene {
        WindowGroup {
            Group {
                if let c = host.controller { PanelRoot(controller: c) }
                else { Color(hex: "#0c0d0e").ignoresSafeArea().overlay { if let e = host.error { Text(e).foregroundStyle(.white).padding() } } }
            }
            .statusBarHidden()
            .persistentSystemOverlays(.hidden)
            .task { await host.start() }
        }
    }
}

/// The standalone audio host (StandaloneAudioHosting): the audio session, the engine, interruptions and route changes.
@MainActor @Observable
final class StandaloneHost {
    private(set) var controller: DrumController?
    private(set) var error: String?
    @ObservationIgnored private let engine = AVAudioEngine()
    @ObservationIgnored private var unit: VekturDrumAudioUnit?
    @ObservationIgnored private var source: AVAudioSourceNode?
    @ObservationIgnored private var observers: [NSObjectProtocol] = []

    static let description = AudioComponentDescription(componentType: kAudioUnitType_MusicDevice, componentSubType: VekturDrumAudioUnit.instrumentSubtype,
                                                        componentManufacturer: VekturDrumAudioUnit.manufacturer, componentFlags: 0, componentFlagsMask: 0)

    func start() async {
        guard controller == nil else { return }
        // 1 · the instrument, created directly (needs no audio hardware and no extension process)
        let au: VekturDrumAudioUnit
        do { au = try VekturDrumAudioUnit(componentDescription: Self.description, options: []) }
        catch let e { error = "The drum machine could not load: \(e.localizedDescription)"; return }
        unit = au
        if let starter = DrumController.starterState() { au.keeper?.restore(starter, reason: .song) }   // the web app's new set
        let c = DrumController(unit: au)
        controller = c
        // 2 · sound: if the audio session or engine can't start now (another app holds it, no output), the panel still
        //     works and audio is retried on the next interruption end / route change
        do {
            let s = AVAudioSession.sharedInstance()
            try s.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try? s.setPreferredIOBufferDuration(256.0 / 48000)
            try s.setActive(true)
        } catch let e { NSLog("Vektur Drum: audio session: %@", e.localizedDescription) }
        connectAndStart()
        observe()
        if ReferenceRender.requested, let c { await ReferenceRender.run(c) }
    }

    /// The unit's render block feeds an AVAudioSourceNode (the unit is the clock: no host musical context, its
    /// standaloneTempo leads).
    private func connectAndStart() {
        guard let au = unit else { return }
        if engine.isRunning { engine.stop() }
        if let n = source { engine.detach(n); source = nil }
        au.deallocateRenderResources()
        let out = engine.outputNode.outputFormat(forBus: 0)
        guard let fmt = AVAudioFormat(standardFormatWithSampleRate: out.sampleRate > 0 ? out.sampleRate : 48000, channels: 2) else { return }
        do {
            try au.outputBusses[0].setFormat(fmt)
            au.maximumFramesToRender = 4096
            try au.allocateRenderResources()
        } catch let e { NSLog("Vektur Drum: render resources: %@", e.localizedDescription); return }
        let render = au.renderBlock
        let node = AVAudioSourceNode(format: fmt) { _, timestamp, frames, data in
            var flags = AudioUnitRenderActionFlags()
            return render(&flags, timestamp, frames, 0, data, nil)
        }
        engine.attach(node); engine.connect(node, to: engine.mainMixerNode, format: fmt)
        source = node
        engine.prepare()
        do { try engine.start() } catch let e { NSLog("Vektur Drum: audio engine: %@", e.localizedDescription) }
    }

    private func observe() {
        let nc = NotificationCenter.default
        observers.append(nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] n in
            guard let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
            MainActor.assumeIsolated { self?.restart() }
        })
        observers.append(nc.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.restart() }
        })
    }
    private func restart() {
        try? AVAudioSession.sharedInstance().setActive(true)
        if !engine.isRunning { connectAndStart() }
    }
}
