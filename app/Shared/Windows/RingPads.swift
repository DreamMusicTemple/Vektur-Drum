// Vektur Drum — RING MOD for one step (web/src/mod-panel.js renderRing) and the PADS window (web/src/pads-window.js).
import SwiftUI
import VekturDrumCore

struct RingWindow: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let track: Int
    let step: Int
    var body: some View {
        let n = c.trackCount, p = c.project.selectedPattern, cur = c.project.patterns[p].tracks[track].steps[step], v = cur ?? Step()
        let osc = Int(v.ringMaster) >= DrumLists.ringOscillator
        ModalSheet(c: c, title: "RING MOD · T\(track + 1) STEP \(String(format: "%02d", step + 1))", width: 34, closeLabel: "Done") {
            VStack(alignment: .leading, spacing: 0) {
                Button(v.ringOn ? "RING ON" : "RING OFF") {
                    edit { s in
                        if s.ringOn { s.ringOn = false } else {
                            s.ringOn = true
                            if s.ringSlaves == 0 {
                                s.ringMaster = Int(s.ringMaster) >= DrumLists.ringOscillator ? UInt8(DrumLists.ringOscillator) : UInt8(track)
                                s.ringSlaves = UInt16((1 << n) - 1) & ~(Int(s.ringMaster) < DrumLists.ringOscillator ? UInt16(1) << s.ringMaster : 0)
                            }
                        }
                    }
                }.buttonStyle(HBStyle(size: .normal, minWidth: 3.6, led: .red, on: v.ringOn))
                SheetHeading(text: "Master — the modulator")
                FlowRow(gap: m.r(0.3), rowGap: m.r(0.3)) {
                    ForEach(0..<n, id: \.self) { i in
                        Button("T\(i + 1)") { edit { $0.ringMaster = UInt8(i); $0.ringSlaves &= ~(UInt16(1) << UInt16(i)) } }.buttonStyle(HBStyle(led: .cyan, on: Int(v.ringMaster) == i))
                    }
                    Button("OSC") { edit { $0.ringMaster = UInt8(DrumLists.ringOscillator) } }.buttonStyle(HBStyle(led: .cyan, on: osc))
                }
                SheetHeading(text: "Slaves — the tracks that get modulated")
                FlowRow(gap: m.r(0.3), rowGap: m.r(0.3)) {
                    ForEach(0..<n, id: \.self) { i in
                        Button("T\(i + 1)") { edit { $0.ringSlaves ^= UInt16(1) << UInt16(i) } }
                            .buttonStyle(HBStyle(led: .amber, on: (v.ringSlaves >> UInt16(i)) & 1 == 1)).disabled(Int(v.ringMaster) == i).opacity(Int(v.ringMaster) == i ? 0.5 : 1)
                    }
                    Button("ALL") { edit { $0.ringSlaves = UInt16((1 << n) - 1) & ~(Int($0.ringMaster) < DrumLists.ringOscillator ? UInt16(1) << $0.ringMaster : 0) } }.buttonStyle(HBStyle())
                    Button("NONE") { edit { $0.ringSlaves = 0 } }.buttonStyle(HBStyle())
                }
                HStack(alignment: .top, spacing: m.r(0.05)) {
                    ValueKnob(label: "Amount", value: Double(v.ringAmount), range: 0...1, defaultValue: 1, format: Fmt.pct) { x in edit { $0.ringAmount = Float(x) } }
                    if osc {
                        let toK = { (hz: Double) in log(hz / 20) / log(250) }, fromK = { (x: Double) in 20 * pow(250, x) }
                        ValueKnob(label: "Osc", value: toK(Double(v.ringHz)), range: 0...1, defaultValue: toK(220),
                                  format: { let hz = fromK($0); return hz >= 1000 ? String(format: "%.2f kHz", hz / 1000) : String(format: "%.0f Hz", hz) }) { x in
                            edit { $0.ringHz = Float((fromK(x) * 10).rounded() / 10) } }
                    }
                }
                .padding(.top, m.r(0.6))
                HStack(spacing: m.r(0.4)) {
                    Button("COPY TO TRACK") { copyToTrack() }.buttonStyle(HBStyle())
                }
                .padding(.top, m.r(0.2)).padding(.bottom, m.r(0.2))
                HelpText(text: "When this step plays, its slave tracks are multiplied by the master for the length of the step. A track master is level-normalised, so a quiet hat modulates as hard as a loud kick — the slaves take on its pitch and noise (clangy, bell-like, metallic). OSC uses a pure sine instead: low = tremolo, high = classic ring-mod. Amount fades between dry and fully ringed. Ringed steps show a ring mark.")
            }
        }
    }
    private func edit(_ f: (inout Step) -> Void) {
        let p = c.project.selectedPattern
        var s = c.project.patterns[p].tracks[track].steps[step] ?? Step()
        f(&s)
        c.edit { $0.patterns[p].tracks[track].steps[step] = s }
        c.engine.send(.setStep(pattern: p, track: track, step: step, s))
    }
    private func copyToTrack() {
        let p = c.project.selectedPattern, src = c.project.patterns[p].tracks[track].steps[step] ?? Step()
        var n = 0
        for j in 0..<TrackLimits.steps where j != step {
            guard var s = c.project.patterns[p].tracks[track].steps[j] else { continue }
            s.ringOn = src.ringOn; s.ringMaster = src.ringMaster; s.ringSlaves = src.ringSlaves; s.ringAmount = src.ringAmount; s.ringHz = src.ringHz
            c.edit { $0.patterns[p].tracks[track].steps[j] = s }
            c.engine.send(.setStep(pattern: p, track: track, step: j, s)); n += 1
        }
        c.toast("Ring settings copied to \(n) step\(n == 1 ? "" : "s") on track \(track + 1)")
    }
}

/// The PADS window: a title bar (PADS, the last velocity, ⛶, ✕) you drag to move, a corner grip to resize; the pads
/// fill it in the rows × columns that keep them closest to square. Position and size are remembered on this device.
struct PadsWindow: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    @AppStorage("vekturdrum.padwin.x") private var gx: Double = -1
    @AppStorage("vekturdrum.padwin.y") private var gy: Double = 80
    @AppStorage("vekturdrum.padwin.w") private var gw: Double = 420
    @AppStorage("vekturdrum.padwin.h") private var gh: Double = 420
    @AppStorage("vekturdrum.padwin.full") private var full = false
    @State private var drag0: CGPoint?
    var body: some View {
        GeometryReader { g in
            let vw = g.size.width, vh = g.size.height
            let w = full ? vw : min(max(gw, 220), vw), h = full ? vh : min(max(gh, 200), vh)
            let x = full ? 0 : min(max(gx < 0 ? max(8, (vw - w) / 2) : gx, -w + 80), vw - 80), y = full ? 0 : min(max(gy, 0), vh - 40)
            VStack(spacing: 0) {
                HStack(spacing: m.r(0.3)) {   // .padwbar
                    Text("PADS").font(PanelFont.ui(m.r(0.62), 700)).tracking(0.18 * m.r(0.62)).foregroundStyle(Color(hex: "#d8d4c8"))
                    Text(c.lastPadVelocity.map { "VEL \($0)" } ?? "").font(.system(size: m.r(0.58), weight: .semibold)).tracking(0.12 * m.r(0.58)).foregroundStyle(th.led)
                    Spacer()
                    Button("⛶") { full.toggle() }.buttonStyle(ModBtn())
                    Button("✕") { c.window = nil }.buttonStyle(ModBtn())
                }
                .padding(.vertical, m.r(0.3)).padding(.leading, m.r(0.6)).padding(.trailing, m.r(0.35))
                .background(LinearGradient(colors: [Color(hex: "#3a3d43"), Color(hex: "#2a2c31")], startPoint: .top, endPoint: .bottom))
                .gesture(DragGesture().onChanged { v in
                    guard !full else { return }
                    if drag0 == nil { drag0 = CGPoint(x: x, y: y) }
                    gx = drag0!.x + v.translation.width; gy = drag0!.y + v.translation.height
                }.onEnded { _ in drag0 = nil })
                PadWindowGrid(c: c).padding(.horizontal, m.r(0.4)).padding(.top, m.r(0.4)).padding(.bottom, m.r(1.4))
            }
            .frame(width: w, height: h)
            .background(LinearGradient(colors: [Color(hex: "#1d1f23"), Color(hex: "#141518")], startPoint: .top, endPoint: .bottom))
            .clipShape(RoundedRectangle(cornerRadius: full ? 0 : m.r(0.55)))
            .overlay(RoundedRectangle(cornerRadius: full ? 0 : m.r(0.55)).stroke(Color(hex: "#3a3d44"), lineWidth: 1))
            .overlay(alignment: .bottomTrailing) {
                if !full {
                    Canvas { ctx, s in
                        for (a, b) in [(0.5, 0.58), (0.7, 0.78)] {
                            var p = Path(); p.move(to: CGPoint(x: s.width * a, y: s.height)); p.addLine(to: CGPoint(x: s.width, y: s.height * a))
                            ctx.stroke(p, with: .color(Color(hex: "#6a6f78")), lineWidth: s.width * (b - a) * 0.7)
                        }
                    }
                    .frame(width: m.r(1.3), height: m.r(1.3)).contentShape(Rectangle())
                    .gesture(DragGesture().onChanged { v in
                        if drag0 == nil { drag0 = CGPoint(x: w, y: h) }
                        gw = drag0!.x + v.translation.width; gh = drag0!.y + v.translation.height
                    }.onEnded { _ in drag0 = nil })
                }
            }
            .shadow(color: .black.opacity(0.67), radius: 20, y: 12)
            .offset(x: x, y: y)
        }
    }
}

/// .padwgrid: the pads in the rows × columns closest to square, their print scaled with them (--pz).
struct PadWindowGrid: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        GeometryReader { g in
            let n = max(1, c.trackCount), W = g.size.width, H = g.size.height
            let best: (Int, Int, CGFloat) = (1...n).map { cols -> (Int, Int, CGFloat) in let rows = (n + cols - 1) / cols; return (cols, rows, min(W / CGFloat(cols), H / CGFloat(rows))) }.max { $0.2 < $1.2 } ?? (3, 3, 100)
            let pz = min(3.2, max(0.8, best.2 / 90)), gap = m.r(0.35) * pz
            let pw = (W - gap * CGFloat(best.0 - 1)) / CGFloat(best.0), ph = (H - gap * CGFloat(best.1 - 1)) / CGFloat(best.1)
            VStack(spacing: gap) {
                ForEach(0..<best.1, id: \.self) { r in
                    HStack(spacing: gap) {
                        ForEach(0..<best.0, id: \.self) { col in
                            let t = r * best.0 + col
                            if t < n { PadView(c: c, t: t, nameMax: 10, fontScale: pz).frame(width: pw, height: ph) } else { Color.clear.frame(width: pw, height: ph) }
                        }
                    }
                }
            }
        }
    }
}

/// .modbtn — the small window-bar buttons.
struct ModBtn: ButtonStyle {
    @Environment(\.panel) private var m
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: m.r(0.66))).foregroundStyle(Color(hex: "#d8d4c8"))
            .padding(.horizontal, m.r(0.3)).frame(minWidth: m.r(1.7), minHeight: m.r(1.55))
            .background(RoundedRectangle(cornerRadius: m.r(0.3)).fill(Color(hex: "#1b1d21")))
            .overlay(RoundedRectangle(cornerRadius: m.r(0.3)).stroke(Color(hex: "#444850"), lineWidth: 1))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
