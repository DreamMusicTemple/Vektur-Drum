// Vektur Drum — the panel's look, copied from the web app's CSS (web/src/panel.js, style.css, appearance.js).
// Every size is in the web's rem: 13 pt × the panel scale (web/src/host.js fitScale). Colours come from the selected
// theme exactly as appearance.js applyTheme() computes them. Change the web app first, then copy here.
import SwiftUI
import VekturDrumCore

// MARK: - colours

extension Color {
    /// "#rrggbb" (or "#rrggbbaa") as a colour; anything else is black.
    init(hex: String, opacity: Double = 1) {
        var s = hex.trimmingCharacters(in: .whitespaces); if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0; Scanner(string: s).scanHexInt64(&v)
        let a = s.count == 8 ? Double(v & 0xff) / 255 : 1
        if s.count == 8 { v >>= 8 }
        self.init(.sRGB, red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255, opacity: a * opacity)
    }
    init(_ r: Int, _ g: Int, _ b: Int, _ a: Double = 1) { self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: a) }
}

/// appearance.js mixHex: a → b by k, rounded per channel like the web.
func mixHex(_ a: String, _ b: String, _ k: Double) -> String {
    func p(_ h: String) -> [Int] { let s = Array(h.dropFirst()); return stride(from: 0, to: 6, by: 2).map { Int(String(s[$0...$0 + 1]), radix: 16) ?? 0 } }
    let x = p(a), y = p(b)
    return "#" + (0..<3).map { i in String(format: "%02x", Int((Double(x[i]) + Double(y[i] - x[i]) * k).rounded(.toNearestOrAwayFromZero))) }.joined()
}

/// The theme's resolved colours (appearance.js themeOf + applyTheme).
struct PanelTheme {
    let led: Color, ledHex: String, ledlo: Color, cyan: Color, ice: Color, arc: Color, arcHex: String
    let red = Color(hex: "#ff4d3d"), print = Color(hex: "#9a9ea6"), text = Color(hex: "#e4e1d8")
    let chassis: [Color]      // top, upper, body, section top, section bottom, page   (CHASSIS[k][1…6])
    let chassisHex: [String]
    let strip: [Color]        // light, mid, dark, lettering                           (STRIPS[k][1…4])

    init(_ t: AppearanceTheme) { self.init(led: t.led, display: t.display, arc: t.arc, chassis: t.chassis, strip: t.strip) }
    /// web themeOf(): a theme's colours with your own LED / display / arc colours, chassis and strip.
    init(led l: String, display d: String, arc a: String, chassis c: String, strip s: String) {
        led = Color(hex: l); ledHex = l; ledlo = Color(hex: mixHex(l, "#000000", 0.78))
        cyan = Color(hex: d); ice = Color(hex: mixHex(d, "#ffffff", 0.6)); arc = Color(hex: a); arcHex = a
        chassisHex = AppearanceTheme.chassis[c]?.colors ?? AppearanceTheme.chassis["graphite"]!.colors
        chassis = chassisHex.map { Color(hex: $0) }
        strip = (AppearanceTheme.strips[s]?.colors ?? AppearanceTheme.strips["alu"]!.colors).map { Color(hex: $0) }
    }
    static let amber = PanelTheme(AppearanceTheme.all[0])
}

// MARK: - scale (web: html{font-size:calc(13px * var(--scale))}, host.js fitScale)

struct PanelMetrics {
    let width: CGFloat           // the screen (window) width in points
    let scale: CGFloat           // --scale
    var rem: CGFloat { 13 * scale }
    /// fitScale(): on touch screens ≥ 700 pt wide, clamp(width / 1060, 1, 1.35); otherwise 1.
    init(width: CGFloat) { self.width = width; scale = width >= 700 ? min(1.35, max(1, width / 1060)) : 1 }
    init(width: CGFloat, scale: CGFloat) { self.width = width; self.scale = scale }
    func r(_ v: CGFloat) -> CGFloat { v * rem }   // rem → points
    /// The sheet: width min(80rem, 100vw) (style.css #drumModal.codelab .sheet; measured), .5rem from the top.
    var sheetWidth: CGFloat { min(80 * rem, width) }
    var sheetTop: CGFloat { 0.5 * rem }
}

private struct PanelMetricsKey: EnvironmentKey { static let defaultValue = PanelMetrics(width: 1194) }
private struct PanelThemeKey: EnvironmentKey { static let defaultValue = PanelTheme.amber }
extension EnvironmentValues {
    var panel: PanelMetrics { get { self[PanelMetricsKey.self] } set { self[PanelMetricsKey.self] = newValue } }
    var theme: PanelTheme { get { self[PanelThemeKey.self] } set { self[PanelThemeKey.self] = newValue } }
}

// MARK: - type
// The web asks for "Chakra Petch", "Avenir Next", …; Chakra Petch is not embedded, so iPhone and iPad render Avenir Next.
// ui-monospace (displays, values) is SF Mono.

enum PanelFont {
    static func ui(_ size: CGFloat, _ weight: Int) -> Font {
        let name: String
        switch weight {
        case ..<450: name = "AvenirNext-Regular"
        case ..<550: name = "AvenirNext-Medium"
        case ..<650: name = "AvenirNext-DemiBold"
        case ..<750: name = "AvenirNext-Bold"
        default: name = "AvenirNext-Heavy"
        }
        return .custom(name, fixedSize: size)
    }
    static func mono(_ size: CGFloat, _ weight: Int) -> Font {
        let w: Font.Weight = weight >= 700 ? .bold : weight >= 600 ? .semibold : weight >= 500 ? .medium : .regular
        return .system(size: size, weight: w, design: .monospaced)
    }
}

extension View {
    /// CSS letter-spacing in em.
    func letterSpacing(_ em: CGFloat, size: CGFloat) -> some View { tracking(em * size) }
}
