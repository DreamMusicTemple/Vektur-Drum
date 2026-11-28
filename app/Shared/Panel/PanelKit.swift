// Vektur Drum — the web panel's building blocks in SwiftUI: .hb buttons with their LED, .dmsec sections, .oled
// displays. Values are the CSS ones (web/src/panel.js, style.css); sizes in rem (PanelMetrics.r).
import SwiftUI

// MARK: - .hb (raised hardware button) and .led

enum HBSize { case normal, sm }
enum HBLed { case none, amber, cyan, red }   // .hb + led · .hb.cy · .hb.rec

struct HBStyle: ButtonStyle {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    var size: HBSize = .sm
    var minWidth: CGFloat? = nil          // rem, overrides the size's min-width (.hb.wide 3.6, .dmname …)
    var height: CGFloat? = nil            // rem
    var fontSize: CGFloat? = nil          // rem
    var letterSpacing: CGFloat = 0.14     // em
    var paddingX: CGFloat? = nil          // rem
    var led: HBLed = .none
    var on = false
    var selected = false                  // outline 2px var(--cyan), offset 1px
    var alignment: Alignment = .center
    var fill = false                      // stretch to the space offered (grid cells: .dmpats)

    func makeBody(configuration: Configuration) -> some View {
        let h = m.r(height ?? (size == .sm ? 1.9 : 2.4)), minW = m.r(minWidth ?? (size == .sm ? 1.9 : 2.6))
        let fs = m.r(fontSize ?? (size == .sm ? 0.58 : 0.62)), px = m.r(paddingX ?? (size == .sm ? 0.35 : 0.55))
        let down = configuration.isPressed, radius = m.r(0.32)
        return configuration.label
            .font(PanelFont.ui(fs, 700)).letterSpacing(letterSpacing, size: fs)
            .foregroundStyle(Color(hex: "#d9d6cd"))
            .padding(.horizontal, px)
            .frame(minWidth: minW - 2, maxWidth: fill ? .infinity : nil, minHeight: h - 2, maxHeight: h - 2, alignment: alignment)
            .background {
                ZStack {
                    if down {
                        LinearGradient(colors: [Color(hex: "#26282b"), Color(hex: "#2f3135")], startPoint: .top, endPoint: .bottom)
                        // inset 0 .12rem .25rem rgba(0,0,0,.8)
                        RoundedRectangle(cornerRadius: radius - 1).stroke(Color.black.opacity(0.8), lineWidth: m.r(0.25))
                            .blur(radius: m.r(0.12)).offset(y: m.r(0.12)).clipShape(RoundedRectangle(cornerRadius: radius - 1))
                    } else {
                        LinearGradient(stops: [.init(color: Color(hex: "#45484d"), location: 0), .init(color: Color(hex: "#2b2d31"), location: 0.55),
                                               .init(color: Color(hex: "#232528"), location: 1)], startPoint: .top, endPoint: .bottom)
                        VStack(spacing: 0) { Color.white.opacity(0.2).frame(height: 1); Spacer(minLength: 0) }   // inset 0 1px 0 rgba(255,255,255,.2)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: radius - 1))
            }
            .overlay(alignment: .topTrailing) { if led != .none { LedView(color: ledColor, lit: on).padding(.top, m.r(0.28) - 1).padding(.trailing, m.r(0.3) - 1) } }
            .padding(1)
            .background(RoundedRectangle(cornerRadius: radius).fill(Color(hex: "#050506")))   // border 1px #050506
            .shadow(color: down ? .clear : Color.black.opacity(0.7), radius: m.r(0.2) / 2, x: 0, y: m.r(0.15))
            .overlay { if selected { RoundedRectangle(cornerRadius: radius + 1).stroke(th.cyan, lineWidth: 2).padding(-3) } }
            .offset(y: down ? 1 : 0)
            .contentShape(Rectangle())
    }
    private var ledColor: Color { switch led { case .cyan: return th.cyan; case .red: return th.red; default: return th.led } }
}

/// .hb .led — .36rem, off: var(--ledlo) with an inset shadow; on: the LED colour with a 4px glow.
struct LedView: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    var color: Color
    var lit: Bool
    var body: some View {
        let d = m.r(0.36)
        Circle().fill(lit ? color : th.ledlo)
            .overlay { if !lit { Circle().stroke(Color.black.opacity(0.6), lineWidth: 1).blur(radius: 0.5).offset(y: 1).clipShape(Circle()) } }
            .frame(width: d, height: d)
            .shadow(color: lit ? color : .clear, radius: 2)
    }
}

// MARK: - .dmsec (a recessed section with an h5 title)

enum SectionZone { case none, ctl, fx, mod, play, seq, snd, step
    /// --zt tints (#drumModal .dm .dmsec.z-*)
    var tint: Color {
        switch self {
        case .none: return .clear
        case .ctl: return Color(205, 212, 225, 0.13)
        case .fx: return Color(0, 0, 0, 0.5)
        case .mod: return Color(214, 204, 255, 0.08)
        case .play: return Color(255, 236, 214, 0.15)
        case .seq: return Color(255, 255, 255, 0.035)
        case .snd: return Color(255, 255, 255, 0.095)
        case .step: return Color(185, 198, 232, 0.075)
        }
    }
}

struct PanelSection<Content: View>: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    var title: String
    var extra: String? = nil
    var zone: SectionZone = .none
    @ViewBuilder var content: Content

    var body: some View {
        let radius = m.r(0.45)
        content
            // #drumModal .dm .dmsec{padding:1.3rem .4rem .3rem}
            .padding(.top, m.r(1.3)).padding(.horizontal, m.r(0.4)).padding(.bottom, m.r(0.3))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)   // stretch in a row (align-items: stretch)
            .background {
                ZStack {
                    LinearGradient(colors: [th.chassis[3], th.chassis[4]], startPoint: .top, endPoint: .bottom)
                    zone.tint
                    // inset 0 2px 4px rgba(0,0,0,.75), inset 0 -1px 0 rgba(255,255,255,.05)
                    RoundedRectangle(cornerRadius: radius).stroke(Color.black.opacity(0.75), lineWidth: 4).blur(radius: 2).offset(y: 2)
                    VStack(spacing: 0) { Spacer(minLength: 0); Color.white.opacity(0.05).frame(height: 1) }
                }
                .clipShape(RoundedRectangle(cornerRadius: radius))
                .overlay(alignment: .bottom) { Color.white.opacity(0.06).frame(height: 1).offset(y: 1).padding(.horizontal, radius) }   // 0 1px 0 rgba(255,255,255,.06)
            }
            .overlay(alignment: .topLeading) { header.padding(.leading, m.r(0.55)).padding(.top, m.r(0.3)) }
    }

    /// .dmsec>h5: .72rem 800, letter-spacing .18em, colour var(--print) at brightness 1.35, a 3px var(--led) bar left.
    private var header: some View {
        let fs = m.r(0.72), efs = m.r(0.62)
        return HStack(spacing: 0) {
            Text(title).font(PanelFont.ui(fs, 800)).letterSpacing(0.18, size: fs).foregroundStyle(zone == .fx ? Color(hex: "#8f949c") : th.print)
            if let extra { Text(extra).font(PanelFont.ui(efs, 700)).letterSpacing(0.12, size: efs).foregroundStyle(th.led).padding(.leading, m.r(0.5)) }
        }
        .lineLimit(1).fixedSize()
        .frame(height: fs, alignment: .leading)        // line-height:1
        .padding(.leading, 3 + m.r(0.45))              // border-left:3px + padding-left:.45rem
        .overlay(alignment: .leading) { th.led.frame(width: 3) }
        .brightness(0.12)   // filter: brightness(1.35) on light-grey text
    }
}

// MARK: - .oled

struct OledView: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    var lines: [Text]
    var minWidth: CGFloat = 0     // rem
    var padV: CGFloat = 0.3       // rem
    var padH: CGFloat = 0.5       // rem
    var center = false
    var width: CGFloat? = nil     // rem: a fixed box (content overflows, centred), e.g. .dmlen's shrunken display
    var body: some View {
        let fs = m.r(0.74)
        VStack(alignment: center ? .center : .leading, spacing: 0) {
            ForEach(lines.indices, id: \.self) { lines[$0].lineLimit(1).frame(height: fs * 1.35) }   // line-height:1.35
        }
            .font(PanelFont.mono(fs, 600)).foregroundStyle(th.cyan)
            .fixedSize()
            .padding(.vertical, m.r(padV)).padding(.horizontal, m.r(padH))
            .frame(width: width.map { m.r($0) })
            .frame(minWidth: m.r(minWidth), maxWidth: width == nil ? .infinity : m.r(width!), alignment: center ? .top : .topLeading)
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
