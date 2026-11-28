// Vektur Drum — this device's preferences (web/src/settings.js PREFS and appearance.js PREFS.theme / PREFS.steps / the dial
// design): audio, power, MIDI and its CC map, colours, dial and step designs. Saved on the device, never in the song.
import SwiftUI
import VekturDrumCore

struct ThemePrefs: Codable, Equatable {
    var id = "amber"
    var led: String? = nil, disp: String? = nil, arc: String? = nil, chassis: String? = nil, strip: String? = nil
}
struct CCMapEntry: Codable, Equatable { var cc: Int; var ch: Int }

struct DevicePrefs: Codable, Equatable {
    var sampleRate: Double = 0              // 0 = device default
    var latency = "interactive"             // interactive · balanced · playback
    var battery = false
    var noSleep = false
    var background = true
    var midiIn = true
    var ccMap: [String: CCMapEntry] = DevicePrefs.ccFactory()
    var theme = ThemePrefs()
    var dial = AppearanceTheme.defaultDialStyle
    var steps = AppearanceTheme.defaultStepStyle

    static let key = "vekturdrum.prefs.v1"
    static func load() -> DevicePrefs {
        guard let d = UserDefaults.standard.data(forKey: key), let p = try? JSONDecoder().decode(DevicePrefs.self, from: d) else { return DevicePrefs() }
        return p
    }
    func save() { if let d = try? JSONEncoder().encode(self) { UserDefaults.standard.set(d, forKey: Self.key) } }

    /// web ccFactory: the factory MIDI CC map (any channel).
    static func ccFactory() -> [String: CCMapEntry] {
        var m: [String: CCMapEntry] = [:]
        func put(_ cc: Int, _ k: String) { m[k] = CCMapEntry(cc: cc, ch: 0) }
        for t in 1...9 { put(19 + t, "t\(t).level"); put(29 + t, "t\(t).tune"); put(39 + t, "t\(t).decay"); put(101 + t, "t\(t).pan") }
        put(7, "dr.level"); put(9, "dr.swing"); put(12, "dr.temper"); put(16, "dr.human"); put(13, "dr.dlyfb"); put(14, "dr.revsize"); put(15, "dr.dlytone")
        put(50, "gl.on"); put(51, "gl.mix"); put(52, "gl.size"); put(53, "gl.speed"); put(54, "gl.mode")
        put(55, "lfo1.depth"); put(56, "lfo2.depth"); put(57, "lfo3.depth"); put(58, "lfo1.rate"); put(59, "lfo2.rate"); put(60, "lfo3.rate")
        put(61, "sl.on"); put(62, "sl.mix"); put(63, "sl.density"); put(64, "sl.evolve"); put(65, "sl.hold"); put(66, "sl.seed"); put(67, "sl.pitch"); put(68, "env.gain"); put(69, "ch.rate")
        return m
    }
    static let latencies: [(id: String, name: String, text: String)] = [
        ("interactive", "Low", "Shortest buffer: tightest pads and MIDI. Uses the most power; may crackle on a busy device."),
        ("balanced", "Balanced", "A middle buffer: safe for most devices."),
        ("playback", "Stable", "Longest buffer: the most robust and battery-friendly; pads and MIDI respond later.")]
    static let rates: [(Double, String)] = [(0, "Device default"), (44100, "44.1 kHz"), (48000, "48 kHz"), (88200, "88.2 kHz"), (96000, "96 kHz")]
}

/// What the standalone app does for SETTINGS (audio session, MIDI ports, insert input). The plug-in has none: its host
/// app owns the audio session and MIDI routing.
@MainActor protocol HostServices: AnyObject {
    func applyAudioPrefs(_ p: DevicePrefs)
    var audioStatus: String { get }
    var midiPorts: [String] { get }
    func setMIDIEnabled(_ on: Bool)
    var insertRunning: Bool { get }
    func setInsert(_ on: Bool) async -> String?    // nil = done, else the reason it could not start
}

extension DrumController {
    /// The resolved theme (web themeOf + applyTheme).
    var panelTheme: PanelTheme {
        let t = prefs.theme, base = AppearanceTheme.all.first { $0.id == t.id } ?? AppearanceTheme.all[0]
        func hex(_ v: String?) -> String? { guard let v, v.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil else { return nil }; return v }
        return PanelTheme(led: hex(t.led) ?? base.led, display: hex(t.disp) ?? base.display, arc: hex(t.arc) ?? base.arc,
                          chassis: AppearanceTheme.chassis[t.chassis ?? ""] != nil ? t.chassis! : base.chassis,
                          strip: AppearanceTheme.strips[t.strip ?? ""] != nil ? t.strip! : base.strip)
    }
    func updatePrefs(_ f: (inout DevicePrefs) -> Void) { f(&prefs); prefs.save(); applyPowerPrefs() }
    func applyPowerPrefs() {
        UIApplication.shared.isIdleTimerDisabled = prefs.noSleep
    }
    /// A CC from MIDI (web vdMidi): learn, or move every parameter mapped to it.
    func takeCC(_ cc: Int, channel: Int, value: Int) {
        lastCC = (cc, channel, value)
        if let k = learnKey {
            for (p, e) in prefs.ccMap where e.cc == cc { prefs.ccMap[p] = nil }
            updatePrefs { $0.ccMap[k] = CCMapEntry(cc: cc, ch: 0) }
            toast("CC \(cc) → \(Self.paramLabel(k))"); learnKey = nil; return
        }
        for (k, e) in prefs.ccMap where e.cc == cc && (e.ch == 0 || e.ch == channel) {
            if let s = ParameterSpec.spec(forKey: k) { set(k, s.value(atNormalized: Double(value) / 127)) }
        }
    }
    /// web paramLabel.
    static func paramLabel(_ key: String) -> String {
        guard let s = ParameterSpec.spec(forKey: key) else { return key }
        if key.first == "t", let dot = key.firstIndex(of: "."), let n = Int(key[key.index(after: key.startIndex)..<dot]) { return "Track \(n) · \(s.name)" }
        let g = ModKeys.group(key); return g == "Master" ? s.name : "\(g) · \(s.name)"
    }
}
