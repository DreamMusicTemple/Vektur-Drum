// Vektur Drum — the panel's lower area, copied from web/src/panel.js renderDrums() (the .dmr3 grid: PERFORMANCE ·
// SOUND · STEP · EFFECTS + EQ + TAPE), renderDrumSound / renderDrumVintage / renderDrumEq / renderDrumStep, and
// web/src/glitch-panel.js renderGlitch (the LFO row). Sizes from the compact CSS (#drumModal .dm …).
import SwiftUI
import VekturDrumCore

// MARK: - the .dmr3 grid

/// #drumModal .dm .dmr3: grid-template-columns auto minmax(0,1.5fr) minmax(15rem,1fr) minmax(13.5rem,.85fr), gap .35rem;
/// ≤1050px: auto minmax(0,1fr) minmax(14rem,1fr) with the effects column on a row of its own (its sections side by side);
/// ≤760px: one column.
struct BottomRow: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        let mode = m.width > 1050 ? 0 : m.width > 760 ? 1 : 2
        BottomGrid(rem: m.rem, mode: mode) {
            PerformanceSection(c: c)
            SoundSection(c: c)
            StepSection(c: c)
            FxColumn(c: c, horizontal: mode == 1)
        }
    }
}

struct BottomGrid: Layout {
    var rem: CGFloat
    var mode: Int
    private var gap: CGFloat { 0.35 * rem }
    private func frames(_ W: CGFloat, _ sub: Subviews) -> [CGRect] {
        guard sub.count == 4 else { return [] }
        func h(_ i: Int, _ w: CGFloat) -> CGFloat { sub[i].sizeThatFits(ProposedViewSize(width: w, height: nil)).height }
        if mode == 2 {
            var y: CGFloat = 0; var out: [CGRect] = []
            for i in 0..<4 { let hh = h(i, W); out.append(CGRect(x: 0, y: y, width: W, height: hh)); y += hh + gap }
            return out
        }
        let auto = sub[0].sizeThatFits(.unspecified).width
        let fr: [CGFloat] = mode == 0 ? [1.5, 1, 0.85] : [1, 1], mins: [CGFloat] = mode == 0 ? [0, 15 * rem, 13.5 * rem] : [0, 14 * rem]
        var widths = [CGFloat](repeating: 0, count: fr.count), fixed = [Bool](repeating: false, count: fr.count)
        var left = max(0, W - auto - gap * CGFloat(fr.count))
        while true {   // CSS fr with minimums: a track below its minimum is frozen there, the rest share what is left
            let tot = zip(fr, fixed).filter { !$0.1 }.map(\.0).reduce(0, +); guard tot > 0 else { break }
            let unit = left / tot; var changed = false
            for i in fr.indices where !fixed[i] && fr[i] * unit < mins[i] { fixed[i] = true; widths[i] = mins[i]; left -= mins[i]; changed = true }
            if !changed { for i in fr.indices where !fixed[i] { widths[i] = fr[i] * unit }; break }
        }
        let cols = [auto] + widths
        var out: [CGRect] = [], x: CGFloat = 0
        let n = mode == 0 ? 4 : 3
        let rowH = (0..<n).map { h($0, cols[$0]) }.max() ?? 0
        for i in 0..<n { out.append(CGRect(x: x, y: 0, width: cols[i], height: rowH)); x += cols[i] + gap }
        if mode == 1 { out.append(CGRect(x: 0, y: rowH + gap, width: W, height: h(3, W))) }
        return out
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let W = proposal.width ?? 1000, f = frames(W, subviews)
        return CGSize(width: W, height: f.map(\.maxY).max() ?? 0)
    }
    func placeSubviews(in b: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (v, r) in zip(subviews, frames(b.width, subviews)) {
            v.place(at: CGPoint(x: b.minX + r.minX, y: b.minY + r.minY), anchor: .topLeading, proposal: ProposedViewSize(width: r.width, height: r.height))
        }
    }
}

// MARK: - PERFORMANCE

struct PerformanceSection: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        let n = c.trackCount, cols = n > 9 ? 4 : 3, narrow = m.width <= 760
        let ch = Int(c.value("dr.ch").rounded())
        let notes = ParameterSpec.trackNotes.prefix(n).map(String.init).joined(separator: ", ")
        PanelSection(title: "PERFORMANCE", zone: .play) {
            VStack(alignment: .leading, spacing: 0) {
                PadGrid(c: c, count: n, columns: cols, padWidth: narrow ? nil : (cols == 4 ? 3.6 : 3.7), narrow: narrow).padding(.top, m.r(0.3))
                PanelNote(text: "Higher on a pad plays harder. With REC lit and the pattern playing, hits are written to the nearest step. MIDI notes on channel \(ch == 0 ? "any" : String(ch)) (\(notes)) play the pads too.")
                    .padding(.top, m.r(0.35))
            }
        }
        .overlay(alignment: .topTrailing) {   // .dmpadx ⤢
            Button { c.window = .pads } label: { Text("⤢").font(.system(size: m.r(0.7), weight: .bold)) }
                .buttonStyle(HBStyle(minWidth: 1.4, height: 1.2, fontSize: 0.7, paddingX: 0.25))
                .padding(.trailing, m.r(0.3)).padding(.top, m.r(0.15))
                .accessibilityLabel("Expand the pads")
        }
    }
}

struct PadGrid: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let count: Int
    let columns: Int
    let padWidth: CGFloat?      // rem; nil = 1fr
    var narrow = false
    var gap: CGFloat = 0.3
    var body: some View {
        let rows = (count + columns - 1) / columns
        VStack(alignment: .leading, spacing: m.r(gap)) {
            ForEach(0..<rows, id: \.self) { r in
                HStack(spacing: m.r(gap)) {
                    ForEach(0..<columns, id: \.self) { col in
                        let t = r * columns + col
                        if t < count {
                            PadView(c: c, t: t, nameMax: count > 9 ? 6 : 8)
                                .frame(width: padWidth.map { m.r($0) }).frame(maxWidth: padWidth == nil ? .infinity : nil)
                                .aspectRatio(narrow ? 2.2 : 1, contentMode: .fit)
                        } else if padWidth == nil { Color.clear.frame(maxWidth: .infinity).frame(height: 1) }
                    }
                }
            }
        }
    }
}

/// .pad — a rubber pad: number top left, LED bar, the track name at the bottom. Higher on the pad plays harder.
struct PadView: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    let t: Int
    var nameMax = 8
    var fontScale: CGFloat = 1
    @State private var down = false
    var body: some View {
        let lit = c.padLit[safe: t] ?? false, sel = t == c.selectedTrack, smp = c.engineKind(t) == 1
        let r = m.r(0.55), fs = m.r(0.62) * fontScale
        GeometryReader { g in
            ZStack {
                RoundedRectangle(cornerRadius: r).fill(RadialGradient(stops: lit
                    ? [.init(color: Color(hex: "#46484b"), location: 0), .init(color: Color(hex: "#2c2e30"), location: 0.45), .init(color: Color(hex: "#202123"), location: 1)]
                    : [.init(color: Color(hex: "#3b3d40"), location: 0), .init(color: Color(hex: "#26282a"), location: 0.45), .init(color: Color(hex: "#1d1e20"), location: 1)],
                    center: UnitPoint(x: 0.5, y: 0), startRadius: 0, endRadius: max(g.size.width * 1.2, g.size.height * 0.9)))
                if down { RoundedRectangle(cornerRadius: r).stroke(Color.black.opacity(0.7), lineWidth: m.r(0.45)).blur(radius: m.r(0.2)).offset(y: m.r(0.2)).clipShape(RoundedRectangle(cornerRadius: r)) }
                else {
                    VStack(spacing: 0) { Color.white.opacity(0.12).frame(height: 2); Spacer(minLength: 0) }.clipShape(RoundedRectangle(cornerRadius: r))
                    RoundedRectangle(cornerRadius: r).stroke(Color.black.opacity(0.5), lineWidth: m.r(0.5)).blur(radius: m.r(0.25)).offset(y: m.r(0.35)).clipShape(RoundedRectangle(cornerRadius: r)).mask(VStack { Spacer(); Color.black.frame(height: g.size.height * 0.4) })
                }
                // the LED bar (i): left/right 30%, top .45rem, .22rem high
                RoundedRectangle(cornerRadius: m.r(0.11)).fill(lit ? th.led : Color(hex: "#2b2015"))
                    .shadow(color: lit ? th.led : .clear, radius: 3)
                    .frame(width: g.size.width * 0.4, height: m.r(0.22))
                    .position(x: g.size.width / 2, y: m.r(0.45) + m.r(0.11))
                Text("\(t + 1)").font(PanelFont.ui(fs, 700)).letterSpacing(0.08, size: fs).foregroundStyle(Color(hex: "#8f939a"))
                    .position(x: m.r(0.45) + fs * 0.35 * CGFloat(String(t + 1).count), y: m.r(0.4) + fs / 2)
                Text(c.padName(t, max: nameMax)).font(PanelFont.ui(fs, 700)).letterSpacing(smp ? 0.06 : 0.16, size: fs).foregroundStyle(Color(hex: "#bdb9b0"))
                    .multilineTextAlignment(.center).lineLimit(smp ? 1 : 2).lineSpacing(0)
                    .frame(width: g.size.width - (smp ? 2 * m.r(0.35) : 0))
                    .frame(maxHeight: .infinity, alignment: .bottom).padding(.bottom, m.r(0.45))
            }
            .overlay(RoundedRectangle(cornerRadius: r).stroke(Color(hex: "#070708"), lineWidth: 1))
            .shadow(color: .black.opacity(down ? 0.6 : 0.75), radius: down ? 1 : m.r(0.35) / 2, x: 0, y: down ? m.r(0.1) : m.r(0.3))
            .overlay { if sel { RoundedRectangle(cornerRadius: r + 2).stroke(th.cyan, lineWidth: 2).padding(-4) } }
            .scaleEffect(down ? 0.985 : 1).offset(y: down ? 2 : 0)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { v in
                    guard !down else { return }
                    down = true
                    let k = min(1, max(0, 1 - v.startLocation.y / max(1, g.size.height)))
                    c.hitPad(t, velocity127: 50 + 77 * k)
                }
                .onEnded { _ in down = false })
            .accessibilityElement().accessibilityLabel("Pad \(t + 1), \(c.trackName(t))").accessibilityAddTraits(.isButton)
            .accessibilityAction { c.hitPad(t, velocity127: 100) }
        }
    }
}

// MARK: - SOUND

struct SoundSection: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        let t = c.selectedTrack, k = "t\(t + 1)", eng = c.engineKind(t)
        PanelSection(title: "SOUND", extra: "TRACK \(t + 1) · \(c.trackName(t))", zone: .snd) {
            VStack(alignment: .leading, spacing: 0) {
                EngineRow(c: c, k: k, eng: eng).padding(.bottom, m.r(0.2))
                if eng == 0 { ModelGrid(names: DrumController.short, selected: Int(c.value(k + ".model").rounded())) { c.set(k + ".model", Double($0)) }.padding(.bottom, m.r(0.2)) }
                else if eng == 1 { SampleRow(c: c, t: t).padding(.vertical, m.r(0.3)) }
                else {
                    ModelGrid(names: DrumController.fmShort, selected: Int(c.value(k + ".fmalgo").rounded())) { c.set(k + ".fmalgo", Double($0)) }.padding(.bottom, m.r(0.2))
                    FlowRow(gap: m.r(0.05), rowGap: m.r(0.1), alignment: .top) {   // .dmfm
                        ForEach([("fmfreq", "Freq"), ("fmratio", "Ratio"), ("fmratio2", "Ratio 2"), ("fmindex", "Index"), ("fmidec", "Mod dec"), ("fmfb", "Feedback"), ("fmfold", "Fold"), ("fmnoise", "Noise")], id: \.0) { x in
                            ParamKnob(c: c, key: "\(k).\(x.0)", label: x.1)
                        }
                    }
                    .padding(.top, m.r(0.1)).padding(.bottom, m.r(0.2))
                    .overlay(alignment: .bottom) { Color(hex: "#26282c").frame(height: 1) }
                    .padding(.bottom, m.r(0.2))
                }
                SoundKnobs(c: c, k: k, eng: eng)
                VintageRow(c: c, t: t, k: k, eng: eng)
            }
        }
    }
}

/// .dmeng: SYNTH · SAMPLE · FM, then CHOKE — · A · B · C · D pushed right (margin-left:auto; on its own line when it wraps).
struct EngineRow: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    let k: String
    let eng: Int
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: m.r(0.25)) { engines; Spacer(minLength: 0); choke }
            VStack(alignment: .trailing, spacing: m.r(0.25)) { engines.frame(maxWidth: .infinity, alignment: .leading); choke }
        }
    }
    private var engines: some View {
        HStack(spacing: m.r(0.25)) {
            ForEach(0..<3, id: \.self) { i in
                Button(["SYNTH", "SAMPLE", "FM"][i]) { c.set(k + ".engine", Double(i)) }.buttonStyle(HBStyle(minWidth: 4.2, led: .cyan, on: eng == i))
            }
        }.fixedSize()
    }
    private var choke: some View {
        let g = Int(c.value(k + ".choke").rounded()), fs = m.r(0.55)
        return HStack(spacing: m.r(0.18)) {
            Text("CHOKE").font(PanelFont.ui(fs, 700)).letterSpacing(0.16, size: fs).foregroundStyle(th.print).padding(.trailing, m.r(0.15))
            ForEach(0..<5, id: \.self) { i in
                Button(i == 0 ? "—" : ["", "A", "B", "C", "D"][i]) { c.set(k + ".choke", Double(i)) }.buttonStyle(HBStyle(led: .amber, on: g == i))
                    .accessibilityLabel(i == 0 ? "No choke group" : "Choke group \(["", "A", "B", "C", "D"][i])")
            }
        }.fixedSize()
    }
}

/// .dmmodels: a 4-column grid of small keys (.54rem, letter-spacing .08em).
struct ModelGrid: View {
    @Environment(\.panel) private var m
    let names: [String]
    let selected: Int
    let set: (Int) -> Void
    var body: some View {
        let rows = (names.count + 3) / 4
        VStack(spacing: m.r(0.22)) {
            ForEach(0..<rows, id: \.self) { r in
                HStack(spacing: m.r(0.22)) {
                    ForEach(0..<4, id: \.self) { col in
                        let i = r * 4 + col
                        if i < names.count {
                            Button(names[i]) { set(i) }.buttonStyle(HBStyle(minWidth: 0, fontSize: 0.54, letterSpacing: 0.08, paddingX: 0.2, led: .amber, on: i == selected, fill: true))
                        } else { Color.clear.frame(maxWidth: .infinity, maxHeight: 1) }
                    }
                }
            }
        }
    }
}

/// .dmsmp: SAMPLE ✓ / LOAD SAMPLE… and its note.
struct SampleRow: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let t: Int
    var body: some View {
        let name = c.project.tracks[t].sample?.name
        FlowRow(gap: m.r(0.4), rowGap: m.r(0.3)) {
            Button(name == nil ? "LOAD SAMPLE…" : "SAMPLE ✓") { c.requestSampleImport(track: t) }
                .buttonStyle(HBStyle(minWidth: 5.6, led: .amber, on: name != nil)).fixedSize()
            PanelNote(text: name.map { "\($0) — tune, decay (full = to the end), tone (low-pass), sweep, crush and sends shape it." } ?? "No sample on this track yet: it stays silent until you load one.",
                      maxWidth: nil, size: 0.62)
                .frame(minWidth: m.r(12), alignment: .leading).flexGrow()
        }
    }
}

/// The common dials, LONG after Decay, and the quiet bend group (.dmbend) at the end.
struct SoundKnobs: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let k: String
    let eng: Int
    var body: some View {
        let common: [(String, String)] = eng == 0 ? [("tune", "Tune"), ("decay", "Decay"), ("tone", "Tone"), ("snap", "Snap"), ("level", "Level"), ("pan", "Pan"), ("bits", "Bits"), ("rate", "Rate"), ("dly", "Delay"), ("rev", "Reverb")]
            : eng == 1 ? [("tune", "Tune"), ("decay", "Decay"), ("tone", "Tone"), ("level", "Level"), ("pan", "Pan"), ("bits", "Bits"), ("rate", "Rate"), ("dly", "Delay"), ("rev", "Reverb")]
            : [("tune", "Tune"), ("decay", "Decay"), ("tone", "Bright"), ("snap", "Click"), ("level", "Level"), ("pan", "Pan"), ("bits", "Bits"), ("rate", "Rate"), ("dly", "Delay"), ("rev", "Reverb")]
        let lng = c.value(k + ".long") > 0.5
        FlowRow(gap: m.r(0.05), rowGap: m.r(0.1), alignment: .top) {
            ForEach(common, id: \.0) { x in
                if x.0 == "decay" {
                    ParamKnob(c: c, key: k + ".decay", label: lng ? "Decay ×20" : x.1, format: lng ? { v in
                        let s = v * 20; return eng == 1 && s >= 59 ? "FULL" : s >= 10 ? String(format: "%.0f s", s) : String(format: "%.1f s", s) } : nil)
                    Button("LONG") { c.set(k + ".long", lng ? 0 : 1) }.buttonStyle(HBStyle(led: .cyan, on: lng))
                        .padding(.horizontal, m.r(0.15)).frame(height: m.r(3.55))   // align-self:center in the dial row
                } else {
                    ParamKnob(c: c, key: "\(k).\(x.0)", label: x.1)
                }
            }
            HStack(alignment: .top, spacing: m.r(0.05)) {   // .dmbend
                ParamKnob(c: c, key: k + ".sweep", label: "Sweep", cellWidth: 3, knobSize: 1.9)
                ParamKnob(c: c, key: k + ".swtime", label: "Sw time", cellWidth: 3, knobSize: 1.9)
                ParamKnob(c: c, key: k + ".bend", label: "Bend", cellWidth: 3, knobSize: 1.9)
                ParamKnob(c: c, key: k + ".brate", label: "Bend rate", cellWidth: 3, knobSize: 1.9)
            }
            .padding(.leading, m.r(0.45))
            .overlay(alignment: .leading) { Color(hex: "#26282c").frame(width: 1) }
            .padding(.leading, m.r(0.35))
        }
    }
}

/// .dmvint — SAMPLER: Metalise, Resample, Model, Transient, T.Sens; on sample tracks Tune mode, Stretch, Slice, BREAK LAB.
struct VintageRow: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let t: Int
    let k: String
    let eng: Int
    var body: some View {
        let n = c.project.tracks[t].slices?.slices.count ?? 0
        FlowRow(gap: m.r(0.05), rowGap: m.r(0.3), alignment: .bottom) {
            ParamKnob(c: c, key: k + ".metal", label: "Metalise", format: Fmt.pctOff)
            ParamKnob(c: c, key: k + ".rsmp", label: "Resample", format: Fmt.pctOff)
            ParamSelectCell(c: c, key: k + ".smodel", label: "Model", cellWidth: 6, fontSize: 0.72, fillWidth: true)
            ParamSelectCell(c: c, key: k + ".rsmode", label: "Transient", cellWidth: 6, fontSize: 0.72, fillWidth: true)
            ParamKnob(c: c, key: k + ".rssens", label: "T.Sens", format: Fmt.pct)
            if eng == 1 {
                ParamSelectCell(c: c, key: k + ".tsmode", label: "Tune mode", cellWidth: 6, fontSize: 0.72, fillWidth: true)
                ParamKnob(c: c, key: k + ".stretch", label: "Stretch", format: { String(format: "%.2f×", $0) })
                if n > 0 { ParamKnob(c: c, key: k + ".slice", label: "Slice", format: { "\(min(Int($0.rounded()), n))/\(n)" }) }
                Button(n > 0 ? "BREAK LAB · \(n)" : "BREAK LAB…") { c.selectedTrack = t; c.window = .breakLab }.buttonStyle(HBStyle(led: .cyan, on: n > 0))
            }
        }
        .padding(.top, m.r(0.95))
        .overlay(alignment: .topLeading) { TinyLabel(text: "SAMPLER").padding(.top, m.r(0.12)).padding(.leading, m.r(0.1)) }
        .overlay(alignment: .top) { Color(hex: "#2a2d32").frame(height: 1) }
        .padding(.top, m.r(0.35))
    }
}

// MARK: - STEP

struct StepSection: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        let t = c.selectedTrack, s = c.selectedStep
        PanelSection(title: "STEP", extra: s >= 0 ? "T\(t + 1) · \(String(format: "%02d", s + 1))" : "—", zone: .step) {
            if s < 0 {
                PanelNote(text: "Hold a step (or turn EDIT on and tap one) to set its velocity, pan, pitch, ratchet, crush, delay, reverb and chance — and, on FM tracks, its own FM ratio.")
                    .padding(.top, m.r(0.35))
            } else { StepEditor(c: c, t: t) }
        }
    }
}

struct StepEditor: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let t: Int
    var body: some View {
        let st = c.selectedStepValue, v = st ?? Step(), eng = c.engineKind(t)
        VStack(alignment: .leading, spacing: 0) {
            FlowRow(gap: m.r(0.05), rowGap: m.r(0.1), alignment: .top) {
                ValueKnob(label: "Velocity", value: Double(v.velocity), range: 0...1, defaultValue: 0.8, format: { "\(Int(($0 * 127).rounded()))" }) { x in c.updateStep { $0.velocity = Float(x) } }
                ValueKnob(label: "Pan", value: Double(v.pan), range: -1...1, defaultValue: 0, format: { abs($0) < 0.03 ? "C" : ($0 < 0 ? "L" : "R") + "\(Int((abs($0) * 100).rounded()))" }) { x in c.updateStep { $0.pan = Float(abs(x) < 0.03 ? 0 : x) } }
                ValueKnob(label: "Pitch", value: Double(v.pitch), range: -12...12, defaultValue: 0, step: 1, format: { ($0 > 0 ? "+" : "") + "\(Int($0.rounded())) st" }) { x in c.updateStep { $0.pitch = Int8(x.rounded()) } }
            }
            FlowRow(gap: m.r(0.05), rowGap: m.r(0.1), alignment: .top) {
                ValueKnob(label: "Crush", value: Double(v.crush), range: 0...1, defaultValue: 0, format: { $0 <= 0 ? "OFF" : "\(16 - Int(($0 * 14).rounded())) bit" }) { x in c.updateStep { $0.crush = Float(x < 0.02 ? 0 : x) } }
                ValueKnob(label: "Delay", value: Double(v.delaySend), range: 0...1, defaultValue: 0, format: { "\(Int(($0 * 100).rounded()))" }) { x in c.updateStep { $0.delaySend = Float(x < 0.01 ? 0 : x) } }
                ValueKnob(label: "Reverb", value: Double(v.reverbSend), range: 0...1, defaultValue: 0, format: { "\(Int(($0 * 100).rounded()))" }) { x in c.updateStep { $0.reverbSend = Float(x < 0.01 ? 0 : x) } }
                ValueKnob(label: "Fold", value: Double(v.fold), range: 0...1, defaultValue: 0, format: Fmt.pctOff) { x in c.updateStep { $0.fold = Float(x < 0.01 ? 0 : x) } }
                ValueKnob(label: "Chance", value: Double(v.chance), range: 0...1, defaultValue: 1, format: Fmt.pct) { x in c.updateStep { $0.chance = Float(x > 0.99 ? 1 : x) } }
                if eng == 2 {   // the step's own FM ratio (0 = the track's)
                    let r = Double(v.fmRatio), k = r > 0 ? log(r / 0.25) / log(64) : 0
                    ValueKnob(label: "FM ratio", value: k, range: 0...1, defaultValue: 0, format: { $0 < 0.02 ? "TRACK" : String(format: "%.2f", 0.25 * pow(64, $0)) }) { x in
                        c.updateStep { $0.fmRatio = x < 0.02 ? 0 : Float((0.25 * pow(64, x) * 100).rounded() / 100) } }
                }
            }
            StepExtras(c: c, v: v, eng: eng, t: t).padding(.top, m.r(0.2))
            HStack(spacing: m.r(0.2)) {   // .dmrat
                let fs = m.r(0.58)
                Text("RATCHET").font(PanelFont.ui(fs, 400)).letterSpacing(0.14, size: fs).foregroundStyle(Color(hex: "#9a9ea6")).padding(.trailing, m.r(0.2))
                ForEach(1...4, id: \.self) { n in
                    Button("×\(n)") { c.updateStep { $0.ratchet = UInt8(n) } }.buttonStyle(HBStyle(minWidth: 2.2, led: .amber, on: Int(st?.ratchet ?? 1) == n))
                }
            }
            .padding(.vertical, m.r(0.15))
            HStack(spacing: m.r(0.3)) {
                let ring = v.ringOn
                Button(ring ? "RING " + (Int(v.ringMaster) >= DrumLists.ringOscillator ? "OSC" : "T\(Int(v.ringMaster) + 1)") : "RING MOD…") {
                    c.window = .ring(track: t, step: c.selectedStep)
                }.buttonStyle(HBStyle(led: .cyan, on: ring))
                Button(st != nil ? "STEP ON" : "STEP OFF") { c.toggleSelectedStep() }.buttonStyle(HBStyle(led: .amber, on: st != nil))
            }
        }
    }
}

/// .dmstepx: PITCH SHIFT · SPECTRAL · SAMPLER, each in a .dmxg box.
struct StepExtras: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let v: Step
    let eng: Int
    let t: Int
    var body: some View {
        let ns = c.project.tracks[t].slices?.slices.count ?? 0
        FlowRow(gap: m.r(0.4), rowGap: m.r(0.4), alignment: .top) {
            StepGroup(title: "PITCH SHIFT") {
                ValueKnob(label: "Shift", value: Double(v.shiftSemitones), range: -24...24, defaultValue: 0, bipolar: true, format: { abs($0) < 0.25 ? "OFF" : ($0 > 0 ? "+" : "") + String(format: "%.1f st", $0) }) { x in
                    c.updateStep { $0.shiftSemitones = Float(abs(x) < 0.25 ? 0 : (x * 2).rounded() / 2) } }
                ValueKnob(label: "Mix", value: Double(v.shiftMix), range: 0...1, defaultValue: 1, format: Fmt.pct) { x in c.updateStep { $0.shiftMix = Float(x) } }
            }
            StepGroup(title: "SPECTRAL") {
                ValueKnob(label: "Spectral", value: Double(v.spectral), range: 0...1, defaultValue: 0, format: Fmt.pctOff) { x in c.updateStep { $0.spectral = Float(x < 0.01 ? 0 : x) } }
                ValueKnob(label: "Colour", value: Double(v.spectralColour), range: 0...1, defaultValue: 0, format: Fmt.specColour) { x in c.updateStep { $0.spectralColour = Float(x) } }
                ValueKnob(label: "Mix", value: Double(v.spectralMix), range: 0...1, defaultValue: 1, format: Fmt.pct) { x in c.updateStep { $0.spectralMix = Float(x) } }
            }
            StepGroup(title: "SAMPLER") {
                ValueKnob(label: "Metalise", value: max(-0.02, Double(v.metalise)), range: -0.02...1, defaultValue: -0.02, format: { $0 < 0.005 ? "TRACK" : Fmt.pct($0) }) { x in
                    c.updateStep { $0.metalise = Float(x < 0.005 ? -1 : x) } }
                if eng == 1 {
                    let top = Double(max(1, ns))
                    ValueKnob(label: "Slice", value: min(Double(v.slice), top), range: 0...top, defaultValue: 0, step: 1, format: { Int($0.rounded()) > 0 ? "S\(Int($0.rounded()))" : "TRACK" }) { x in c.updateStep { $0.slice = UInt8(x.rounded()) } }
                    ValueKnob(label: "Rev %", value: Double(v.reverseChance), range: 0...1, defaultValue: 0, format: Fmt.pct) { x in c.updateStep { $0.reverseChance = Float(x < 0.01 ? 0 : x) } }
                    ValueKnob(label: "Stut %", value: Double(v.stutterChance), range: 0...1, defaultValue: 0, format: Fmt.pct) { x in c.updateStep { $0.stutterChance = Float(x < 0.01 ? 0 : x) } }
                }
            }
        }
    }
}

/// .dmxg — a bordered group with a tiny title in its top-left corner.
struct StepGroup<Content: View>: View {
    @Environment(\.panel) private var m
    let title: String
    @ViewBuilder var content: Content
    var body: some View {
        HStack(alignment: .bottom, spacing: 0) { content }
            .padding(.top, m.r(0.55)).padding(.horizontal, m.r(0.15)).padding(.bottom, m.r(0.1))
            .overlay(alignment: .topLeading) { TinyLabel(text: title).padding(.top, m.r(0.1)).padding(.leading, m.r(0.35)) }
            .overlay(RoundedRectangle(cornerRadius: m.r(0.35)).stroke(Color(hex: "#2a2d32"), lineWidth: 1))
    }
}

// MARK: - EFFECTS · EQ · TAPE

struct FxColumn: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var horizontal: Bool
    var body: some View {
        Group {
            if horizontal {
                HStack(alignment: .top, spacing: m.r(0.35)) {
                    EffectsSection(c: c).frame(maxWidth: .infinity)
                    EqSection(c: c).frame(maxWidth: .infinity)
                    TapeSection(c: c).frame(maxWidth: .infinity)
                }
                .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: m.r(0.35)) {
                    EffectsSection(c: c).fixedSize(horizontal: false, vertical: true)
                    EqSection(c: c).fixedSize(horizontal: false, vertical: true)
                    TapeSection(c: c)
                }
            }
        }
        .padding(m.r(0.25))
        .background(RoundedRectangle(cornerRadius: m.r(0.55)).fill(Color.black.opacity(0.38))
            .overlay(RoundedRectangle(cornerRadius: m.r(0.55)).stroke(Color.white.opacity(0.04), lineWidth: 1)))
    }
}

struct EffectsSection: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        let rt = Int(c.value("dr.revtype").rounded())
        let sizeFmt: ((Double) -> String)? = rt == 3 ? { x in let v = Int((x * 100).rounded()); return x >= 0.95 ? "FREEZE \(v)%" : x >= 0.9 ? "WASH \(v)%" : "\(v)%" }
            : rt == 2 ? { x in "HOLD \(Int((60 + 500 * x).rounded())) ms" } : nil
        PanelSection(title: "EFFECTS", zone: .fx) {
            VStack(alignment: .leading, spacing: 0) {
                FlowRow(gap: m.r(0.05), rowGap: m.r(0.1), alignment: .top) {
                    ParamSelectCell(c: c, key: "dr.dlydiv", label: "Delay")
                    ParamKnob(c: c, key: "dr.dlyfb", label: "Feedback")
                    ParamKnob(c: c, key: "dr.dlytone", label: "D.Tone")
                    ParamSelectCell(c: c, key: "dr.revtype", label: "Reverb")
                    ParamKnob(c: c, key: "dr.revsize", label: "Rev Size", format: sizeFmt)
                    ParamKnob(c: c, key: "dr.revdamp", label: "Damping")
                }
                ChainRow {
                    let pp = c.value("dr.dlypp") > 0.5
                    Button("PING-PONG") { c.set("dr.dlypp", pp ? 0 : 1) }.buttonStyle(HBStyle(led: .amber, on: pp))
                    ParamSelect(c: c, key: "dr.ch", options: (0...16).map { $0 == 0 ? "MIDI ANY" : "MIDI CH \($0)" })
                }
                .padding(.top, m.r(0.35))
            }
        }
    }
}

struct EqSection: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        let t = c.selectedTrack, k = "t\(t + 1)"
        PanelSection(title: "EQ", extra: "TRACK \(t + 1)", zone: .step) {
            VStack(spacing: 0) {
                HStack(spacing: m.r(0.35)) {   // .dmeqh: the curve and FLAT
                    EqCurve(c: c, t: t).frame(minWidth: m.r(9)).frame(height: m.r(2.2)).frame(maxWidth: .infinity)
                    Button("FLAT") { for b in 1...4 { c.set("\(k).eq\(b)g", 0) } }.buttonStyle(HBStyle())
                }
                .padding(.bottom, m.r(0.1))
                HStack(alignment: .top, spacing: 0) {   // .dmeqk: four columns
                    ForEach(0..<4, id: \.self) { b in
                        VStack(spacing: 0) {
                            TinyLabel(text: ["LO", "LO-MID", "HI-MID", "HI"][b], size: 0.48, spacing: 0.12)
                            ParamKnob(c: c, key: "\(k).eq\(b + 1)f", label: "Freq", cellWidth: 3.1, knobSize: 2)
                            EqGainKnob(c: c, key: "\(k).eq\(b + 1)g")
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
    }
}
struct EqGainKnob: View {
    let c: DrumController
    let key: String
    var body: some View {
        let spec = ParameterSpec.spec(forKey: key)
        ParamKnob(c: c, key: key, label: "Gain", format: { abs($0) < 0.25 ? "OFF" : ($0 > 0 ? "+" : "") + String(format: "%.1f dB", $0) }, cellWidth: 3.1, knobSize: 2,
                  setNormalized: { x in guard let spec else { return }; let v = spec.value(atNormalized: x); c.set(key, abs(v) < 0.25 ? 0 : v) })
    }
}

/// The EQ's response, from the same RBJ formulas as the engine at 48 kHz (web drumEqResponse / drumEqCurve).
struct EqCurve: View {
    @Environment(\.theme) private var th
    let c: DrumController
    let t: Int
    var body: some View {
        let k = "t\(t + 1)"
        let bands = (1...4).map { (c.value("\(k).eq\($0)f"), c.value("\(k).eq\($0)g")) }
        Canvas { ctx, size in
            let W = size.width, H = size.height, sx = W / 120, sy = H / 36
            var mid = Path(); mid.move(to: CGPoint(x: 0, y: H / 2)); mid.addLine(to: CGPoint(x: W, y: H / 2))
            ctx.stroke(mid, with: .color(Color(hex: "#2a2d32")), lineWidth: 1)
            var p = Path()
            for i in 0...60 {
                let f = 20 * pow(1000, Double(i) / 60), db = min(18, max(-18, EqCurve.response(bands, f)))
                let pt = CGPoint(x: Double(i) / 60 * 120 * sx, y: (18 - db / 18 * 16) * sy)
                if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
            }
            ctx.stroke(p, with: .color(Color(hex: "#ffb23d")), lineWidth: 1.5 * min(sx, sy))
        }
        .background(RoundedRectangle(cornerRadius: 4).fill(Color(hex: "#0b0c0e")))
    }
    static func response(_ bands: [(Double, Double)], _ f: Double) -> Double {
        let sr = 48000.0; var db = 0.0
        for (b, (freq, g)) in bands.enumerated() where g != 0 {
            let fc = min(freq, sr * 0.45), A = pow(10, g / 40), w0 = 2 * Double.pi * fc / sr, cs = cos(w0), sn = sin(w0)
            var b0, b1, b2, a0, a1, a2: Double
            if b == 0 || b == 3 {
                let s: Double = b == 0 ? 1 : -1, sA = 2 * sqrt(A) * sn / 2 * 2.0.squareRoot()
                b0 = A * ((A + 1) - s * (A - 1) * cs + sA); b1 = s * 2 * A * ((A - 1) - s * (A + 1) * cs); b2 = A * ((A + 1) - s * (A - 1) * cs - sA)
                a0 = (A + 1) + s * (A - 1) * cs + sA; a1 = -s * 2 * ((A - 1) + s * (A + 1) * cs); a2 = (A + 1) + s * (A - 1) * cs - sA
            } else { let al = sn / 2; b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A }
            let w = 2 * Double.pi * f / sr, c1 = cos(w), s1 = sin(w), c2 = cos(2 * w), s2 = sin(2 * w)
            let nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2), dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2)
            db += 10 * log10((nr * nr + ni * ni) / (dr * dr + di * di))
        }
        return db
    }
}

struct TapeSection: View {
    let c: DrumController
    var body: some View {
        PanelSection(title: "TAPE", extra: "WHOLE MIX", zone: .fx) {
            HStack(alignment: .top, spacing: 0) {   // .dmtape .dmknobs{justify-content:space-around}
                Spacer(minLength: 0)
                ParamKnob(c: c, key: "tp.wow", label: "Wow", format: Fmt.pctOff); Spacer(minLength: 0)
                ParamKnob(c: c, key: "tp.flutter", label: "Flutter", format: Fmt.pctOff); Spacer(minLength: 0)
                ParamKnob(c: c, key: "tp.dust", label: "Dust", format: Fmt.pctOff); Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - the LFO row (.dmlforow)

struct LfoRow: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        FlowRow(gap: m.r(0.35), rowGap: m.r(0.35), alignment: .top) {
            ForEach(1...3, id: \.self) { i in
                LfoSection(c: c, i: i).frame(minWidth: m.width <= 760 ? m.sheetWidth : m.r(11.5)).flexGrow()
            }
        }
    }
}

struct LfoSection: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    let i: Int
    var body: some View {
        let k = "lfo\(i)", dests = ParameterSpec.spec(forKey: k + ".dest")?.choices ?? []
        let dest = dests[safe: Int(c.value(k + ".dest").rounded())] ?? ""
        let sync = c.value(k + ".sync") > 0.5
        PanelSection(title: "LFO \(i)", extra: dest.uppercased(), zone: .mod) {
            VStack(alignment: .leading, spacing: m.r(0.25)) {
                FlowRow(gap: m.r(0.3), rowGap: m.r(0.3)) {
                    HStack(alignment: .top, spacing: m.r(0.05)) {
                        if sync { ParamSelectCell(c: c, key: k + ".div", label: "Division") } else { ParamKnob(c: c, key: k + ".rate", label: "Rate") }
                        ParamKnob(c: c, key: k + ".depth", label: "Depth")
                    }
                    HStack(spacing: m.r(0.25)) {   // .dmlfoopts
                        ParamSelect(c: c, key: k + ".shape", fontSize: 0.66)
                        ParamSelect(c: c, key: k + ".dest", options: dests.map { "→ " + $0.replacingOccurrences(of: "Metal ", with: "").uppercased() }, fontSize: 0.66)
                        Button("SYNC") { c.set(k + ".sync", sync ? 0 : 1) }.buttonStyle(HBStyle(led: .cyan, on: sync))
                    }
                }
                if Int(c.value(k + ".shape").rounded()) == LFOShapes.drawShape { LfoDrawEditor(c: c, lfo: i - 1, width: 168, height: 48) }
            }
        }
        .overlay(alignment: .topTrailing) {
            HStack(spacing: m.r(0.4)) {
                Button { c.window = .mod } label: { ModChip(source: i - 1, level: Double(c.modSources[safe: i - 1] ?? 0) * 0.5 + 0.5, compact: true) }.buttonStyle(.plain)
                Circle().fill(th.cyan).frame(width: m.r(0.45), height: m.r(0.45)).shadow(color: th.cyan, radius: 3).opacity(c.lfoLamp[safe: i - 1] ?? 0.15)
            }
            .padding(.trailing, m.r(0.55)).padding(.top, m.r(0.12))
        }
    }
}

/// web lfoDrawEditor: 16 bars drawn with a finger, and SINE · RAMP · STEPS · RANDOM · FLAT.
struct LfoDrawEditor: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let lfo: Int
    let width: CGFloat
    let height: CGFloat
    @State private var last = -1
    var body: some View {
        let pts = c.project.lfoShapes[safe: lfo] ?? LFOShapes.defaultShape, col = ModColors.color(lfo)
        VStack(alignment: .leading, spacing: m.r(0.25)) {
            Canvas { ctx, size in
                let W = size.width, H = size.height, n = pts.count
                ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(hex: "#0b0c0e")))
                var mid = Path(); mid.move(to: CGPoint(x: 0, y: H / 2)); mid.addLine(to: CGPoint(x: W, y: H / 2)); ctx.stroke(mid, with: .color(Color(hex: "#2a2d33")), lineWidth: 0.5)
                for j in 0..<n {
                    let x0 = CGFloat(j) * W / CGFloat(n), y = H / 2 - CGFloat(pts[j]) * (H / 2 - 1.5)
                    ctx.fill(Path(CGRect(x: x0 + 0.5, y: min(y, H / 2), width: W / CGFloat(n) - 1, height: abs(y - H / 2))), with: .color(col.opacity(0.33)))
                }
                var p = Path()
                for j in 0...n { let pt = CGPoint(x: CGFloat(j) * W / CGFloat(n), y: H / 2 - CGFloat(pts[j % n]) * (H / 2 - 1.5)); if j == 0 { p.move(to: pt) } else { p.addLine(to: pt) } }
                ctx.stroke(p, with: .color(col), lineWidth: 1.5)
            }
            .frame(width: width, height: height)
            .clipShape(RoundedRectangle(cornerRadius: m.r(0.3)))
            .overlay(RoundedRectangle(cornerRadius: m.r(0.3)).stroke(Color(hex: "#2a2d33"), lineWidth: 1))
            .gesture(DragGesture(minimumDistance: 0).onChanged { g in draw(at: g.location) }.onEnded { _ in last = -1; c.pushLfoShape(lfo) })
            HStack(spacing: m.r(0.2)) {
                ForEach(["SINE", "RAMP", "STEPS", "RANDOM", "FLAT"], id: \.self) { n in
                    Button(n) { c.presetLfoShape(lfo, n) }.buttonStyle(HBStyle(height: 1.2, fontSize: 0.5, paddingX: 0.3))
                }
            }
        }
    }
    private func draw(at p: CGPoint) {
        var pts = c.project.lfoShapes[safe: lfo] ?? LFOShapes.defaultShape
        let n = pts.count, j = min(n - 1, max(0, Int(p.x / width * CGFloat(n)))), v = ((min(1, max(-1, 1 - 2 * Double(p.y / height)))) * 100).rounded() / 100
        if last >= 0 && last != j {
            let a = min(last, j), b = max(last, j), v0 = pts[last]
            for k in stride(from: a + 1, to: b, by: 1) { pts[k] = ((v0 + (v - v0) * Double(k - last) / Double(j - last)) * 100).rounded() / 100 }
        }
        pts[j] = v; last = j
        c.setLfoShape(lfo, pts, push: false)
    }
}

extension DrumController {
    func setLfoShape(_ lfo: Int, _ pts: [Double], push: Bool = true) {
        edit { p in var s = LFOShapes.clean(p.lfoShapes); s[lfo] = pts; p.lfoShapes = s }
        if push { pushLfoShape(lfo) }
    }
    func pushLfoShape(_ lfo: Int) {
        let row = LFOShapes.clean(project.lfoShapes)[lfo].map { Float($0) }
        engine.send(.setLfoPoints(lfo: lfo, start: 0, Array(row[0..<8]))); engine.send(.setLfoPoints(lfo: lfo, start: 8, Array(row[8..<16])))
    }
    func presetLfoShape(_ lfo: Int, _ name: String) {
        let f: (Int) -> Double
        switch name {
        case "SINE": f = { sin(2 * .pi * Double($0) / 16) }
        case "RAMP": f = { 1 - Double($0) / 7.5 }
        case "STEPS": f = { [1, 0.5, 0, -0.5, -1, -0.5, 0, 0.5][$0 / 2] }
        case "RANDOM": f = { _ in Double.random(in: -1...1) }
        default: f = { _ in 0 }
        }
        setLfoShape(lfo, (0..<16).map { (min(1, max(-1, f($0))) * 100).rounded() / 100 })
    }
}
