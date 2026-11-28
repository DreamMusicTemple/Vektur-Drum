// Vektur Drum — the standalone app. It plays the same audio unit the AUv3 extension vends (VekturDrumAudioUnit),
// registered in-process and run in an AVAudioEngine, and shows the panel over it.
import SwiftUI
import AVFoundation
import CoreMIDI
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
        c?.host = self
        c?.applyPowerPrefs()
        // 2 · sound: if the audio session or engine can't start now (another app holds it, no output), the panel still
        //     works and audio is retried on the next interruption end / route change
        do {
            let s = AVAudioSession.sharedInstance()
            try s.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            applySession(c?.prefs ?? DevicePrefs())
            try s.setActive(true)
        } catch let e { NSLog("Vektur Drum: audio session: %@", e.localizedDescription) }
        connectAndStart()
        observe()
        if c?.prefs.midiIn ?? true { startMIDI() }
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
    /// SETTINGS → AUDIO ENGINE: the preferred rate and buffer (web: a new AudioContext with sampleRate / latencyHint).
    private func applySession(_ p: DevicePrefs) {
        let s = AVAudioSession.sharedInstance()
        if p.sampleRate > 0 { try? s.setPreferredSampleRate(p.sampleRate) } else { try? s.setPreferredSampleRate(0) }
        let frames: Double = p.latency == "interactive" ? 128 : p.latency == "balanced" ? 512 : 2048
        try? s.setPreferredIOBufferDuration(frames / max(44100, s.sampleRate))
    }
    @ObservationIgnored private var midiClient = MIDIClientRef()
    @ObservationIgnored private var midiPort = MIDIPortRef()
    @ObservationIgnored private(set) var ports: [String] = []
    /// CoreMIDI: every source → notes and other channel messages to the unit (as a host would send them), CCs to the
    /// panel's CC map / MIDI learn (web vdMidi).
    private func startMIDI() {
        guard midiClient == 0 else { connectSources(); return }
        MIDIClientCreateWithBlock("Vektur Drum" as CFString, &midiClient) { [weak self] _ in DispatchQueue.main.async { self?.connectSources() } }
        let schedule = unit?.scheduleMIDIEventBlock
        MIDIInputPortCreateWithProtocol(midiClient, "in" as CFString, ._1_0, &midiPort) { [weak self] list, _ in
            for packet in list.unsafeSequence() {
                let words = MIDIEventPacket.WordCollection(packet)
                for w in words {
                    let type = (w >> 28) & 0xF; guard type == 2 else { continue }   // MIDI 1.0 channel voice
                    let st = UInt8((w >> 16) & 0xFF), d1 = UInt8((w >> 8) & 0x7F), d2 = UInt8(w & 0x7F)
                    if st & 0xF0 == 0xB0 {
                        DispatchQueue.main.async { MainActor.assumeIsolated { guard let c = self?.controller, c.prefs.midiIn else { return }; c.takeCC(Int(d1), channel: Int(st & 0x0F) + 1, value: Int(d2)) } }
                    } else if let schedule { var b = [st, d1, d2]; schedule(AUEventSampleTimeImmediate, 0, 3, &b) }
                }
            }
        }
        connectSources()
    }
    private func connectSources() {
        var names: [String] = []
        for i in 0..<MIDIGetNumberOfSources() {
            let src = MIDIGetSource(i); MIDIPortConnectSource(midiPort, src, nil)
            var n: Unmanaged<CFString>?; if MIDIObjectGetStringProperty(src, kMIDIPropertyDisplayName, &n) == noErr, let s = n?.takeRetainedValue() { names.append(s as String) }
        }
        ports = names
    }
    private func stopMIDI() { for i in 0..<MIDIGetNumberOfSources() { MIDIPortDisconnectSource(midiPort, MIDIGetSource(i)) } }

    private func restart() {
        try? AVAudioSession.sharedInstance().setActive(true)
        if !engine.isRunning { connectAndStart() }
    }
}

extension StandaloneHost: HostServices {
    func applyAudioPrefs(_ p: DevicePrefs) {
        applySession(p)
        let wasPlaying = controller?.playing ?? false
        connectAndStart()
        if wasPlaying { controller?.play() }
        let s = AVAudioSession.sharedInstance()
        controller?.toast(String(format: "Audio engine: %.1f kHz, ", s.sampleRate / 1000) + (DevicePrefs.latencies.first { $0.id == p.latency }?.name.lowercased() ?? "") + " latency")
    }
    var audioStatus: String {
        let s = AVAudioSession.sharedInstance()
        return String(format: "Running at %.1f kHz · buffer %.1f ms · output %.1f ms · engine: native (audio thread)", s.sampleRate / 1000, s.ioBufferDuration * 1000, s.outputLatency * 1000)
    }
    var midiPorts: [String] { ports }
    func setMIDIEnabled(_ on: Bool) { if on { startMIDI() } else { stopMIDI() } }
    var insertRunning: Bool { false }
    func setScreenAwake(_ on: Bool) { UIApplication.shared.isIdleTimerDisabled = on }
    func setInsert(_ on: Bool) async -> String? { on ? "The insert input is not available in the standalone app yet — load Vektur Drum FX in a host to process audio" : nil }
}
