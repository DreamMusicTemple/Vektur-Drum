// Vektur Drum — dials: the .kcell (label, dial, value) and the dial designs, ported from web/src/helpers.js knobCtl and
// web/src/dials.js POT_DRAW. Interstellar (the default design) is drawn here exactly as the web's canvas code draws it.
// Gesture as the web: vertical drag, 160 pt for the full range; double-tap (< 300 ms) resets to the default.
import SwiftUI
import VekturDrumCore

/// One dial cell: .kcell{width:4.3rem; gap:.12rem} · .klbl .5rem · .knob 2.3rem · .kval .54rem (in #drumModal .dm).
struct KnobCell: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let label: String
    let value: Double                // 0…1 (normalised)
    let centre: Double?              // bipolar centre (0…1), nil = unipolar
    let defaultValue: Double?        // normalised, for double-tap
    let text: String                 // the value as the web prints it
    let set: (Double) -> Void
    @State private var dragStart: Double?
    @State private var lastTap = Date.distantPast

    var body: some View {
        let kw = m.r(2.3), lfs = m.r(0.5), vfs = m.r(0.54)
        VStack(spacing: m.r(0.12)) {
            Text(label.uppercased()).font(PanelFont.ui(lfs, 400)).letterSpacing(0.08, size: lfs).foregroundStyle(Color(hex: "#9a9ea6"))
                .lineLimit(1).truncationMode(.tail)
            InterstellarDial(t: value, colorHex: th.arcHex, dragging: dragStart != nil)
                .frame(width: kw * 1.22, height: kw * 1.22)     // .kv: 122 % of the knob, centred on it
                .frame(width: kw, height: kw)
                .contentShape(Circle())
                .highPriorityGesture(DragGesture(minimumDistance: 0)
                    .onChanged { g in
                        if dragStart == nil {
                            let now = Date()
                            if now.timeIntervalSince(lastTap) < 0.3, let d = defaultValue { set(d); lastTap = .distantPast; dragStart = -1; return }
                            lastTap = now; dragStart = value
                        }
                        guard let v0 = dragStart, v0 >= 0 else { return }
                        set(min(1, max(0, v0 - Double(g.translation.height) / 160)))
                    }
                    .onEnded { _ in dragStart = nil })
                .accessibilityElement().accessibilityLabel(label).accessibilityValue(text)
                .accessibilityAdjustableAction { d in set(min(1, max(0, value + (d == .increment ? 0.01 : -0.01)))) }
            Text(text).font(PanelFont.mono(vfs, 600)).foregroundStyle(Color(hex: "#d8d4c8")).lineLimit(1)
                .padding(.vertical, m.r(0.05)).padding(.horizontal, m.r(0.2))
                .frame(minWidth: m.r(2.2))
                .background(RoundedRectangle(cornerRadius: m.r(0.2)).fill(Color(hex: "#090b0c"))
                    .overlay(RoundedRectangle(cornerRadius: m.r(0.2)).stroke(Color.black.opacity(0.8), lineWidth: 2).blur(radius: 1).offset(y: 1)
                        .clipShape(RoundedRectangle(cornerRadius: m.r(0.2)))))
                .overlay(alignment: .bottom) { Color.white.opacity(0.05).frame(height: 1).offset(y: 1).padding(.horizontal, 2) }
        }
        .frame(width: m.r(4.3))
    }
}

/// web/src/dials.js POT_DRAW.interstellar — 15 growing dots on the scale, a dark conic skirt, a lit rim, the cap and
/// a white pointer. `w` is the drawing's side (the web draws relative to it, so any size is the same picture).
struct InterstellarDial: View {
    var t: Double
    var colorHex: String
    var dragging: Bool
    var body: some View {
        Canvas { cx, size in
            let w = Double(min(size.width, size.height)), cxm = w / 2, cym = w / 2
            func rgba(_ a: Double) -> Color { Color(hex: colorHex, opacity: a) }
            let nDots = 15, minR = max(1.2, w * 0.011), maxR = max(3.6, w * 0.047), ringR = w / 2 - maxR - 1
            func ptAt(_ u: Double) -> CGPoint { let an = (135 + 270 * u) * .pi / 180; return CGPoint(x: cxm + ringR * cos(an), y: cym + ringR * sin(an)) }
            func dot(_ p: CGPoint, _ rr: Double, _ c: Color) { cx.fill(Path(ellipseIn: CGRect(x: p.x - rr, y: p.y - rr, width: rr * 2, height: rr * 2)), with: .color(c)) }
            let pos = t * Double(nDots - 1)
            for i in 0..<nDots {
                let u = Double(i) / Double(nDots - 1), reveal = min(1, max(0, pos - Double(i) + 1)), p = ptAt(u)
                dot(p, minR * 0.8, Color.white.opacity(0.13))
                if reveal <= 0 { continue }
                let rr = minR * 0.8 + (minR + (maxR - minR) * pow(u, 1.15) - minR * 0.8) * reveal
                if dragging || u > 0.7 { dot(p, rr * 2.1, rgba(0.10 * reveal * (dragging ? 1.6 : 1))) }
                dot(p, rr, rgba((0.45 + 0.55 * u) * reveal))
                dot(p, rr * 0.62, Color.white.opacity(u * 0.75 * reveal))
            }
            let skirtIn = w * 0.15, skR = w / 2 - skirtIn
            let skirt = Path(ellipseIn: CGRect(x: cxm - skR, y: cym - skR, width: skR * 2, height: skR * 2))
            // conic skirt from −90°: grey .30 → .11 → .26 → .09 → .30, with a drop shadow
            cx.drawLayer { l in
                l.addFilter(.shadow(color: .black.opacity(0.8), radius: w * 0.07 / 2, x: 0, y: w * 0.06))
                l.fill(skirt, with: .conicGradient(Gradient(stops: [0.30, 0.11, 0.26, 0.09, 0.30].enumerated().map { i, g in
                    .init(color: Color(white: (g * 255).rounded() / 255), location: Double(i) * 0.25) }), center: CGPoint(x: cxm, y: cym), angle: .degrees(-90)))
            }
            // the theme colour washed over the top half (screen)
            cx.drawLayer { l in
                l.clip(to: skirt); l.blendMode = .screen
                l.fill(Path(CGRect(x: cxm - skR, y: cym - skR, width: skR * 2, height: skR * 2)),
                       with: .linearGradient(Gradient(stops: [.init(color: rgba(0.38), location: 0), .init(color: rgba(0.06), location: 0.5), .init(color: rgba(0), location: 1)]),
                                             startPoint: CGPoint(x: 0, y: cym - skR), endPoint: CGPoint(x: 0, y: cym)))
            }
            // rim
            let lw = max(1.4, w * 0.012), rimR = skR - lw / 2
            cx.stroke(Path(ellipseIn: CGRect(x: cxm - rimR, y: cym - rimR, width: rimR * 2, height: rimR * 2)),
                      with: .linearGradient(Gradient(stops: [.init(color: rgba(0.75), location: 0), .init(color: rgba(0.1), location: 0.5), .init(color: rgba(0), location: 1)]),
                                            startPoint: CGPoint(x: 0, y: cym - skR), endPoint: CGPoint(x: 0, y: cym + skR)), lineWidth: lw)
            // cap
            let capR = skR - w * 0.085
            cx.fill(Path(ellipseIn: CGRect(x: cxm - capR, y: cym - capR, width: capR * 2, height: capR * 2)),
                    with: .radialGradient(Gradient(colors: [Color(hex: "#3d3d3d"), Color(hex: "#0d0d0d")]), center: CGPoint(x: cxm, y: cym - capR * 0.64), startRadius: 0, endRadius: w * 0.42))
            // pointer
            var p = cx; p.translateBy(x: cxm, y: cym); p.rotate(by: .degrees(-135 + t * 270))
            let pw = max(3, w * 0.04), ph = w * 0.16, py0 = -(w * 0.5 - skirtIn - w * 0.12) - ph / 2
            p.fill(Path(roundedRect: CGRect(x: -pw / 2, y: py0, width: pw, height: ph), cornerRadius: pw / 2), with: .color(.white.opacity(0.92)))
        }
    }
}

// MARK: - formatting (web drumFmt / synthFmt) and a dial bound to a parameter (web dKnob)

enum ParamFormat {
    static func text(_ spec: ParameterSpec, _ v: Double) -> String {
        let u = spec.unit
        if u == "st" { return (v > 0 ? "+" : "") + String(format: abs(v) < 10 ? "%.1f" : "%.0f", v) }
        if spec.kind == .integer { return "\(Int(v.rounded()))" + (u.isEmpty ? "" : " " + u) }
        if spec.kind == .choice, !spec.choices.isEmpty { return spec.choices[min(max(Int(v.rounded()) - Int(spec.range.lowerBound), 0), spec.choices.count - 1)] }
        if u == "Hz" { return v >= 1000 ? String(format: v >= 10000 ? "%.1f kHz" : "%.2f kHz", v / 1000) : String(format: v < 10 ? "%.2f Hz" : "%.0f Hz", v) }
        if u == "s" { return v < 1 ? String(format: v < 0.01 ? "%.1f ms" : "%.0f ms", v * 1000) : String(format: "%.2f s", v) }
        if u == "ct" { return (v > 0 ? "+" : "") + String(format: "%.0f ct", v) }
        if spec.name == "Pan" || spec.name.hasSuffix(" pan") { return abs(v) < 0.01 ? "C" : (v < 0 ? "L " : "R ") + "\(Int((abs(v) * 100).rounded()))" }
        return String(format: "%.2f", v)
    }
    static func temper(_ v: Double) -> String { let p = Int((abs(v) * 100).rounded()); return p == 0 ? "NEUTRAL" : (v < 0 ? "WARM " : "COLD ") + "\(p)%" }
    static func humanise(_ h: Double) -> String { let p = Int((h * 100).rounded()); return p == 0 ? "OFF" : p > 50 ? "\(p)% +GHOSTS" : "\(p)%" }
}

/// A dial for one engine parameter (web dKnob → dKnobRaw → knobCtl), in normalised space like the web.
struct ParamKnob: View {
    let c: DrumController
    let key: String
    let label: String
    var format: ((Double) -> String)? = nil
    var body: some View {
        if let spec = ParameterSpec.spec(forKey: key) {
            let v = c.value(key), lo = spec.range.lowerBound, hi = spec.range.upperBound
            KnobCell(label: label, value: spec.normalized(v), centre: lo < 0 && hi > 0 ? spec.normalized(0) : nil,
                     defaultValue: spec.normalized(spec.defaultValue), text: format?(v) ?? ParamFormat.text(spec, v)) { t in
                c.set(key, spec.value(atNormalized: t))
            }
        }
    }
}
