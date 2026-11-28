// Vektur Drum — the BREAK LAB (web/src/breaklab.js): one track's sample — waveform with zoom and scroll, transient
// marks (detect, add, move, delete, accept / reject, type), slicing (transient, equal, beat, bar, grid), each slice's
// settings, the slice pads, sending slices to steps and tracks, the groove generator, RESAMPLE and EXPORT MIDI. The
// analysis and the groove generator are the native ones (SampleAnalysis, GrooveGenerator); slices reach the engine
// through DrumEngine.setSample with the track's slices.
import SwiftUI
import VekturDrumCore
import VekturDrumAudio
import VekturDrumDSP

struct BreakLabWindow: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    @State private var st = BLState()
    static let colours = ["#ff6a3d", "#ffd23d", "#3dd6ff", "#a98bff", "#9aa0a8"]
    var body: some View {
        let t = c.selectedTrack, sx = c.project.tracks[t].slices ?? SampleSlices(), smp = c.decodedSamples[t]
        ModalSheet(c: c, title: "BREAK LAB", width: min(1100 / 13, m.width * 0.96 / m.rem), pad: (1, 1.2),
                   accessory: AnyView(Text("TRACK \(t + 1) · \(c.project.tracks[t].sample?.name ?? "no sample")").font(.system(size: m.r(0.7), weight: .semibold)).tracking(0.12 * m.r(0.7)).foregroundStyle(Color(hex: "#9a9ea6")))) {
            VStack(alignment: .leading, spacing: 0) {
                FlowRow(gap: m.r(0.35), rowGap: m.r(0.35), alignment: .bottom) {   // .bltracks
                    RowLabel("TRACK")
                    ForEach(0..<c.trackCount, id: \.self) { i in
                        Button("\(i + 1)") { c.selectedTrack = i; st = BLState() }.buttonStyle(HBStyle(led: .amber, on: i == t))
                            .overlay(alignment: .bottom) { if c.project.tracks[i].sample != nil { Color(hex: "#3dd6ff").frame(height: 2).padding(.horizontal, 2) } }
                    }
                    Color(hex: "#3a3d43").frame(width: 1, height: m.r(1.9)).padding(.horizontal, m.r(0.2))
                    Button(smp == nil ? "LOAD SAMPLE…" : "REPLACE SAMPLE…") { c.sampleImportTrack = t; c.breakLabAfterImport = true }.buttonStyle(HBStyle())
                }
                .padding(.vertical, m.r(0.35))
                if let smp {
                    BLDetectRow(c: c, t: t, sx: sx, smp: smp, st: $st)
                    BLWave(c: c, t: t, sx: sx, smp: smp, st: $st).frame(height: 170).padding(.vertical, m.r(0.3))
                    BLZoomRow(c: c, t: t, sx: sx, smp: smp, st: $st)
                    BLSliceRow(c: c, t: t, sx: sx, st: $st)
                    if !sx.slices.isEmpty {
                        BLPads(c: c, t: t, sx: sx, st: $st)
                        BLSendRow(c: c, t: t, sx: sx, smp: smp, st: $st)
                        BLGenerator(c: c, t: t, sx: sx, smp: smp, st: $st)
                    }
                    BLRenderRow(c: c, t: t, st: $st)
                } else {
                    HelpText(text: "Load a break or any WAV / FLAC on this track. Its transients are found straight away; then slice it, play slices from steps and pads, and generate variations.")
                }
            }
        }
    }
}

/// The window's own state (web BL).
struct BLState {
    var zoom = 1.0, off = 0, sel = 0, mark = -1
    var undo: [SampleSlices] = [], redo: [SampleSlices] = []
    var bank: [[GrooveCell?]] = [], vsel = -1, gen = 1
    var opt = GrooveOptions()
    var split = false, append = false, busy = false
    var bpmText = ""
}

extension DrumController {
    /// The track's slices changed: song, then the engine (prepared off the main thread for long breaks).
    func setSlices(_ t: Int, _ sx: SampleSlices) {
        edit { $0.tracks[t].slices = sx }
        guard let s = decodedSamples[t] else { return }
        let vals = project.tracks[t].values, tempo = project.tempo, eng = engine
        Task.detached(priority: .userInitiated) { let p = EngineSamples.make(s, slices: sx, values: vals, tempo: tempo); await MainActor.run { eng.setPreparedSample(p, track: t) } }
    }
}
extension DrumEngine {
    /// Hands a prepared vd_sample to the engine (ownership passes; nil removes).
    @MainActor func setPreparedSample(_ s: OpaquePointer?, track t: Int) { vd_engine_set_sample(rawEngine, UInt32(t), s) }
}

struct BLDetectRow: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let t: Int
    let sx: SampleSlices
    let smp: DecodedSample
    @Binding var st: BLState
    var body: some View {
        FlowRow(gap: m.r(0.35), rowGap: m.r(0.35), alignment: .bottom) {
            ValueKnob(label: "Sens", value: sx.sensitivity, range: 0...1, defaultValue: 0.5, format: Fmt.pct) { v in var s = sx; s.sensitivity = v; c.edit { $0.tracks[t].slices = s } }
            ValueKnob(label: "Threshold", value: sx.gapMs, range: 5...400, defaultValue: 50, format: { "\(Int($0.rounded())) ms" }) { v in var s = sx; s.gapMs = v.rounded(); c.edit { $0.tracks[t].slices = s } }
            Button("DETECT") { snap(); var s = sx; SampleAnalysis.redetect(&s, sample: smp, projectTempo: c.project.tempo); if s.mode == .transient { s.makeSlices(frames: frames, rate: smp.sampleRate) }; c.setSlices(t, s); c.toast("\(s.marks.count) transients") }
                .buttonStyle(HBStyle(led: .cyan))
            VStack(spacing: m.r(0.05)) {   // BPM number field
                Text("BPM").font(PanelFont.ui(m.r(0.5), 400)).tracking(0.08 * m.r(0.5)).foregroundStyle(Color(hex: "#9a9ea6"))
                OledBox(pad: 0.1) {
                    TextField("—", text: Binding(get: { st.bpmText.isEmpty ? (sx.bpm > 0 ? shortNumber(sx.bpm) : "") : st.bpmText }, set: { st.bpmText = $0 }))
                        .keyboardType(.decimalPad).font(PanelFont.mono(m.r(0.85), 600)).foregroundStyle(Color(hex: "#ccffee")).frame(width: m.r(3.8))
                        .onSubmit { snap(); var s = sx; s.bpm = min(400, max(0, Double(st.bpmText) ?? 0)); st.bpmText = ""; c.setSlices(t, s) }
                }
            }
            Button("FIND BPM") { snap(); var s = sx; s.bpm = SampleAnalysis.bpm(smp, projectTempo: c.project.tempo); st.bpmText = ""; c.setSlices(t, s); c.toast(s.bpm > 0 ? "\(shortNumber(s.bpm)) BPM" : "No clear tempo") }.buttonStyle(HBStyle())
            SelectCell(label: "Slice by", options: SampleSlices.Mode.allCases.map(\.name), selected: sx.mode.rawValue, cellWidth: 5) { i in
                snap(); var s = sx; s.mode = SampleSlices.Mode(rawValue: i) ?? .transient; s.makeSlices(frames: frames, rate: smp.sampleRate); st.sel = 0; c.setSlices(t, s) }
            if sx.mode == .equal || (sx.mode.rawValue >= 2 && sx.bpm == 0) {
                let divs = [2, 4, 8, 12, 16, 24, 32]
                SelectCell(label: "Slices", options: divs.map(String.init), selected: divs.firstIndex(of: sx.divisions) ?? 2) { i in snap(); var s = sx; s.divisions = divs[i]; s.makeSlices(frames: frames, rate: smp.sampleRate); c.setSlices(t, s) }
            }
            if sx.mode == .grid {
                SelectCell(label: "Grid", options: SampleSlices.grids.map(\.label), selected: sx.grid) { i in snap(); var s = sx; s.grid = i; s.makeSlices(frames: frames, rate: smp.sampleRate); c.setSlices(t, s) }
            }
            Button("SLICE") { snap(); var s = sx; s.makeSlices(frames: frames, rate: smp.sampleRate); st.sel = 0; c.setSlices(t, s); c.toast("\(s.slices.count) slices") }.buttonStyle(HBStyle(led: .cyan))
            Color(hex: "#3a3d43").frame(width: 1, height: m.r(1.9)).padding(.horizontal, m.r(0.2))
            Button("UNDO") { restore(back: true) }.buttonStyle(HBStyle()).disabled(st.undo.isEmpty).opacity(st.undo.isEmpty ? 0.5 : 1)
            Button("REDO") { restore(back: false) }.buttonStyle(HBStyle()).disabled(st.redo.isEmpty).opacity(st.redo.isEmpty ? 0.5 : 1)
        }
        .padding(.vertical, m.r(0.35))
    }
    private var frames: Int { smp.channels.first?.count ?? 0 }
    private func snap() { st.undo.append(sx); if st.undo.count > 60 { st.undo.removeFirst() }; st.redo = [] }
    private func restore(back: Bool) {
        if back { guard let s = st.undo.popLast() else { return }; st.redo.append(sx); c.setSlices(t, s) }
        else { guard let s = st.redo.popLast() else { return }; st.undo.append(sx); c.setSlices(t, s) }
    }
}

/// .blwave — the waveform with the slices shaded and numbered, the marks (dashed when rejected, a triangle when placed by
/// hand). Tap a slice to select and hear it; drag a mark to move it; hold to place a new mark.
struct BLWave: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let t: Int
    let sx: SampleSlices
    let smp: DecodedSample
    @Binding var st: BLState
    @State private var drag = -1
    @State private var start: CGPoint?
    @State private var moved = false
    @State private var hold: Timer?
    var body: some View {
        GeometryReader { g in
            let W = g.size.width, H = g.size.height, d = smp.channels.first ?? [], n = max(1, d.count), span = Double(n) / st.zoom
            Canvas { cx, _ in
                let mid = H / 2
                func x(_ p: Int) -> CGFloat { CGFloat((Double(p - st.off)) / span) * W }
                for (i, v) in sx.slices.enumerated() {
                    let a = x(v.start), b = x(v.end); if b < 0 || a > W { continue }
                    cx.fill(Path(CGRect(x: a, y: 0, width: b - a, height: H)), with: .color(i == st.sel ? Color(255, 210, 61, 0.16) : i % 2 == 1 ? Color.white.opacity(0.035) : .clear))
                    cx.draw(Text("\(i + 1)" + (v.reverse ? "◀" : "")).font(.system(size: 9, weight: .semibold)).foregroundColor(Color(hex: "#7d8189")), at: CGPoint(x: a + 3, y: H - 4), anchor: .bottomLeading)
                }
                var wave = Path()
                for px in 0..<Int(W) {
                    let a = Int(Double(st.off) + Double(px) * span / Double(W)), b = max(a + 1, Int(Double(st.off) + Double(px + 1) * span / Double(W)))
                    var lo: Float = 0, hi: Float = 0, i = a
                    let stride = max(1, (b - a) / 64)
                    while i < min(b, d.count) { let v = d[i]; if v < lo { lo = v }; if v > hi { hi = v }; i += stride }
                    wave.move(to: CGPoint(x: CGFloat(px) + 0.5, y: mid - CGFloat(hi) * mid * 0.95)); wave.addLine(to: CGPoint(x: CGFloat(px) + 0.5, y: mid - CGFloat(lo) * mid * 0.95 + 0.5))
                }
                cx.stroke(wave, with: .color(Color(hex: "#cfd3da")), lineWidth: 1)
                for (i, k) in sx.marks.enumerated() {
                    let px = x(k.position); if px < -4 || px > W + 4 { continue }
                    let col = k.accepted ? Color(hex: BreakLabWindow.colours[k.hit.rawValue]) : Color(hex: "#555a62")
                    var line = Path(); line.move(to: CGPoint(x: px, y: 0)); line.addLine(to: CGPoint(x: px, y: H))
                    cx.stroke(line, with: .color(col), style: StrokeStyle(lineWidth: i == st.mark ? 2.5 : 1.2, dash: k.accepted ? [] : [3, 3]))
                    if k.manual { var tri = Path(); tri.move(to: CGPoint(x: px - 5, y: 0)); tri.addLine(to: CGPoint(x: px + 5, y: 0)); tri.addLine(to: CGPoint(x: px, y: 7)); tri.closeSubpath(); cx.fill(tri, with: .color(col)) }
                    else { cx.fill(Path(ellipseIn: CGRect(x: px - 3, y: 1, width: 6, height: 6)), with: .color(col)) }
                }
            }
            .background(Color(hex: "#0b0c0e"))
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { v in
                let pos = { (xx: CGFloat) in Int((Double(st.off) + Double(xx / W) * span).rounded()) }
                if start == nil {
                    start = v.location; moved = false
                    var best = -1, bd: CGFloat = 7
                    for (i, k) in sx.marks.enumerated() { let dd = abs(CGFloat(Double(k.position - st.off) / span) * W - v.location.x); if dd < bd { bd = dd; best = i } }
                    if best >= 0 { st.mark = best; drag = best; st.undo.append(sx); st.redo = []; return }
                    let p = pos(v.location.x); st.mark = -1
                    if let i = sx.slices.firstIndex(where: { p >= $0.start && p < $0.end }) { st.sel = i; c.hitSlice(t, i, velocity127: 110) }
                    hold?.invalidate()
                    hold = Timer.scheduledTimer(withTimeInterval: 0.6, repeats: false) { _ in MainActor.assumeIsolated { if !moved { addMark(p) } } }
                    return
                }
                if abs(v.location.x - (start?.x ?? 0)) > 4 { moved = true; hold?.invalidate() }
                if drag >= 0, drag < sx.marks.count {
                    var s = sx; s.marks[drag].position = min(max(0, pos(v.location.x)), max(0, n - 8)); s.marks[drag].manual = true
                    c.edit { $0.tracks[t].slices = s }
                }
            }.onEnded { _ in
                hold?.invalidate(); start = nil
                if drag >= 0 {
                    var s = sx; let mk = s.marks[safe: drag]; s.marks.sort { $0.position < $1.position }
                    st.mark = mk.flatMap { k in s.marks.firstIndex { $0.position == k.position } } ?? -1
                    if !moved { _ = st.undo.popLast() } else if s.mode == .transient { s.makeSlices(frames: n, rate: smp.sampleRate) }
                    drag = -1; c.setSlices(t, s)
                }
            })
            .gesture(MagnificationGesture().onEnded { z in st.zoom = min(256, max(1, st.zoom * Double(z))); clamp(n) })
        }
        .clipShape(RoundedRectangle(cornerRadius: m.r(0.4)))
        .overlay(RoundedRectangle(cornerRadius: m.r(0.4)).stroke(Color(hex: "#2a2d32"), lineWidth: 1))
        .accessibilityLabel("Waveform with transient markers and slices")
    }
    private func clamp(_ n: Int) { let w = Double(n) / st.zoom; st.off = min(max(0, st.off), max(0, Int(Double(n) - w))) }
    private func addMark(_ p: Int) {
        st.undo.append(sx); st.redo = []
        var s = sx; SampleAnalysis.addMark(&s, at: p, sample: smp)
        st.mark = s.marks.firstIndex { $0.manual && abs($0.position - p) < 2 } ?? -1
        if s.mode == .transient { s.makeSlices(frames: smp.channels.first?.count ?? 0, rate: smp.sampleRate) }
        c.setSlices(t, s)
    }
}

struct BLZoomRow: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let t: Int
    let sx: SampleSlices
    let smp: DecodedSample
    @Binding var st: BLState
    var body: some View {
        let n = smp.channels.first?.count ?? 1, mk = sx.marks[safe: st.mark]
        FlowRow(gap: m.r(0.25), rowGap: m.r(0.25)) {   // .dmchain.blzoom
            Button("−") { st.zoom = max(1, st.zoom / 2); clamp(n) }.buttonStyle(HBStyle())
            Button("+") { st.zoom = min(256, st.zoom * 2); clamp(n) }.buttonStyle(HBStyle())
            Button("FIT") { st.zoom = 1; st.off = 0 }.buttonStyle(HBStyle())
            Slider(value: Binding(get: { let w = Double(n) / st.zoom; return Double(n) - w > 0 ? Double(st.off) / (Double(n) - w) : 0 },
                                  set: { let w = Double(n) / st.zoom; st.off = Int(($0 * (Double(n) - w)).rounded()) }), in: 0...1)
                .frame(minWidth: m.r(8)).flexGrow().accessibilityLabel("Scroll the waveform")   // web: <input type=range>
            Color(hex: "#3a3d43").frame(width: 1, height: m.r(1.9)).padding(.horizontal, m.r(0.2))
            Button("+ MARK") { let s = sx.slices[safe: st.sel]; let p = s.map { ($0.start + $0.end) / 2 } ?? Int(Double(st.off) + Double(n) / st.zoom / 2); addMark(p) }.buttonStyle(HBStyle())
            Button("DELETE") { guard st.mark >= 0 else { return }; snap(); var s = sx; s.marks.remove(at: st.mark); st.mark = -1; if s.mode == .transient { s.makeSlices(frames: n, rate: smp.sampleRate) }; c.setSlices(t, s) }
                .buttonStyle(HBStyle()).disabled(st.mark < 0).opacity(st.mark < 0 ? 0.5 : 1)
            Button(mk.map { $0.accepted ? "REJECT" : "ACCEPT" } ?? "REJECT") { guard st.mark >= 0 else { return }; snap(); var s = sx; s.marks[st.mark].accepted.toggle(); if s.mode == .transient { s.makeSlices(frames: n, rate: smp.sampleRate) }; c.setSlices(t, s) }
                .buttonStyle(HBStyle()).disabled(mk == nil).opacity(mk == nil ? 0.5 : 1)
            Button("ACCEPT ALL") { snap(); var s = sx; for i in s.marks.indices { s.marks[i].accepted = true }; if s.mode == .transient { s.makeSlices(frames: n, rate: smp.sampleRate) }; c.setSlices(t, s) }.buttonStyle(HBStyle())
            if let mk {
                PanelSelect(options: HitClass.allCases.map(\.name), selected: mk.hit.rawValue, label: "Hit type") { i in
                    snap(); var s = sx; let h = HitClass(rawValue: i) ?? .other; s.marks[st.mark].hit = h
                    let near = Int(smp.sampleRate * 0.01); if let j = s.slices.firstIndex(where: { abs($0.start - mk.position) < near }) { s.slices[j].hit = h }
                    c.setSlices(t, s)
                }
            }
        }
        .padding(.vertical, m.r(0.35))
    }
    private func clamp(_ n: Int) { let w = Double(n) / st.zoom; st.off = min(max(0, st.off), max(0, Int(Double(n) - w))) }
    private func snap() { st.undo.append(sx); if st.undo.count > 60 { st.undo.removeFirst() }; st.redo = [] }
    private func addMark(_ p: Int) {
        snap(); var s = sx; SampleAnalysis.addMark(&s, at: p, sample: smp)
        st.mark = s.marks.firstIndex { $0.manual && abs($0.position - p) < 2 } ?? -1
        if s.mode == .transient { s.makeSlices(frames: smp.channels.first?.count ?? 0, rate: smp.sampleRate) }
        c.setSlices(t, s)
    }
}

/// SLICE n — the selected slice's settings.
struct BLSliceRow: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let t: Int
    let sx: SampleSlices
    @Binding var st: BLState
    static let stutLens: [(Double, String)] = [(1.0 / 32, "1/128"), (1.0 / 16, "1/64"), (0.125, "1/32"), (0.25, "1/16"), (0.5, "1/8"), (1, "1/4")]
    var body: some View {
        FlowRow(gap: m.r(0.05), rowGap: m.r(0.3), alignment: .bottom) {
            if let s = sx.slices[safe: st.sel] {
                let set = { (f: (inout SliceSettings) -> Void) in var x = sx; f(&x.slices[st.sel]); c.setSlices(t, x) }
                ValueKnob(label: "Pitch", value: s.pitch, range: -24...24, defaultValue: 0, step: 1, bipolar: true, format: { ($0 > 0 ? "+" : "") + "\(Int($0.rounded())) st" }) { v in set { $0.pitch = v.rounded() } }
                ValueKnob(label: "Gain", value: s.gain, range: 0...2, defaultValue: 1, format: { $0 <= 0 ? "−∞" : String(format: "%.1f dB", 20 * log10($0)) }) { v in set { $0.gain = v } }
                ValueKnob(label: "Pan", value: s.pan, range: -1...1, defaultValue: 0, bipolar: true, format: { abs($0) < 0.03 ? "C" : ($0 < 0 ? "L" : "R") + "\(Int((abs($0) * 100).rounded()))" }) { v in set { $0.pan = abs(v) < 0.03 ? 0 : v } }
                ValueKnob(label: "Attack", value: s.attackMs, range: 0...50, defaultValue: 0, format: { $0 <= 0 ? "HARD" : String(format: "%.1f ms", $0) }) { v in set { $0.attackMs = (v * 2).rounded() / 2 } }
                ValueKnob(label: "Gate", value: s.gate, range: 0.02...1, defaultValue: 1, format: { $0 >= 0.995 ? "FULL" : Fmt.pct($0) }) { v in set { $0.gate = v } }
                ValueKnob(label: "Stretch", value: s.stretch, range: 0.25...4, defaultValue: 1, format: { String(format: "%.2f×", $0) }) { v in set { $0.stretch = (v * 100).rounded() / 100 } }
                ValueKnob(label: "Stutter", value: Double(s.stutter), range: 0...8, defaultValue: 0, step: 1, format: { Int($0.rounded()) > 0 ? "×\(Int($0.rounded()))" : "OFF" }) { v in set { $0.stutter = Int(v.rounded()) } }
                ValueKnob(label: "Stut len", value: Double(Self.stutLens.firstIndex { abs($0.0 - s.stutterBeats) < 1e-6 } ?? 2), range: 0...5, defaultValue: 2, step: 1,
                          format: { Self.stutLens[min(5, max(0, Int($0.rounded())))].1 }) { v in set { $0.stutterBeats = Self.stutLens[min(5, max(0, Int(v.rounded())))].0 } }
                ValueKnob(label: "Metalise", value: max(-0.02, s.metalise), range: -0.02...1, defaultValue: -0.02, format: { $0 < 0.005 ? "TRACK" : Fmt.pct($0) }) { v in set { $0.metalise = v < 0.005 ? -1 : v } }
                Button("REVERSE") { set { $0.reverse.toggle() } }.buttonStyle(HBStyle(led: .cyan, on: s.reverse))
                PanelSelect(options: HitClass.allCases.map(\.name), selected: s.hit.rawValue, label: "Slice type") { i in set { $0.hit = HitClass(rawValue: i) ?? .other } }
                Button("▶ AUDITION") { c.hitSlice(t, st.sel, velocity127: 110) }.buttonStyle(HBStyle())
            } else {
                PanelNote(text: "No slices yet — DETECT, then SLICE (or pick Equal / Beat / Bar / Grid).", maxWidth: nil)
            }
        }
        .padding(.top, m.r(0.95))
        .overlay(alignment: .topLeading) { TinyLabel(text: sx.slices.isEmpty ? "SLICE" : "SLICE \(st.sel + 1)").padding(.top, m.r(0.12)).padding(.leading, m.r(0.1)) }
        .overlay(alignment: .top) { Color(hex: "#2a2d32").frame(height: 1) }
        .padding(.vertical, m.r(0.35))
    }
}

struct BLPads: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let t: Int
    let sx: SampleSlices
    @Binding var st: BLState
    var body: some View {
        VStack(alignment: .leading, spacing: m.r(0.3)) {
            HStack(alignment: .firstTextBaseline, spacing: m.r(0.6)) {
                Text("SLICE PADS").font(.system(size: m.r(0.62), weight: .bold)).tracking(0.14 * m.r(0.62)).foregroundStyle(Color(hex: "#9a9ea6"))
                PanelNote(text: "Tap to play (higher = harder); with REC lit and the pattern playing, slices are recorded into the steps. Hold a pad, then tap a track number above to send that slice.", maxWidth: nil)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: m.r(4.2)), spacing: m.r(0.3))], spacing: m.r(0.3)) {
                ForEach(sx.slices.indices, id: \.self) { i in
                    let v = sx.slices[i], col = Color(hex: BreakLabWindow.colours[v.hit.rawValue])
                    GeometryReader { g in
                        VStack(alignment: .leading, spacing: m.r(0.1)) {
                            Text("\(i + 1)").font(.system(size: m.r(0.9), weight: .bold)).foregroundStyle(Color(hex: "#e8e9ec"))
                            Text(v.hit.name + (v.reverse ? " ◀" : "") + (v.stutter > 0 ? " ×\(v.stutter)" : "")).font(.system(size: m.r(0.55), weight: .semibold)).tracking(0.08 * m.r(0.55)).foregroundStyle(Color(hex: "#9a9ea6"))
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .padding(.vertical, m.r(0.35)).padding(.horizontal, m.r(0.4))
                        .background(RoundedRectangle(cornerRadius: m.r(0.35)).fill(Color(hex: i == st.sel ? "#2a2b20" : "#1b1c1f")))
                        .overlay(RoundedRectangle(cornerRadius: m.r(0.35)).stroke(Color(hex: i == st.sel ? "#ffd23d" : "#33363c"), lineWidth: 1))
                        .overlay(alignment: .leading) { col.frame(width: 4).clipShape(UnevenRoundedRectangle(topLeadingRadius: m.r(0.35), bottomLeadingRadius: m.r(0.35))) }
                        .contentShape(Rectangle())
                        .gesture(DragGesture(minimumDistance: 0).onChanged { d in
                            if st.sel != i || d.translation == .zero { st.sel = i; c.hitSlice(t, i, velocity127: 50 + 77 * min(1, max(0, 1 - d.startLocation.y / max(1, g.size.height)))) }
                        })
                    }
                    .frame(height: m.r(2.9))
                    .accessibilityLabel("Slice \(i + 1), \(v.hit.name)").accessibilityAddTraits(.isButton).accessibilityAction { c.hitSlice(t, i, velocity127: 100) }
                }
            }
        }
        .padding(.top, m.r(0.4))
    }
}

struct BLSendRow: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let t: Int
    let sx: SampleSlices
    let smp: DecodedSample
    @Binding var st: BLState
    var body: some View {
        FlowRow(gap: m.r(0.25), rowGap: m.r(0.25)) {   // .dmchain.blrow
            RowLabel("SEND")
            Button("TO STEPS") { c.slicesToLane(t) }.buttonStyle(HBStyle())
            Button("ACROSS TRACKS") { let n = min(sx.slices.count, c.trackCount); c.sendSlices(Array(0..<n), from: st.append ? -1 : t, source: t) }.buttonStyle(HBStyle())
            Button("SELECTED → NEXT TRACK") { c.sendSlices([st.sel], from: st.append ? -1 : min(t + 1, c.trackCount - 1), source: t) }.buttonStyle(HBStyle())
            Button(st.append ? "APPEND" : "REPLACE") { st.append.toggle() }.buttonStyle(HBStyle(led: .cyan, on: st.append))
            Button("BY TYPE → 4 LANES") { c.splitByClass(GrooveGenerator.base(sx, frames: smp.channels.first?.count ?? 0, rate: smp.sampleRate, projectTempo: c.project.tempo), source: t, announce: true) }.buttonStyle(HBStyle())
        }
        .padding(.vertical, m.r(0.35))
    }
}

struct BLGenerator: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let t: Int
    let sx: SampleSlices
    let smp: DecodedSample
    @Binding var st: BLState
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("GROOVE GENERATOR — NEW RHYTHMS FROM THIS BREAK'S OWN HITS").font(.system(size: m.r(0.62), weight: .bold)).tracking(0.14 * m.r(0.62)).foregroundStyle(Color(hex: "#9a9ea6"))
                .padding(.top, m.r(0.1)).padding(.bottom, m.r(0.3))
            FlowRow(gap: m.r(0.35), rowGap: m.r(0.35), alignment: .bottom) {
                ValueKnob(label: "Extreme", value: st.opt.extreme, range: 0...1, defaultValue: 0.45, format: Fmt.pct) { st.opt.extreme = $0 }
                ValueKnob(label: "Reverse %", value: st.opt.reverseChance, range: 0...1, defaultValue: 0, format: Fmt.pct) { st.opt.reverseChance = $0 < 0.01 ? 0 : $0 }
                ValueKnob(label: "Stutter %", value: st.opt.stutterChance, range: 0...1, defaultValue: 0, format: Fmt.pct) { st.opt.stutterChance = $0 < 0.01 ? 0 : $0 }
                Button("LOCK KICK") { st.opt.lockKick.toggle() }.buttonStyle(HBStyle(led: .cyan, on: st.opt.lockKick))
                Button("RANDOM SNARES") { st.opt.randomSnares.toggle() }.buttonStyle(HBStyle(led: .cyan, on: st.opt.randomSnares))
                Button("MUTATE GHOSTS") { st.opt.mutateGhosts.toggle() }.buttonStyle(HBStyle(led: .cyan, on: st.opt.mutateGhosts))
                Button(st.split ? "TO 4 LANES" : "TO THIS LANE") { st.split.toggle() }.buttonStyle(HBStyle(led: .cyan, on: st.split))
                Button("GENERATE 16") {
                    st.gen += 1
                    let base = GrooveGenerator.base(sx, frames: smp.channels.first?.count ?? 0, rate: smp.sampleRate, projectTempo: c.project.tempo)
                    st.bank = (0..<16).map { GrooveGenerator.variation(base, slices: sx.slices, seed: Double(st.gen * 977 + $0 * 131 + 7), index: $0, options: st.opt) }
                    st.vsel = -1
                }.buttonStyle(HBStyle(size: .normal, minWidth: 3.6, led: .red, on: true))
            }
            if !st.bank.isEmpty {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: m.r(0.3)), count: m.width <= 700 ? 4 : 8), spacing: m.r(0.3)) {   // .blbank
                    ForEach(st.bank.indices, id: \.self) { i in
                        Button {
                            st.vsel = i
                            if st.split { c.splitByClass(st.bank[i], source: t, announce: false) } else { c.applyVariation(st.bank[i], track: t) }
                        } label: {
                            VStack(alignment: .leading, spacing: m.r(0.2)) {
                                Text("\(i + 1)").font(.system(size: m.r(0.7), weight: .bold)).foregroundStyle(Color(hex: "#cfd3da"))
                                HStack(spacing: 1) { ForEach(0..<16, id: \.self) { k in RoundedRectangle(cornerRadius: 1).fill(st.bank[i][k].map { Color(hex: BreakLabWindow.colours[$0.hit.rawValue]) } ?? Color(hex: "#26282d")).frame(height: m.r(0.55)) } }
                            }
                            .padding(m.r(0.25))
                            .background(RoundedRectangle(cornerRadius: m.r(0.35)).fill(Color(hex: i == st.vsel ? "#24251c" : "#15161a")))
                            .overlay(RoundedRectangle(cornerRadius: m.r(0.35)).stroke(Color(hex: i == st.vsel ? "#ffd23d" : "#33363c"), lineWidth: 1))
                        }.buttonStyle(.plain).accessibilityLabel("Variation \(i + 1)")
                    }
                }
                .padding(.vertical, m.r(0.3))
                PanelNote(text: "Tap a variation to put it in pattern \(c.project.selectedPattern + 1). GENERATE again for 16 more — the break's groove is the starting point every time; Extreme decides how far they wander.", maxWidth: nil)
            }
        }
        .padding(.vertical, m.r(0.4)).padding(.horizontal, m.r(0.5))
        .overlay(RoundedRectangle(cornerRadius: m.r(0.4)).stroke(Color(hex: "#2a2d32"), lineWidth: 1))
        .padding(.vertical, m.r(0.4))
    }
}

struct BLRenderRow: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let t: Int
    @Binding var st: BLState
    @State private var midiURL: URL?
    @State private var label = "RESAMPLE TRACK → NEW SAMPLE"
    var body: some View {
        FlowRow(gap: m.r(0.25), rowGap: m.r(0.25)) {
            RowLabel("RENDER")
            Button(label) { resample() }.buttonStyle(HBStyle(led: .cyan)).disabled(st.busy)
            Button("EXPORT MIDI") { midiURL = c.exportMIDIFile() }.buttonStyle(HBStyle())
            Button("EXPORT WAV…") { c.window = .export }.buttonStyle(HBStyle())
        }
        .padding(.vertical, m.r(0.35))
        .sheet(isPresented: Binding(get: { midiURL != nil }, set: { if !$0 { midiURL = nil } })) { if let u = midiURL { FileSaver(urls: [u]) { c.toast($0); midiURL = nil } } }
    }
    private func resample() {
        st.busy = true; label = "RENDERING…"
        Task { let r = await c.resampleTrack(t); st.busy = false; label = "RESAMPLE TRACK → NEW SAMPLE"; c.toast(r); st = BLState() }
    }
}
