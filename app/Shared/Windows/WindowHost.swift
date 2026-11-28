// Vektur Drum — the windows over the panel (web: .modal with a .sheet), the toast, and the router from the top strip's
// buttons to each window. Shell styles from web/src/style.css (.modal, .sheet, .cbtn) and each window's own CSS.
import SwiftUI
import VekturDrumCore

/// web .toast: centred, 2rem from the bottom, the accent colour, bold.
struct ToastView: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let text: String
    var body: some View {
        Text(text).font(PanelFont.ui(m.r(1), 700)).foregroundStyle(Color(hex: "#111111"))
            .padding(.vertical, m.r(0.6)).padding(.horizontal, m.r(1))
            .background(RoundedRectangle(cornerRadius: m.r(0.4)).fill(th.led))
            .padding(.bottom, m.r(2)).allowsHitTesting(false)
            .transition(.opacity)
    }
}

struct WindowHost: View {
    let c: DrumController
    let window: PanelWindow
    var body: some View {
        switch window {
        case .presets: PresetsWindow(c: c)
        case .slicer: SlicerWindow(c: c)
        case .mod: ModWindow(c: c)
        case .breakLab: BreakLabWindow(c: c)
        case .generate: GenerateWindow(c: c)
        case .export: ExportWindow(c: c)
        case .settings: SettingsWindow(c: c)
        case .ring(let t, let s): RingWindow(c: c, track: t, step: s)
        case .pads: PadsWindow(c: c)
        }
    }
}

/// .modal + .sheet: the page dimmed (rgba(0,0,0,.55)), the sheet centred — var(--panel), 1px var(--line), radius .6rem,
/// padding 1rem 1.2rem, width min(w rem, 94vw), max-height 90vh (it scrolls), its title (h2 1.2rem) and Close (.cbtn).
struct ModalSheet<Content: View>: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    let title: String
    var width: CGFloat = 46          // rem
    var dim = true
    var closeLabel = "Close"
    var onClose: (() -> Void)? = nil
    var titleSize: CGFloat = 1.2       // rem (h2)
    var pad: (v: CGFloat, h: CGFloat) = (1, 1.2)
    var accessory: AnyView? = nil      // controls between the title and Close (h2 children)
    @ViewBuilder var content: Content
    var body: some View {
        GeometryReader { g in
            ZStack {
                if dim { Color.black.opacity(0.55).ignoresSafeArea().onTapGesture { c.window = nil } }
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .center, spacing: m.r(0.4)) {
                        Text(title).font(PanelFont.ui(m.r(titleSize), 700)).foregroundStyle(WinStyle.text)
                        Spacer(minLength: m.r(0.5))
                        if let accessory { accessory }
                        Button(closeLabel) { if let f = onClose { f() } else { c.window = nil } }.buttonStyle(CButton())
                    }
                    .padding(.top, m.r(0.2)).padding(.bottom, m.r(0.4))
                    ScrollView(.vertical) { content.frame(maxWidth: .infinity, alignment: .leading) }
                        .scrollIndicators(.hidden)
                }
                .padding(.vertical, m.r(pad.v)).padding(.horizontal, m.r(pad.h))
                .frame(width: min(m.r(width), g.size.width * 0.94))
                .frame(maxHeight: g.size.height * 0.9)
                .fixedSize(horizontal: false, vertical: true)
                .background(RoundedRectangle(cornerRadius: m.r(0.6)).fill(th.chassis[2]))   // body .sheet{background:c[3]; border: c[3] + 12 % white}
                .overlay(RoundedRectangle(cornerRadius: m.r(0.6)).stroke(Color(hex: mixHex(th.chassisHex[2], "#ffffff", 0.12)), lineWidth: 1))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}

enum WinStyle {
    static let panel = Color(hex: "#1F221A"), panel2 = Color(hex: "#161812"), line = Color(hex: "#2C3024")
    static let text = Color(hex: "#E9E8DF"), muted = Color(hex: "#A9AC9A"), accent = Color(hex: "#FF7A1A"), accentText = Color(hex: "#161812")
}

/// .cbtn — the windows' plain buttons: height 2.4rem, min-width 2.4rem, 1px var(--line), radius .25rem, .8rem; .on = accent.
struct CButton: ButtonStyle {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    var on = false
    var height: CGFloat = 2.4
    var fontSize: CGFloat = 0.8
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(PanelFont.ui(m.r(fontSize), 500)).foregroundStyle(on ? Color(hex: "#111111") : WinStyle.text)
            .padding(.horizontal, m.r(0.4))
            .frame(minWidth: m.r(2.4), minHeight: m.r(height))
            .background(RoundedRectangle(cornerRadius: m.r(0.25)).fill(on ? th.led : Color.clear))
            .overlay(RoundedRectangle(cornerRadius: m.r(0.25)).stroke(on ? th.led : WinStyle.line, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.7 : 1)
            .contentShape(Rectangle())
    }
}

/// .sheet h4: .8rem, letter-spacing .12em, var(--muted), uppercase, margin 1.1rem 0 .5rem.
struct SheetHeading: View {
    @Environment(\.panel) private var m
    let text: String
    var body: some View {
        Text(text.uppercased()).font(PanelFont.ui(m.r(0.8), 700)).tracking(0.12 * m.r(0.8)).foregroundStyle(WinStyle.muted)
            .padding(.top, m.r(1.1)).padding(.bottom, m.r(0.5))
    }
}

/// .clhelp — a window's help line: .8rem, var(--muted).
struct HelpText: View {
    @Environment(\.panel) private var m
    let text: String
    var size: CGFloat = 0.8
    var body: some View { Text(text).font(PanelFont.ui(m.r(size), 400)).foregroundStyle(WinStyle.muted).fixedSize(horizontal: false, vertical: true).padding(.top, m.r(0.5)) }
}
