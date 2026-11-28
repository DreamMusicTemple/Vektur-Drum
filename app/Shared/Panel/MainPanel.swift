// Vektur Drum — the main panel, copied from web/src/panel.js renderDrums(): the sheet, the top strip, row 1 (TRANSPORT,
// DISPLAY, PATTERN, MASTER) and the SEQUENCER. Reference: design/ui-reference/ipad11-landscape/01-main.webp and
// styles/01-main.json. Sections not yet ported are listed in docs/HANDOVER-native.md §9 and get added in the same way.
import SwiftUI
import VekturDrumCore

struct PanelRoot: View {
    let controller: DrumController
    var body: some View {
        GeometryReader { geo in
            let m = PanelMetrics(width: geo.size.width), th = PanelTheme(controller.theme)
            ScrollView(.vertical) {
                DrumPanel(c: controller)
                    .frame(width: m.sheetWidth)
                    .padding(.top, 7)
                    .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .background(th.chassis[5].ignoresSafeArea())   // html,body{background: page}
            .environment(\.panel, m).environment(\.theme, th)
        }
    }
}

/// .dm — the drum machine's chassis.
struct DrumPanel: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    var body: some View {
        let radius = m.r(0.7)
        VStack(alignment: .leading, spacing: 0) {
            TopStrip(c: c)
                .padding(.top, -m.r(0.55)).padding(.horizontal, -m.r(0.65)).padding(.bottom, m.r(0.5))   // margin:-.55rem -.65rem .5rem
            FlowRow(gap: m.r(0.35), rowGap: m.r(0.35), alignment: .top) {   // .dmrow.dmr1
                TransportSection(c: c)
                DisplaySection(c: c).flexGrow()
                PatternSection(c: c)
                MasterSection(c: c)
            }
            .padding(.bottom, m.r(0.35))
            SequencerSection(c: c)
        }
        .padding(.top, m.r(0.55)).padding(.horizontal, m.r(0.65)).padding(.bottom, m.r(0.7))
        .background {
            ZStack {
                LinearGradient(stops: [.init(color: th.chassis[0], location: 0), .init(color: th.chassis[1], location: min(1, m.r(0.5) / 1100)),
                                       .init(color: th.chassis[2], location: 1)], startPoint: .top, endPoint: .bottom)
                VStack(spacing: 0) { Color.white.opacity(0.14).frame(height: 1); Spacer(minLength: 0); Color.black.opacity(0.6).frame(height: 2) }
            }
            .clipShape(RoundedRectangle(cornerRadius: radius))
        }
        .overlay(RoundedRectangle(cornerRadius: radius).stroke(Color.black, lineWidth: 1))
    }
}

// MARK: - top strip (.dmtop)

struct TopStrip: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    var body: some View {
        let lettering = th.strip[3], bfs = m.r(0.82), sfs = m.r(0.55)
        FlowRow(gap: m.r(0.6), rowGap: m.r(0.3)) {
            Image(uiImage: UIImage(named: "DMTLogo") ?? UIImage()).resizable().scaledToFit().frame(width: m.r(1.9), height: m.r(1.9)).clipShape(Circle())
                .shadow(color: .black.opacity(0.45), radius: 3).padding(.trailing, m.r(0.45))
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("VEKTUR DRUM").font(PanelFont.ui(bfs, 800)).letterSpacing(0.32, size: bfs)
                if m.width > 1050 {   // @media (max-width:1050px){ .dmbrand small{display:none} }
                    Text("HYBRID DRUM MACHINE").font(PanelFont.ui(sfs, 600)).letterSpacing(0.18, size: sfs).padding(.leading, m.r(0.5))
                }
            }
            .foregroundStyle(lettering).shadow(color: .white.opacity(0.35), radius: 0, x: 0, y: 1).fixedSize()
            HStack(spacing: m.r(0.2)) {   // .dmtc
                Text("TRACKS").font(PanelFont.ui(sfs, 700)).letterSpacing(0.18, size: sfs).foregroundStyle(lettering).padding(.trailing, m.r(0.2))
                ForEach(6...TrackLimits.playable.upperBound, id: \.self) { n in
                    Button("\(n)") { c.setTrackCount(n) }.buttonStyle(HBStyle(led: .amber, on: n == c.trackCount))
                        .accessibilityLabel("\(n) tracks")
                }
            }
            .padding(.trailing, m.r(0.4))
            Color.clear.frame(width: 0, height: 1).flexGrow()   // .sp
            Group {
                Button { } label: { Text("↶").font(.system(size: m.r(0.95), weight: .bold)) }.buttonStyle(HBStyle(minWidth: 1.9, fontSize: 0.95, paddingX: 0.35)).disabled(true).accessibilityLabel("Undo")
                Button { } label: { Text("↷").font(.system(size: m.r(0.95), weight: .bold)) }.buttonStyle(HBStyle(minWidth: 1.9, fontSize: 0.95, paddingX: 0.35)).disabled(true).accessibilityLabel("Redo")
                Button(c.on ? "ON" : "OFF") { c.setOn(!c.on) }.buttonStyle(HBStyle(led: .amber, on: c.on))
                Button("PRESETS") {}.buttonStyle(HBStyle())
                Button("SLICER") {}.buttonStyle(HBStyle(led: .amber, on: c.value("sl.on") > 0.5))
                Button("MOD") {}.buttonStyle(HBStyle(led: .amber, on: !c.project.wires.isEmpty))
                Button("BREAK LAB") {}.buttonStyle(HBStyle(led: .cyan))
                Button("GENERATE") {}.buttonStyle(HBStyle())
                Button("EXPORT") {}.buttonStyle(HBStyle())
                Button("SETTINGS") {}.buttonStyle(HBStyle())
            }
        }
        .padding(.vertical, m.r(0.35)).padding(.horizontal, m.r(0.65))
        .background { StripBackground(radius: m.r(0.7)) }
    }
}

/// The top strip's brushed metal: 1 px light lines every 3 px over the strip gradient, a highlight on top, black below.
struct StripBackground: View {
    @Environment(\.theme) private var th
    var radius: CGFloat
    var body: some View {
        ZStack {
            LinearGradient(stops: [.init(color: th.strip[0], location: 0), .init(color: th.strip[1], location: 0.55), .init(color: th.strip[2], location: 1)],
                           startPoint: .top, endPoint: .bottom)
            Canvas { ctx, size in
                var x: CGFloat = 0
                while x < size.width { ctx.fill(Path(CGRect(x: x, y: 0, width: 1, height: size.height)), with: .color(.white.opacity(0.035))); x += 3 }
            }
            VStack(spacing: 0) { Color.white.opacity(0.4).frame(height: 1); Spacer(minLength: 0) }
        }
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: radius, topTrailingRadius: radius))
        .overlay(alignment: .bottom) { Color.black.frame(height: 1).offset(y: 1) }
    }
}

// MARK: - row 1

struct TransportSection: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        PanelSection(title: "TRANSPORT", zone: .ctl) {
            HStack(spacing: m.r(0.3)) {
                Button("PLAY") { c.play() }.buttonStyle(HBStyle(size: .normal, minWidth: 3.6, led: .amber, on: c.transport != .stopped))
                Button("STOP") { c.stop() }.buttonStyle(HBStyle(size: .normal, minWidth: 3.6))
                Button("REC") { c.toggleRec() }.buttonStyle(HBStyle(size: .normal, minWidth: 3.6, led: .red, on: c.armedRec))
            }
        }
    }
}

struct DisplaySection: View {
    @Environment(\.theme) private var th
    let c: DrumController
    var body: some View {
        PanelSection(title: "DISPLAY") { OledView(lines: lines) }
    }
    /// web paintOled()
    private var lines: [Text] {
        let p = c.project, playing = c.transport == .running, waiting = c.transport == .waiting
        let cur = c.transport == .stopped ? p.selectedPattern : c.playingPattern
        let st = playing ? max(0, c.currentStep[safe: c.selectedTrack] ?? -1) + 1 : 0
        let len = p.patterns[p.selectedPattern].tracks[c.selectedTrack].length
        let chain = p.chainEnabled && !p.chain.isEmpty ? "CHAIN \(c.chainPosition + 1)/\(p.chain.count)" : "LOOP"
        let l1 = Text("\(playing ? "▶" : waiting ? "…" : "■") PAT ") + Text(String(format: "%02d", cur + 1)).foregroundColor(th.ice).bold() + Text("  \(chain)")
        let bpm = String(format: "%.1f", p.tempo)
        let l2 = Text(bpm).foregroundColor(th.led) + Text(" BPM   STEP \(String(format: "%02d", st))/\(String(format: "%02d", len))")
        let name = c.trackName(c.selectedTrack).padding(toLength: max(6, c.trackName(c.selectedTrack).count), withPad: " ", startingAt: 0)
        let l3 = Text("T\(c.selectedTrack + 1) \(name) ") + (c.armedRec ? Text("● REC").foregroundColor(th.led) : Text("")) + Text(c.on ? "" : "  OFF")
        return [l1, l2, l3]
    }
}

struct PatternSection: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    var body: some View {
        let p = c.project, sel = p.selectedPattern, pat = p.patterns[sel]
        PanelSection(title: "PATTERN", extra: p.chainEnabled ? "CHAIN" : "LOOP", zone: .ctl) {
            VStack(alignment: .leading, spacing: m.r(0.35)) {
                HStack(spacing: m.r(0.3)) {   // .dmpats
                    ForEach(0..<TrackLimits.patterns, id: \.self) { i in
                        Button("\(i + 1)") { c.selectPattern(i) }
                            .buttonStyle(HBStyle(size: .normal, minWidth: 0, fontSize: 0.8, letterSpacing: 0, paddingX: 0, led: .amber,
                                                 on: c.transport != .stopped && c.playingPattern == i, selected: i == sel, fill: true))
                            .overlay(alignment: .topLeading) {   // .has::after — a pattern with steps
                                if !p.patterns[i].isEmpty { Circle().fill(Color(hex: "#6b6f76")).frame(width: m.r(0.22), height: m.r(0.22)).padding(.leading, m.r(0.3)).padding(.top, m.r(0.3)) }
                            }
                            .frame(maxWidth: .infinity)
                    }
                }
                ChainRow {   // .dmchain.dmpatedit
                    RowLabel("PATTERN \(sel + 1)")
                    Button("COPY") {}.buttonStyle(HBStyle())
                    Button("PASTE") {}.buttonStyle(HBStyle())
                    Button("CLEAR") {}.buttonStyle(HBStyle())
                    let v = pat.slicer
                    Button(v == nil ? "SLICER: SONG" : v! ? "SLICER: ON" : "SLICER: OFF") {}.buttonStyle(HBStyle(led: .cyan, on: v != nil))
                }
                ChainRow {   // .dmchain.dmbarsrow
                    RowLabel("BARS")
                    ForEach([Pattern.Bars.one, .two, .four], id: \.rawValue) { b in
                        Button("\(b.rawValue)") {}.buttonStyle(HBStyle(led: .amber, on: pat.bars == b))
                    }
                    Color(hex: "#3a3d43").frame(width: 1).frame(maxHeight: .infinity).padding(.horizontal, m.r(0.2))   // .dmsep
                    Button("CHAIN") {}.buttonStyle(HBStyle(led: .cyan, on: p.chainEnabled))
                    ChainStrip(chain: p.chain)
                    Button("+ \(sel + 1)") {}.buttonStyle(HBStyle())
                }
            }
            .fixedSize(horizontal: true, vertical: false)
        }
    }
}

/// .dmchain: a row of small controls, gap .25rem.
struct ChainRow<Content: View>: View {
    @Environment(\.panel) private var m
    @ViewBuilder var content: Content
    var body: some View { HStack(spacing: m.r(0.25)) { content } }
}
/// .dmrowlbl: 700 .6rem system-ui, letter-spacing .16em, var(--print), margin-right .15rem.
struct RowLabel: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    var text: String
    init(_ t: String) { text = t }
    var body: some View {
        let fs = m.r(0.6)
        Text(text).font(.system(size: fs, weight: .bold)).letterSpacing(0.16, size: fs).foregroundStyle(th.print).padding(.trailing, m.r(0.15)).fixedSize()
    }
}
/// .dmchstrip with its empty hint (chips come with the CHAIN port).
struct ChainStrip: View {
    @Environment(\.panel) private var m
    var chain: [Int]
    var body: some View {
        let fs = m.r(0.62)
        HStack(spacing: m.r(0.22)) {
            if chain.isEmpty {
                Text("empty — tap + or drag a pattern here").font(.system(size: fs, weight: .medium)).foregroundStyle(Color(hex: "#6f747c"))
                    .padding(.vertical, m.r(0.1)).padding(.horizontal, m.r(0.3)).lineLimit(1)
            } else {
                ForEach(chain.indices, id: \.self) { i in Text("\(chain[i] + 1)").font(PanelFont.mono(m.r(0.78), 800)) }
            }
        }
        .padding(.vertical, m.r(0.18)).padding(.horizontal, m.r(0.3))
        .frame(minWidth: m.r(7), minHeight: m.r(1.75), alignment: .leading)
        .background(RoundedRectangle(cornerRadius: m.r(0.35)).fill(Color(hex: "#07080a"))
            .overlay(RoundedRectangle(cornerRadius: m.r(0.35)).stroke(Color.black.opacity(0.9), lineWidth: 3).blur(radius: 1.5).offset(y: 1)
                .clipShape(RoundedRectangle(cornerRadius: m.r(0.35)))))
    }
}

struct MasterSection: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        PanelSection(title: "MASTER", zone: .ctl) {
            HStack(alignment: .top, spacing: m.r(0.05)) {   // #drumModal .dm .dmknobs{gap:.1rem .05rem}
                let bpm = c.project.tempo
                KnobCell(label: "Tempo", value: (bpm - 40) / 200, centre: nil, defaultValue: 0.4, text: String(format: "%.1f", bpm)) { t in c.setTempo(40 + t * 200) }
                ParamKnob(c: c, key: "dr.swing", label: "Swing")
                ParamKnob(c: c, key: "dr.temper", label: "Temper", format: ParamFormat.temper)
                ParamKnob(c: c, key: "dr.human", label: "Humanise", format: ParamFormat.humanise)
                ParamKnob(c: c, key: "dr.level", label: "Level")
            }
        }
    }
}

// MARK: - sequencer

struct SequencerSection: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    @State private var editMode = false
    var body: some View {
        let sel = c.project.selectedPattern
        PanelSection(title: "SEQUENCER", extra: "PATTERN \(sel + 1)", zone: .seq) {
            VStack(alignment: .leading, spacing: 0) {
                SeqGrid(rem: m.rem) {
                    let fs = m.r(0.5)
                    Group {
                        Text("TRACK"); Text("M"); Text("S")
                        HStack(spacing: 0) { ForEach(["1", "5", "9", "13"], id: \.self) { Text($0).frame(maxWidth: .infinity, alignment: .leading) } }
                        Text("LENGTH"); Text("DIV")
                    }
                    .font(PanelFont.ui(fs, 700)).letterSpacing(0.18, size: fs).foregroundStyle(Color(hex: "#9a9ea6")).lineLimit(1)
                }
                .padding(.top, m.r(0.1))
                VStack(spacing: m.r(0.22)) { ForEach(0..<c.trackCount, id: \.self) { t in TrackRow(c: c, t: t) } }
                    .padding(.vertical, m.r(0.22))   // .dmtrk{margin:.22rem 0}: block margins collapse between rows
            }
        }
        .overlay(alignment: .topTrailing) {
            Button("EDIT") { editMode.toggle() }.buttonStyle(HBStyle(height: 1.5, led: .cyan, on: editMode))
                .padding(.trailing, m.r(0.5)).padding(.top, m.r(0.2))
        }
    }
}

/// .dmhdr / .dmtrk: grid-template-columns 5.2rem 1.9rem 1.9rem minmax(0,1fr) 5.4rem 4.2rem, gap .35rem.
struct SeqGrid: Layout {
    var rem: CGFloat
    private func r(_ v: CGFloat) -> CGFloat { v * rem }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w = proposal.width ?? r(44)
        let cols = columns(w)
        let h = zip(subviews, cols).map { $0.sizeThatFits(ProposedViewSize(width: $1, height: nil)).height }.max() ?? 0
        return CGSize(width: w, height: h)
    }
    func placeSubviews(in b: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = b.minX
        for (v, w) in zip(subviews, columns(b.width)) {
            let s = v.sizeThatFits(ProposedViewSize(width: w, height: nil))
            v.place(at: CGPoint(x: x, y: b.midY - s.height / 2), anchor: .topLeading, proposal: ProposedViewSize(width: w, height: s.height))
            x += w + r(0.35)
        }
    }
    private func columns(_ total: CGFloat) -> [CGFloat] {
        let fixed = [5.2, 1.9, 1.9, 5.4, 4.2].map { r($0) }, gaps = r(0.35) * 5
        let flex = max(0, total - fixed.reduce(0, +) - gaps)
        return [fixed[0], fixed[1], fixed[2], flex, fixed[3], fixed[4]]
    }
}

struct TrackRow: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    let t: Int
    var body: some View {
        let n = t + 1, p = c.project.selectedPattern, tp = c.project.patterns[p].tracks[t]
        let muted = c.value("t\(n).mute") > 0.5, solo = c.value("t\(n).solo") > 0.5
        SeqGrid(rem: m.rem) {
            Button { c.selectedTrack = t } label: {   // .hb.dmname
                VStack(alignment: .leading, spacing: m.r(0.08)) {
                    Text(c.trackName(t))
                    Text("TRACK \(n)").font(PanelFont.ui(m.r(0.5), 700)).letterSpacing(0.1, size: m.r(0.5)).foregroundStyle(th.print)
                }
            }
            .buttonStyle(HBStyle(size: .normal, minWidth: 5.2, paddingX: 0.45, led: .amber, on: false, selected: t == c.selectedTrack, alignment: .leading))
            Button("M") { c.set("t\(n).mute", muted ? 0 : 1) }.buttonStyle(HBStyle(led: .amber, on: muted))
            Button("S") { c.set("t\(n).solo", solo ? 0 : 1) }.buttonStyle(HBStyle(led: .cyan, on: solo))
            StepKeys(c: c, t: t, steps: tp.steps, length: tp.length, muted: muted)
            HStack(spacing: m.r(0.15)) {   // .dmlen
                Button("−") {}.buttonStyle(HBStyle())
                OledView(lines: [Text(String(format: "%02d", tp.length))], padV: 0.15, padH: 0.3, center: true).frame(width: m.r(1.9))
                Button("+") {}.buttonStyle(HBStyle())
            }
            Text(tp.division.label)   // .oled select
                .font(PanelFont.mono(m.r(0.68), 600)).foregroundStyle(th.cyan).lineLimit(1)
                .padding(.horizontal, m.r(0.3)).frame(maxWidth: .infinity, minHeight: m.r(1.6), alignment: .leading)
                .background(RoundedRectangle(cornerRadius: m.r(0.2)).fill(Color(hex: "#030506")))
                .overlay(RoundedRectangle(cornerRadius: m.r(0.2)).stroke(Color(hex: "#1d2a30"), lineWidth: 1))
        }
    }
}

/// .dmsteps: 16 keys, gap .18rem, an extra .12rem before each group of four.
struct StepKeys: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let t: Int
    let steps: [Step?]
    let length: Int
    let muted: Bool
    var body: some View {
        HStack(spacing: m.r(0.18)) {
            ForEach(0..<TrackLimits.steps, id: \.self) { s in
                StepKey(step: steps[s], playhead: c.transport == .running && c.currentStep[safe: t] == s, outside: s >= length,
                        selected: t == c.selectedTrack && s == c.selectedStep, muted: muted) { c.toggleStep(track: t, step: s) }
                    .padding(.leading, s % 4 == 0 ? m.r(0.12) : 0)
            }
        }
    }
}

/// .st — a step key (classic design): a raised key with an LED bar.
struct StepKey: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let step: Step?
    let playhead: Bool
    let outside: Bool
    let selected: Bool
    let muted: Bool
    let tap: () -> Void
    var body: some View {
        let r = m.r(0.25), on = step != nil, acc = (step?.velocity ?? 0) >= 0.9
        Button(action: tap) { Color.clear.frame(maxWidth: .infinity).frame(height: m.r(2.4) - 2) }
            .buttonStyle(StepKeyStyle(radius: r, playhead: playhead))
            .overlay(alignment: .top) {   // ::before — the LED bar
                GeometryReader { g in
                    let bar = RoundedRectangle(cornerRadius: m.r(0.16))
                    Group {
                        if playhead { bar.fill(Color(hex: "#fff3df")).shadow(color: Color(255, 240, 210, 0.8), radius: 3) }
                        else if acc { bar.fill(th.ledHex == "#ffb23d" ? Color(hex: "#ff7a2e") : Color(hex: mixHex(th.ledHex, "#ffffff", 0.35)))
                                         .shadow(color: th.ledHex == "#ffb23d" ? Color(255, 110, 40, 0.8) : th.led, radius: 3.5) }
                        else if on { bar.fill(th.led).shadow(color: th.ledHex == "#ffb23d" ? Color(255, 178, 61, 0.7) : th.led.opacity(0.7), radius: 2.5) }
                        else { bar.fill(Color(hex: "#1b1611")).overlay(bar.stroke(Color.black.opacity(0.7), lineWidth: 1).blur(radius: 0.5).offset(y: 1).clipShape(bar)) }
                    }
                    .saturation(muted && on ? 0.2 : 1).brightness(muted && on ? -0.25 : 0)
                    .frame(width: g.size.width * 0.56, height: m.r(0.32))
                    .position(x: g.size.width / 2, y: m.r(0.3) + m.r(0.16))
                }
                .allowsHitTesting(false)
            }
            .overlay(alignment: .bottom) {   // em — ×ratchet, ±pitch, chance %, FM ratio
                if let mk = mark { Text(mk).font(PanelFont.mono(m.r(0.5), 600)).foregroundStyle(Color(hex: "#8b8f96")).lineLimit(1).padding(.bottom, m.r(0.22)).allowsHitTesting(false) }
            }
            .overlay(alignment: .topTrailing) {   // .sfx — the step has effects
                if hasFx { Circle().fill(th.cyan).frame(width: m.r(0.22), height: m.r(0.22)).padding(.trailing, m.r(0.22)).padding(.top, m.r(0.62)).allowsHitTesting(false) }
            }
            .overlay(alignment: .topLeading) {   // .srg — ring modulation on this step
                if step?.ringOn == true { Circle().stroke(Color(hex: "#ffb43c"), lineWidth: 1.5).frame(width: m.r(0.36), height: m.r(0.36)).padding(.leading, m.r(0.2)).padding(.top, m.r(0.55)).allowsHitTesting(false) }
            }
            .overlay { if selected { RoundedRectangle(cornerRadius: r).stroke(th.cyan, lineWidth: 2) } }
            .opacity(outside ? 0.25 : 1).allowsHitTesting(!outside)
    }
}

extension StepKey {
    /// web paintStep(): the key's small print.
    var mark: String? {
        guard let v = step else { return nil }
        var m = ""
        if v.ratchet > 1 { m += "×\(v.ratchet)" }
        if v.pitch != 0 { m += (v.pitch > 0 ? "+" : "") + "\(v.pitch)" }
        if v.chance < 1 { m += "\(Int((Double(v.chance) * 100).rounded()))%" }
        if v.fmRatio > 0 { m += "r" + shortNumber(Double(v.fmRatio)) }
        return m.isEmpty ? nil : m
    }
    var hasFx: Bool {
        guard let v = step else { return false }
        return v.crush > 0 || v.delaySend > 0 || v.reverbSend > 0 || v.fmRatio > 0 || v.fold > 0 || v.shiftSemitones != 0 || v.spectral > 0
    }
}
/// JS +x.toFixed(2): at most two decimals, no trailing zeros.
func shortNumber(_ x: Double) -> String {
    var s = String(format: "%.2f", x)
    while s.hasSuffix("0") { s.removeLast() }
    if s.hasSuffix(".") { s.removeLast() }
    return s
}

struct StepKeyStyle: ButtonStyle {
    var radius: CGFloat
    var playhead: Bool
    func makeBody(configuration: Configuration) -> some View {
        let down = configuration.isPressed
        configuration.label
            .background {
                ZStack {
                    LinearGradient(colors: playhead ? [Color(hex: "#54575d"), Color(hex: "#3a3c41")] : [Color(hex: "#34363b"), Color(hex: "#232528")],
                                   startPoint: .top, endPoint: .bottom)
                    if down { RoundedRectangle(cornerRadius: radius).stroke(Color.black.opacity(0.8), lineWidth: 3).blur(radius: 1.5).offset(y: 1.5) }
                    else { VStack(spacing: 0) { Color.white.opacity(0.14).frame(height: 1); Spacer(minLength: 0) } }
                }
                .clipShape(RoundedRectangle(cornerRadius: radius - 1))
            }
            .padding(1)
            .background(RoundedRectangle(cornerRadius: radius).fill(Color(hex: "#050506")))
            .shadow(color: down ? .clear : .black.opacity(0.7), radius: 1.3, x: 0, y: 1.75)
            .offset(y: down ? 1 : 0)
    }
}
