// Vektur Drum — the panel's state and actions (the native counterpart of web/src/panel.js's drumState / drumPost).
// It drives the audio unit's own engine (VekturDrumAudioUnit.engine) through DrumEngine(borrowing:), keeps the song in
// the unit's AUStateKeeper (so the app, the plug-in and host saves share one source of truth), and polls the engine's
// telemetry for the running lights.
import SwiftUI
import Observation
import VekturDrumCore
import VekturDrumAudio

@MainActor @Observable
final class DrumController {
    let unit: VekturDrumAudioUnit
    @ObservationIgnored let engine: DrumEngine
    @ObservationIgnored private var poll: Timer?

    var project: DrumProject
    /// The panel's power (web: d.on). A new set starts OFF; PLAY or ON turns it on.
    var on = false
    var armedRec = false
    var transport: EngineTelemetry.Transport = .stopped
    var playingPattern = 0
    var chainPosition = 0
    var currentStep: [Int] = Array(repeating: -1, count: TrackLimits.capacity)
    /// The selected track (web DRM.trk) and step (DRM.step, −1 none).
    var selectedTrack = 0
    var selectedStep = -1
    var theme = AppearanceTheme.all[0]
    /// Bumped on every parameter change from the panel, so dials redraw (engine values are not observable themselves).
    var paramVersion = 0
    /// SEQUENCER EDIT (web DRM.edit): a tap selects a step instead of switching it.
    var editMode = false
    /// The pattern clipboard (web DRM.clip).
    var clip: Pattern?
    /// The toast line (web toast()), cleared after a moment.
    var toastText: String?
    @ObservationIgnored var toastTimer: Timer?
    /// The open window (web: the modals), nil = the panel alone.
    var window: PanelWindow?
    /// Pads lit by the engine's envelopes (web paintDrumLive: .pad.hit while the envelope > .08), and the LFO lamps 0…1.
    var padLit: [Bool] = Array(repeating: false, count: TrackLimits.capacity)
    var lfoLamp: [Double] = [0, 0, 0]
    var modSources: [Float] = []
    // undo / redo (web undo.js): snapshots of the song, captured .45 s after the last change, 60 deep
    @ObservationIgnored var undoBack: [DrumProject] = []
    @ObservationIgnored var undoFwd: [DrumProject] = []
    @ObservationIgnored var undoCur: DrumProject?
    @ObservationIgnored var undoTimer: Timer?
    @ObservationIgnored var undoApplying = false
    var undoVersion = 0
    /// The sample menu by a track name or pad (web drumSampleMenu), and the file picker it opens.
    var sampleMenu: SampleMenuRequest?
    var sampleImportTrack: Int?
    @ObservationIgnored var suppressNextTap = false
    /// The PADS window's VEL readout.
    var lastPadVelocity: Int?

    init?(unit: VekturDrumAudioUnit) {
        guard let raw = unit.engine, let keeper = unit.keeper else { return nil }
        self.unit = unit
        engine = DrumEngine(borrowing: raw)
        project = keeper.currentProject()
        undoCur = project
        keeper.onRestored = { [weak self] _ in self?.reloadFromKeeper() }
        unit.standaloneTempo = project.tempo
        startPolling()
    }

    /// The web app's new set (pattern 1 has the starter groove), exported from the web app into Starter.json.
    static func starterState() -> [String: Any]? {
        guard let url = Bundle.main.url(forResource: "Starter", withExtension: "json"), let data = try? Data(contentsOf: url) else { return nil }
        return [AUStateKeeper.stateKey: data]
    }

    func reloadFromKeeper() { if let k = unit.keeper { project = k.currentProject(); unit.standaloneTempo = project.tempo; paramVersion &+= 1 } }
    /// The standalone tempo (web S.bpm; the MASTER Tempo dial, 40…240).
    func setTempo(_ bpm: Double) { let v = min(240, max(40, (bpm * 2).rounded() / 2)); edit { $0.tempo = v }; unit.standaloneTempo = v }

    // MARK: - telemetry (web: paintDrumLive, ~30 Hz)
    private func startPolling() {
        let t = Timer(timeInterval: 1.0 / 30, repeats: true) { [weak self] _ in MainActor.assumeIsolated { self?.tick() } }
        RunLoop.main.add(t, forMode: .common); poll = t
    }
    private var gcCount = 0
    private func tick() {
        if let tel = engine.telemetry() {
            if tel.transport != transport { transport = tel.transport }
            if tel.currentPattern != playingPattern { playingPattern = tel.currentPattern }
            if tel.chainPosition != chainPosition { chainPosition = tel.chainPosition }
            var steps = tel.currentStep; if steps.count < TrackLimits.capacity { steps += Array(repeating: -1, count: TrackLimits.capacity - steps.count) }
            if steps != currentStep { currentStep = steps }
            var lit = padLit
            for t in 0..<min(tel.envelope.count, lit.count) { lit[t] = tel.envelope[t] > 0.08 }
            if lit != padLit { padLit = lit }
            if tel.modSources != modSources { modSources = tel.modSources }
            if tel.modSources.count >= 3 {
                let l = (0..<3).map { (0.15 + 0.85 * (Double(tel.modSources[$0]) * 0.5 + 0.5) * 100).rounded() / 100 }
                if l != lfoLamp { lfoLamp = l }
            }
        }
        if armedRec, let hits = unit.keeper?.takeRecordedHits(), !hits.isEmpty { reloadFromKeeper() }
        gcCount += 1; if gcCount >= 30 { gcCount = 0; engine.collectGarbage() }   // free replaced samples about once a second
    }

    // MARK: - actions (web: the top strip, TRANSPORT, PATTERN, the step keys)
    var trackCount: Int { project.trackCount }
    var playing: Bool { transport == .running }

    func setOn(_ v: Bool) {
        on = v
        engine.send(.enable(v))
        if !v { engine.send(.transport(play: false)) }
    }
    func play() { if !on { setOn(true) }; engine.send(.transport(play: true)) }
    func stop() { engine.send(.transport(play: false)) }
    func toggleRec() { armedRec.toggle(); engine.send(.recordArm(armedRec)) }

    func setTrackCount(_ n: Int) {
        guard TrackLimits.playable.contains(n) else { return }
        edit { $0.trackCount = n }
        engine.send(.setTrackCount(n))
        if selectedTrack >= n { selectedTrack = n - 1 }
    }
    func selectPattern(_ p: Int) {
        edit { $0.selectedPattern = p }
        engine.send(.selectPattern(p))
    }
    /// A tap on a step key: off → on at velocity .8, ratchet 1 (web stepEvents); on → off.
    func toggleStep(track t: Int, step s: Int) {
        let p = project.selectedPattern
        var new: Step? = nil
        if project.patterns[p].tracks[t].steps[s] == nil { var st = Step(); st.velocity = 0.8; st.ratchet = 1; new = st }
        edit { $0.patterns[p].tracks[t].steps[s] = new }
        engine.send(.setStep(pattern: p, track: t, step: s, new))
        if new != nil { selectedTrack = t; selectedStep = s }
    }
    func value(_ key: String) -> Double {
        _ = paramVersion
        guard let id = ParameterID(key: key) else { return 0 }
        return engine.parameter(id)
    }
    func set(_ key: String, _ v: Double) {
        guard let id = ParameterID(key: key) else { return }
        engine.setParameter(id, v); paramVersion &+= 1; dirty()
    }

    /// One edit to the song: here (for the panel) and in the unit's keeper (for saving and the plug-in).
    func edit(_ f: (inout DrumProject) -> Void) { f(&project); unit.keeper?.update(f); dirty() }

    // MARK: - names (web drumTrackName)
    static let short = ["KICK", "SNARE", "C.HAT", "O.HAT", "CLAP", "TOM", "RIM", "BELL"]
    static let fmShort = ["CLASSIC", "STACK", "PARALLEL", "METAL"]
    func trackName(_ t: Int) -> String {
        let n = t + 1, e = Int(value("t\(n).engine").rounded())
        if e == 1 { return project.tracks[t].sample.map { abbreviate($0.name, max: 10) } ?? "NO SAMPLE" }
        if e == 2 { return "FM " + (Self.fmShort[safe: Int(value("t\(n).fmalgo").rounded())] ?? "") }
        return Self.short[safe: Int(value("t\(n).model").rounded())] ?? "T\(n)"
    }
}

extension Array { subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil } }

/// web/src/panel.js drumAbbrev (0.9.1): a sample name shortened to fit a pad, with room either side.
func abbreviate(_ name: String, max: Int) -> String {
    var s = name
    if let r = s.range(of: #"\.(wav|wave|flac|aif|aiff|mp3|ogg|m4a)$"#, options: [.regularExpression, .caseInsensitive]) { s.removeSubrange(r) }
    s = s.replacingOccurrences(of: #"([a-z])([A-Z])"#, with: "$1 $2", options: .regularExpression).uppercased()
    var words = s.components(separatedBy: CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789").inverted).filter { !$0.isEmpty }
    guard !words.isEmpty else { return "" }
    let full = words.joined(separator: " "); if full.count <= max { return full }
    words = words.filter { $0.range(of: #"^\d+BPM$|^BPM$"#, options: .regularExpression) == nil }
    if words.isEmpty { return String(full.prefix(max)) }
    var num = ""
    if words.count > 1, let last = words.last, last.allSatisfy(\.isNumber) { num = words.removeLast() }
    if !num.isEmpty && max - num.count - 1 < 3 { num = "" }
    let budget = max - (num.isEmpty ? 0 : num.count + 1), rest = words.joined(separator: " ")
    func short(_ w: String) -> String {
        if w.allSatisfy(\.isNumber) || w.count <= 3 { return w }
        var t = String(w.first!) + w.dropFirst().filter { !"AEIOUY".contains($0) }
        t = t.replacingOccurrences(of: #"(.)\1+"#, with: "$1", options: .regularExpression)
        return String(t.prefix(4))
    }
    var out = ""
    if rest.count <= budget { out = rest } else {
        for w in words {
            let part = out.isEmpty ? (w.count <= budget ? w : short(w)) : short(w)
            let cand = (out.isEmpty ? "" : out + " ") + part
            if cand.count <= budget { out = cand; continue }
            let room = budget - out.count - (out.isEmpty ? 0 : 1)
            if room >= 2 { out += (out.isEmpty ? "" : " ") + String(part.prefix(room)) }
            break
        }
    }
    return String(((out.isEmpty ? String(words[0].prefix(budget)) : out) + (num.isEmpty ? "" : " " + num)).prefix(max))
}
