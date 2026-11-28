// Vektur Drum — the panel's small controls, copied from the web CSS: the dropdown (.oled select), a dial for any value
// (web slider({knob:true})), the dial cell for a parameter list choice (.kcell with a select), the modulation chip
// (.modchip) and helpers shared by the lower sections and the windows.
import SwiftUI
import VekturDrumCore

/// The reference render (ImageRenderer) draws the panel without UIKit-backed pieces such as the system pop-up list.
private struct ReferenceRenderKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues { var referenceRender: Bool { get { self[ReferenceRenderKey.self] } set { self[ReferenceRenderKey.self] = newValue } } }

/// An .oled select: the closed box exactly as the web draws it (#030506, 1px #1d2a30, radius .2rem, height 1.6rem,
/// the text and its chevron in the display colour), in an .oled panel padded .1rem. Tapped, it opens the iOS system list
/// — what the web app's <select> opens on an iPad — with the current choice ticked.
struct PanelSelect: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    @Environment(\.referenceRender) private var reference
    let options: [String]
    let selected: Int
    var fontSize: CGFloat = 0.74        // rem (.oled select{font:inherit}; some selects set their own size)
    var width: CGFloat? = nil           // rem: a fixed select width (width:100% in a sized cell); nil = as wide as the longest choice
    var panelPad: CGFloat = 0.1         // rem: the .oled wrapper's padding
    var label: String = ""
    let set: (Int) -> Void

    var body: some View {
        let fs = m.r(fontSize)
        let box = HStack(spacing: m.r(0.25)) {
            ZStack(alignment: .leading) {   // as wide as the longest option, like a <select>
                ForEach(options.indices, id: \.self) { i in Text(options[i]).opacity(i == selected ? 1 : 0) }
            }
            .font(PanelFont.mono(fs, 600)).foregroundStyle(th.cyan).lineLimit(1)
            .frame(maxWidth: width == nil ? nil : .infinity, alignment: .leading)
            Image(systemName: "chevron.down").font(.system(size: fs * 0.82, weight: .heavy)).foregroundStyle(th.cyan)
        }
        .padding(.leading, m.r(0.4)).padding(.trailing, m.r(0.3))
        .frame(width: width.map { m.r($0) - 2 * m.r(panelPad) - 2 }, height: m.r(1.6))
        .background(RoundedRectangle(cornerRadius: m.r(0.2)).fill(Color(hex: "#030506")))
        .overlay(RoundedRectangle(cornerRadius: m.r(0.2)).stroke(Color(hex: "#1d2a30"), lineWidth: 1))
        .clipped()
        OledBox(pad: panelPad) {
            if reference { box } else {
                Menu {
                    Picker(label, selection: Binding(get: { selected }, set: { set($0) })) {
                        ForEach(options.indices, id: \.self) { Text(options[$0]).tag($0) }
                    }
                } label: { box }
                .menuStyle(.button).buttonStyle(.plain)
                .accessibilityLabel(label)
            }
        }
    }
}

/// The .oled panel around something else (min-width:0, a given padding).
struct OledBox<Content: View>: View {
    @Environment(\.panel) private var m
    var pad: CGFloat = 0.1
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(m.r(pad))
            .background {
                ZStack {
                    Color(hex: "#030506")
                    RoundedRectangle(cornerRadius: m.r(0.3)).stroke(Color.black.opacity(0.95), lineWidth: 5).blur(radius: 2.5).offset(y: 2)
                }.clipShape(RoundedRectangle(cornerRadius: m.r(0.3)))
            }
            .overlay(RoundedRectangle(cornerRadius: m.r(0.3)).stroke(Color.black, lineWidth: 1))
            .overlay(alignment: .bottom) { Color.white.opacity(0.07).frame(height: 1).offset(y: 1).padding(.horizontal, m.r(0.3)) }
    }
}

/// A .kcell holding a select instead of a dial: the label, then the select (web: Delay, Reverb, Model, Transient …).
struct SelectCell: View {
    @Environment(\.panel) private var m
    let label: String
    let options: [String]
    let selected: Int
    var cellWidth: CGFloat = 3.35       // rem
    var fontSize: CGFloat = 0.74
    var fillWidth = false               // .vsel select{width:100%}
    let set: (Int) -> Void
    var body: some View {
        let lfs = m.r(0.5)
        VStack(spacing: m.r(0.05)) {
            Text(label.uppercased()).font(PanelFont.ui(lfs, 400)).letterSpacing(0.08, size: lfs).foregroundStyle(Color(hex: "#9a9ea6")).lineLimit(1)
            PanelSelect(options: options, selected: selected, fontSize: fontSize, width: fillWidth ? cellWidth : nil, label: label, set: set)
                .fixedSize()
                .frame(width: m.r(cellWidth))   // a wider select runs past the cell, centred (align-items:center)
        }
        .frame(width: m.r(cellWidth))
    }
}

/// A select bound to a choice parameter.
struct ParamSelectCell: View {
    let c: DrumController
    let key: String
    let label: String
    var options: [String]? = nil
    var cellWidth: CGFloat = 3.35
    var fontSize: CGFloat = 0.74
    var fillWidth = false
    var body: some View {
        let spec = ParameterSpec.spec(forKey: key)
        let opts = options ?? spec?.choices ?? []
        SelectCell(label: label, options: opts, selected: min(max(0, Int(c.value(key).rounded()) - Int(spec?.range.lowerBound ?? 0)), max(0, opts.count - 1)),
                   cellWidth: cellWidth, fontSize: fontSize, fillWidth: fillWidth) { i in c.set(key, Double(i) + (spec?.range.lowerBound ?? 0)) }
    }
}
/// A bare select bound to a choice parameter (no label).
struct ParamSelect: View {
    let c: DrumController
    let key: String
    var options: [String]? = nil
    var fontSize: CGFloat = 0.74
    var then: (() -> Void)? = nil
    var body: some View {
        let spec = ParameterSpec.spec(forKey: key)
        let opts = options ?? spec?.choices ?? []
        PanelSelect(options: opts, selected: min(max(0, Int(c.value(key).rounded()) - Int(spec?.range.lowerBound ?? 0)), max(0, opts.count - 1)), fontSize: fontSize, label: spec?.name ?? key) { i in
            c.set(key, Double(i) + (spec?.range.lowerBound ?? 0)); then?()
        }
    }
}

/// web slider({knob:true, min, max, def, step, get, set, fmt}): a dial over any range.
struct ValueKnob: View {
    let label: String
    let value: Double
    let range: ClosedRange<Double>
    var defaultValue: Double
    var step: Double? = nil
    var bipolar = false
    var cellWidth: CGFloat = 3.35
    var knobSize: CGFloat = 2.3
    let format: (Double) -> String
    let set: (Double) -> Void
    var body: some View {
        let lo = range.lowerBound, span = range.upperBound - range.lowerBound
        let norm = { (v: Double) in span > 0 ? (min(max(v, lo), range.upperBound) - lo) / span : 0 }
        KnobCell(label: label, value: norm(value), centre: (bipolar || (lo < 0 && range.upperBound > 0)) ? norm(0) : nil, defaultValue: norm(defaultValue),
                 text: format(value), cellWidth: cellWidth, knobSize: knobSize) { t in
            var v = lo + t * span
            if let st = step { v = (v / st).rounded() * st }
            set(v)
        }
    }
}

/// .modchip — a modulation source chip (border and text in the source colour, a level meter along the bottom).
enum ModColors { static let hex = ["#3fd7ff", "#ffb43c", "#ff5ad2", "#6dff8a", "#ff5a4e"]; static func color(_ s: Int) -> Color { Color(hex: hex[min(max(s, 0), 4)]) } }
struct ModChip: View {
    @Environment(\.panel) private var m
    let source: Int
    var level: Double = 0.5             // 0…1, the meter
    var compact = false                 // .dmlfochip: padding .08rem .4rem, .5rem
    var picked = false
    var body: some View {
        let col = ModColors.color(source), fs = m.r(compact ? 0.5 : 0.68)
        Text(DrumLists.modSources[source].replacingOccurrences(of: "Env follower", with: "ENV").uppercased())
            .font(PanelFont.ui(fs, 700)).letterSpacing(0.08, size: fs).foregroundStyle(col).lineLimit(1)
            .padding(.vertical, m.r(compact ? 0.08 : 0.45)).padding(.horizontal, m.r(compact ? 0.4 : 0.55))
            .frame(minWidth: compact ? 0 : m.r(4.6))
            .background(Color(hex: "#15171a"))
            .overlay(alignment: .bottomLeading) { GeometryReader { g in col.frame(width: g.size.width * min(1, max(0, level)), height: 3).frame(maxHeight: .infinity, alignment: .bottom) } }
            .clipShape(RoundedRectangle(cornerRadius: m.r(0.45)))
            .overlay(RoundedRectangle(cornerRadius: m.r(0.45)).stroke(col, lineWidth: 1))
            .shadow(color: picked ? col : .clear, radius: picked ? 6 : 0)
    }
}

/// .dmnote — the small print under a section.
struct PanelNote: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let text: String
    var maxWidth: CGFloat? = 17.2       // rem
    var size: CGFloat = 0.6
    var body: some View {
        Text(text).font(PanelFont.ui(m.r(size), 400)).foregroundStyle(th.print).lineSpacing(m.r(size) * 0.3)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: maxWidth.map { m.r($0) }, alignment: .leading)
    }
}

/// A small grouped label inside a box (.dmxg>i, .dmvint>.dmvlbl, .dmeqb>i): 600 .46rem, letter-spacing .14em, #7d8189.
struct TinyLabel: View {
    @Environment(\.panel) private var m
    let text: String
    var size: CGFloat = 0.46
    var spacing: CGFloat = 0.14
    var body: some View { Text(text).font(PanelFont.ui(m.r(size), 600)).letterSpacing(spacing, size: m.r(size)).foregroundStyle(Color(hex: "#7d8189")).lineLimit(1).fixedSize() }
}

/// Percent / OFF formats the web uses a lot.
enum Fmt {
    static func pct(_ x: Double) -> String { "\(Int((x * 100).rounded()))%" }
    static func pctOff(_ x: Double) -> String { x <= 0 ? "OFF" : pct(x) }
    /// web specColourName: the spectral Colour dial's manipulation and its setting.
    static func specColour(_ c: Double) -> String {
        let zones = ["Smear", "Shift", "Harmonic", "Robot", "Whisper", "Freeze"]
        let z = min(5, Int((c * 6).rounded(.down))), f = c * 6 - Double(z), n = zones[z].uppercased()
        switch z {
        case 0: return "\(n) \(Int((f * 100).rounded()))%"
        case 1: return "\(n) \(f < 0.5 ? "↓" : "↑")\(Int((abs(f * 2 - 1) * 100).rounded()))"
        case 2: let hz = 48000 / 256 * (1.5 + f * 14); return "\(n) " + (hz >= 1000 ? String(format: "%.1fk", hz / 1000) : "\(Int(hz.rounded()))")
        case 3: return "\(n) " + (f < 0.45 ? "DARK" : f > 0.55 ? "BRIGHT" : "FLAT")
        case 4: return "\(n) \(Int((f * 100).rounded()))"
        default: return "\(n) " + String(format: "%.1fs", 0.15 + f * 6)
        }
    }
}
