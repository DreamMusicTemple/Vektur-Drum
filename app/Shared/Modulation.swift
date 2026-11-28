// Vektur Drum — modulation from the panel (web/src/mod-panel.js): wires from a source to any dial, the picked-source
// tap-to-wire, the wired ring and the live light on a dial's rim, and the hold-to-modulate popup (modPopup).
// Wires go to the engine with the existing setWire command; positions come from the engine's telemetry.
import SwiftUI
import VekturDrumCore
import VekturDrumAudio

private struct DrumControllerKey: EnvironmentKey { static let defaultValue: DrumController? = nil }
extension EnvironmentValues { var drum: DrumController? { get { self[DrumControllerKey.self] } set { self[DrumControllerKey.self] = newValue } } }

struct ModPopupRequest: Equatable { var key: String; var point: CGPoint }

enum ModKeys {
    /// Parameter address → key ("t3.decay", "sl.density" …), for the engine's modulated-dial telemetry.
    static let byAddress: [UInt32: String] = {
        var d: [UInt32: String] = [:]
        for spec in ParameterSpec.master where spec.index < ParameterID.trackBase { d[spec.index] = spec.key }
        for t in 0..<TrackLimits.playable.upperBound {
            for spec in ParameterSpec.track { d[ParameterID.trackBase + UInt32(t) * ParameterID.trackStride + spec.index] = "t\(t + 1).\(spec.key)" }
        }
        return d
    }()
    /// web modDestName: "T3 · Decay", "Slicer · Density", "Metalise · On/Off".
    static func name(_ key: String) -> String {
        if key == "gl.on" { return "Metalise · On/Off" }
        guard let s = ParameterSpec.spec(forKey: key) else { return key }
        if key.first == "t", let dot = key.firstIndex(of: "."), let n = Int(key[key.index(after: key.startIndex)..<dot]) { return "T\(n) · \(s.name)" }
        return "\(group(key)) · \(s.name)"
    }
    /// web: the master parameters' group (DRUM_PARAMS q[2]).
    static func group(_ key: String) -> String {
        switch key.split(separator: ".").first.map(String.init) ?? "" {
        case "dr": return ["dr.dlydiv", "dr.dlyfb", "dr.dlytone", "dr.dlypp"].contains(key) ? "Delay" : ["dr.revsize", "dr.revdamp", "dr.revtype"].contains(key) ? "Reverb" : "Master"
        case "gl": return "Metalise"
        case "sl": return "Slicer"
        case "env": return "Env follower"
        case "ch": return "Chaos"
        case "tp": return "Tape"
        case "in": return "Input"
        case let s where s.hasPrefix("lfo"): return "LFO " + s.dropFirst(3)
        default: return "Master"
        }
    }
}

extension DrumController {
    func pushWires() { for i in 0..<DrumLists.modWires { engine.send(.setWire(slot: i, i < project.wires.count ? project.wires[i] : nil)) } }
    /// web modAddWire.
    func addWire(source s: Int, key: String, amount: Double? = nil) {
        guard let spec = ParameterSpec.spec(forKey: key), spec.isModulatable, let src = ModSource(rawValue: s) else { toast("That control can’t be modulated"); return }
        if project.wires.contains(where: { $0.source == src && $0.param == key }) { toast("\(src.name) already modulates \(ModKeys.name(key))"); return }
        guard project.wires.count < DrumLists.modWires else { toast("All 32 wires are in use: delete one first"); return }
        edit { $0.wires.append(ModWire(source: src, param: key, amount: amount ?? 0.5)) }
        pushWires(); toast("\(src.name) → \(ModKeys.name(key))")
    }
    func deleteWire(_ i: Int) { guard project.wires.indices.contains(i) else { return }; edit { $0.wires.remove(at: i) }; pushWires() }
    func setWire(_ i: Int, amount: Double? = nil, source: Int? = nil) {
        guard project.wires.indices.contains(i) else { return }
        edit { if let a = amount { $0.wires[i].amount = min(1, max(-1, a)) }; if let s = source, let src = ModSource(rawValue: s) { $0.wires[i].source = src } }
        engine.send(.setWire(slot: i, project.wires[i]))
    }
    func clearWires() { edit { $0.wires = [] }; pushWires() }
    func isWired(_ key: String) -> Bool { project.wires.contains { $0.param == key } || (key == "gl.on" && value("gl.chance") > 0) }
    /// The engine's modulated dials (web paintModDials), and the LFOs' own Metalise targets while Metalise is on.
    func updateModPositions(_ tel: EngineTelemetry) {
        var pos: [String: (Double, Int)] = [:]
        for d in tel.modulatedDials {
            guard let k = ModKeys.byAddress[d.parameter.address] else { continue }
            pos[k] = (Double(d.position), project.wires.first { $0.param == k }.map { $0.source.rawValue } ?? 2)
        }
        if value("gl.on") > 0.5, tel.modSources.count >= 3 {
            var add = [0.0, 0, 0]; var col: [Int?] = [nil, nil, nil]
            for i in 0..<3 {
                let dp = value("lfo\(i + 1).depth"); if dp == 0 { continue }
                let ds = min(2, max(0, Int(value("lfo\(i + 1).dest").rounded())))
                add[ds] += dp * Double(tel.modSources[i]); col[ds] = col[ds] ?? i
            }
            for (i, k) in ["gl.mix", "gl.size", "gl.speed"].enumerated() where col[i] != nil && pos[k] == nil {
                if let spec = ParameterSpec.spec(forKey: k) { pos[k] = (min(1, max(0, spec.normalized(value(k)) + add[i])), col[i]!) }
            }
        }
        let new = pos.mapValues { ModLight(position: $0.0, source: $0.1) }
        if new != modLights { modLights = new }
    }
}
struct ModLight: Equatable { var position: Double; var source: Int }

/// web modPopup — hold a dial: ADD a source, each wire's depth, INV, ✕; METALISE's ON adds Chance; OPEN MOD LIST.
struct ModPopupView: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let key: String
    var body: some View {
        let ws = c.project.wires.enumerated().filter { $0.element.param == key }
        VStack(alignment: .leading, spacing: m.r(0.4)) {
            HStack(spacing: m.r(0.4)) {
                Text(ModKeys.name(key).uppercased()).font(.system(size: m.r(0.68), weight: .heavy)).tracking(0.14 * m.r(0.68)).foregroundStyle(WinStyle.text)
                Spacer()
                Button("✕") { c.modPopup = nil }.buttonStyle(CButton(height: 1.6)).accessibilityLabel("Close")
            }
            if key == "gl.on" { PopNote(text: "An LFO turns Metalise on while it is above the middle (or off, inverted, while the button is ON).") }
            FlowRow(gap: m.r(0.25), rowGap: m.r(0.25)) {
                Text("ADD").font(PanelFont.ui(m.r(0.5), 400)).tracking(0.08 * m.r(0.5)).foregroundStyle(Color(hex: "#9a9ea6"))
                ForEach(0..<5, id: \.self) { s in
                    let has = c.project.wires.contains { $0.source.rawValue == s && $0.param == key }
                    Button { c.addWire(source: s, key: key, amount: key == "gl.on" ? 1 : 0.5) } label: { ModChip(source: s, level: c.modLevel(s)) }
                        .buttonStyle(.plain).disabled(has).opacity(has ? 0.35 : 1)
                }
            }
            if ws.isEmpty { PopNote(text: "No modulation yet — tap a source.") }
            ForEach(ws, id: \.offset) { i, w in
                HStack(spacing: m.r(0.3)) {
                    Text(w.source.name).font(.system(size: m.r(0.6), weight: .bold)).foregroundStyle(ModColors.color(w.source.rawValue)).frame(minWidth: m.r(4.6), alignment: .leading)
                    PopSlider(label: "Depth", value: w.amount, range: -1...1, color: ModColors.color(w.source.rawValue), format: { ($0 > 0 ? "+" : "") + "\(Int(($0 * 100).rounded()))%" }) { c.setWire(i, amount: ($0 * 100).rounded() / 100) }
                    Button("INV") { c.setWire(i, amount: -w.amount) }.buttonStyle(HBStyle())
                    Button("✕") { c.deleteWire(i) }.buttonStyle(HBStyle())
                }
                .padding(.leading, m.r(0.35)).overlay(alignment: .leading) { ModColors.color(w.source.rawValue).frame(width: 3) }
            }
            if key == "gl.on" {
                FlowRow(gap: m.r(0.35), rowGap: m.r(0.35)) {
                    PopSlider(label: "Chance", value: c.value("gl.chance"), range: 0...1, color: Color(hex: "#ffb23d"), format: { $0 < 0.01 ? "OFF (always)" : "\(Int(($0 * 100).rounded()))%" }) {
                        c.set("gl.chance", $0 < 0.01 ? 0 : ($0 * 100).rounded() / 100) }.frame(minWidth: m.r(9))
                    ParamSelect(c: c, key: "gl.chdiv", options: (ParameterSpec.spec(forKey: "gl.chdiv")?.choices ?? []).map { "every " + $0 }, fontSize: 0.7)
                }
                .padding(.top, m.r(0.35)).overlay(alignment: .top) { Color(hex: "#2a2d33").frame(height: 1) }
                PopNote(text: "While ON, Metalise plays each division with this chance (fades in and out, no clicks).")
            }
            Button("OPEN MOD LIST") { c.modPopup = nil; c.window = .mod }.buttonStyle(HBStyle())
        }
        .padding(.vertical, m.r(0.5)).padding(.horizontal, m.r(0.6))
        .frame(minWidth: m.r(18), maxWidth: min(m.r(26), m.width * 0.94), alignment: .leading)
        .background(RoundedRectangle(cornerRadius: m.r(0.55)).fill(Color(hex: "#16171b")))
        .overlay(RoundedRectangle(cornerRadius: m.r(0.55)).stroke(Color(hex: "#3a3d44"), lineWidth: 1))
        .shadow(color: .black.opacity(0.6), radius: 20, y: 12)
        .fixedSize(horizontal: false, vertical: true)
    }
}
struct PopNote: View {
    @Environment(\.panel) private var m
    let text: String
    var body: some View { Text(text).font(PanelFont.ui(m.r(0.62), 400)).foregroundStyle(Color(hex: "#9a9ea6")).lineSpacing(m.r(0.62) * 0.4).fixedSize(horizontal: false, vertical: true) }
}
/// .modpop .prow: LABEL, a thin track with a fill and a round thumb, the value. (The web's popup uses a slider here.)
struct PopSlider: View {
    @Environment(\.panel) private var m
    let label: String
    let value: Double
    let range: ClosedRange<Double>
    var color: Color
    let format: (Double) -> String
    let set: (Double) -> Void
    var body: some View {
        HStack(spacing: m.r(0.4)) {
            Text(label.uppercased()).font(.system(size: m.r(0.6), weight: .semibold)).tracking(0.06 * m.r(0.6)).foregroundStyle(Color(hex: "#9a9da4"))
            GeometryReader { g in
                let span = range.upperBound - range.lowerBound, t = span > 0 ? (value - range.lowerBound) / span : 0, w = g.size.width
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: m.r(0.3)).fill(Color(hex: "#0b0c0e")).overlay(RoundedRectangle(cornerRadius: m.r(0.3)).stroke(Color(hex: "#33363c"), lineWidth: 1))
                    RoundedRectangle(cornerRadius: m.r(0.3)).fill(color.opacity(0.7)).frame(width: w * t)
                    Circle().fill(Color(hex: "#e4e1d8")).frame(width: m.r(0.95), height: m.r(0.95)).shadow(color: .black.opacity(0.5), radius: 2).offset(x: w * t - m.r(0.475))
                }
                .frame(height: m.r(0.55)).frame(maxHeight: .infinity)
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0).onChanged { v in set(range.lowerBound + min(1, max(0, v.location.x / max(1, w))) * span) })
            }
            .frame(minWidth: m.r(5), maxWidth: .infinity).frame(height: m.r(1.2))
            Text(format(value)).font(.system(size: m.r(0.7), weight: .semibold, design: .monospaced)).foregroundStyle(WinStyle.text).lineLimit(1).frame(minWidth: m.r(3.4), alignment: .trailing)
        }
    }
}

extension DrumController {
    /// A source's meter (web paintModLive: the env follower 0…1, the others −1…1 shown from the middle).
    func modLevel(_ s: Int) -> Double {
        let v = Double(modSources[safe: s] ?? 0)
        return s == 3 ? v : v * 0.5 + 0.5
    }
}

/// A source chip you tap to pick (then tap a dial to wire it) — web modChip / modDragStart's tap.
struct ModChipButton: View {
    let c: DrumController
    let source: Int
    var compact = false
    var body: some View {
        Button {
            c.modPick = c.modPick == source ? -1 : source
            if c.modPick >= 0 { c.toast("Now tap a destination for \(DrumLists.modSources[source])") }
        } label: { ModChip(source: source, level: c.modLevel(source), compact: compact, picked: c.modPick == source) }
        .buttonStyle(.plain)
        .accessibilityLabel("\(DrumLists.modSources[source]) modulation source")
    }
}
