// Vektur Drum — the SLICER window (web/src/slicer-panel.js renderSlicer) with METALISE (glitch-panel.js renderMetalise):
// ON, the PATTERNS row, the dials, the program grid and action palette, PERMUTE's source, the generators, the HOLD pads,
// and the Slicer's modulation. Program edits go to the engine with the existing setSlice command.
import SwiftUI
import VekturDrumCore

struct SlicerWindow: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    @State private var sel = 0
    static let actionColour: [String] = ["#e9e8df", "#3fd7ff", "#ffb43c", "#ff5ad2", "#ff7a4e", "#ff7a4e", "#b48cff", "#b48cff", "#9aa0a8", "#6dff8a", "#ffe14e", "#7ab8ff"]
    var body: some View {
        let on = c.value("sl.on") > 0.5, n = c.slicerCount, prog = c.project.slicer
        let s = min(sel, max(0, n - 1))
        ModalSheet(c: c, title: "SLICER", width: 64, onClose: { c.set("sl.hold", 0); c.window = nil }, titleSize: 1.1, pad: (0.6, 0.8),
                   accessory: AnyView(Button(on ? "ON" : "OFF") { c.set("sl.on", on ? 0 : 1) }.buttonStyle(HBStyle(size: .normal, minWidth: 3.6, led: .red, on: on)).accessibilityLabel("Slicer on or off"))) {
            VStack(alignment: .leading, spacing: 0) {
                SlicerPatterns(c: c).padding(.top, m.r(0.1)).padding(.bottom, m.r(0.5))
                FlowRow(gap: m.r(0.05), rowGap: m.r(0.1), alignment: .center) {   // .slknobs
                    ParamSelectCell(c: c, key: "sl.div", label: "Slice", cellWidth: 3.4)
                    ParamSelectCell(c: c, key: "sl.bars", label: "Cycle", options: ["1 bar", "2 bars"], cellWidth: 3.4)
                    ParamKnob(c: c, key: "sl.mix", label: "Mix", format: Fmt.pct, cellWidth: 3.4)
                    ParamKnob(c: c, key: "sl.density", label: "Density", format: Fmt.pct, cellWidth: 3.4)
                    ParamKnob(c: c, key: "sl.evolve", label: "Evolve", format: Fmt.pct, cellWidth: 3.4)
                    ParamKnob(c: c, key: "sl.seed", label: "Seed", cellWidth: 3.4)
                    ParamSelectCell(c: c, key: "sl.stutter", label: "Stutter", cellWidth: 3.4)
                    MetaliseBox(c: c)
                    ParamKnob(c: c, key: "sl.tape", label: "Tape", cellWidth: 3.4)
                    ParamKnob(c: c, key: "sl.pitch", label: "Pitch", cellWidth: 3.4)
                    ParamKnob(c: c, key: "sl.speed", label: "Speed", cellWidth: 3.4)
                }
                SlicerHeading(text: "Program — \(n) slices of \(DrumLists.slicerDivisions[safe: Int(c.value("sl.div").rounded())] ?? "") over \(Int(c.value("sl.bars").rounded()) + 1) bar\(c.value("sl.bars") > 0.5 ? "s" : "")")
                SlicerGrid(c: c, n: n, sel: s, prog: prog) { sel = $0 }
                FlowRow(gap: m.r(0.25), rowGap: m.r(0.25)) {   // .slpal
                    ForEach(SlicerAction.allCases, id: \.rawValue) { a in
                        Button { c.setSlicerAction(slot: s, a, count: n); if a != .permute { sel = (s + 1) % max(1, n) } } label: {
                            Text(a.name.uppercased()).foregroundStyle(Color(hex: a == .thru ? "#d9d6cd" : Self.actionColour[a.rawValue]))
                        }
                        .buttonStyle(HBStyle(led: .amber, on: prog[safe: s]?.action == a))
                    }
                }
                .padding(.top, m.r(0.45))
                if prog[safe: s]?.action == .permute {
                    FlowRow(gap: m.r(0.2), rowGap: m.r(0.2)) {   // .slperm
                        Text("SLICE \(s + 1) PLAYS").font(PanelFont.ui(m.r(0.5), 400)).tracking(0.12 * m.r(0.5)).foregroundStyle(Color(hex: "#9a9ea6"))
                        ForEach(0..<n, id: \.self) { j in
                            Button("\(j + 1)") { c.setSlicerSlot(s, SlicerSlot(action: .permute, source: j)) }.buttonStyle(HBStyle(led: .amber, on: prog[safe: s]?.source == j))
                        }
                    }
                    .padding(.top, m.r(0.4))
                    HelpText(text: "An earlier slice plays from this cycle; the same or a later one from the cycle before.", size: 0.66)
                }
                SlicerTwo(c: c, n: n)
                SlicerHeading(text: "Modulate — drag a source onto any Slicer dial")
                FlowRow(gap: m.r(0.35), rowGap: m.r(0.35)) {
                    ForEach(0..<5, id: \.self) { ModChipButton(c: c, source: $0) }
                    Button("MOD MATRIX…") { c.modGroup = "Slicer"; c.window = .mod }.buttonStyle(HBStyle())
                }
                SlicerWires(c: c).padding(.top, m.r(0.35))
                HelpText(text: "Ideas: LFO (synced 1 bar) → Density for slicing that breathes; Chaos → Evolve for programs that never settle; Env follower (kick) → Mix so the kick pushes the slicer in; LFO → Pitch for tape-warble; LFO S&H → Seed for a new variation every cycle.", size: 0.66)
                    .padding(.top, -m.r(0.25))
            }
        }
    }
}

/// .slsheet h4: .74rem, letter-spacing .06em, a 3px LED bar left.
struct SlicerHeading: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let text: String
    var body: some View {
        Text(text).font(PanelFont.ui(m.r(0.74), 700)).tracking(0.06 * m.r(0.74)).foregroundStyle(WinStyle.text)
            .padding(.leading, m.r(0.45)).overlay(alignment: .leading) { th.led.frame(width: 3) }
            .padding(.top, m.r(0.55)).padding(.bottom, m.r(0.3))
    }
}

/// .slpats — PATTERNS: each of the 8 follows ON (SONG), or is always ON / OFF; lit = sliced.
struct SlicerPatterns: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        let on = c.value("sl.on") > 0.5
        FlowRow(gap: m.r(0.3), rowGap: m.r(0.3)) {
            Text("PATTERNS").font(PanelFont.ui(m.r(0.5), 400)).tracking(0.12 * m.r(0.5)).foregroundStyle(Color(hex: "#9a9ea6")).padding(.trailing, m.r(0.3))
            ForEach(0..<TrackLimits.patterns, id: \.self) { i in
                let v = c.project.patterns[i].slicer, live = v == true || (v == nil && on), cur = i == c.project.selectedPattern
                Button { c.cyclePatternSlicer(i) } label: {
                    VStack(spacing: 0) {
                        Text("\(i + 1)")
                        Text(v == nil ? "SONG" : v! ? "ON" : "OFF").font(PanelFont.ui(m.r(0.45), 700)).tracking(0.1 * m.r(0.45)).foregroundStyle(v != nil ? Color(hex: "#3dd6ff") : Color(hex: "#d9d6cd").opacity(0.75))
                    }
                }
                .buttonStyle(HBStyle(minWidth: 2.6, paddingX: 0.3, led: .amber, on: live))
                .overlay { if cur { RoundedRectangle(cornerRadius: m.r(0.32)).stroke(Color(hex: "#3dd6ff"), lineWidth: 1).padding(-2) } }
                .accessibilityLabel("Pattern \(i + 1): " + (v == nil ? "follows the Slicer switch" : v! ? "always sliced" : "never sliced"))
            }
            PanelNote(text: "Lit = sliced. SONG follows ON / OFF above.", maxWidth: nil)
        }
    }
}

/// .slgrid — the program: up to 16 per row, the number small, the action short in its colour; the playing slice lit.
struct SlicerGrid: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    let n: Int
    let sel: Int
    let prog: [SlicerSlot]
    let select: (Int) -> Void
    var body: some View {
        let cols = m.width <= 640 ? 8 : min(n, 16), rows = (n + cols - 1) / max(1, cols)
        VStack(spacing: m.r(0.22)) {
            ForEach(0..<rows, id: \.self) { r in
                HStack(spacing: m.r(0.22)) {
                    ForEach(0..<cols, id: \.self) { col in
                        let i = r * cols + col
                        if i < n { cell(i) } else { Color.clear.frame(maxWidth: .infinity, minHeight: m.r(2.6)) }
                    }
                }
            }
        }
    }
    private func cell(_ i: Int) -> some View {
        let a = prog[safe: i]?.action ?? .thru, now = c.slicerLive == i, play = now && c.slicerLiveAction > 0
        let beat = i % (n > 16 ? 8 : 4) == 0
        return Button { select(i) } label: {
            VStack(spacing: m.r(0.05)) {
                Text("\(i + 1)").font(PanelFont.ui(m.r(0.5), 400)).opacity(0.45)
                Text(a.short + (a == .permute ? " \((prog[safe: i]?.source ?? 0) + 1)" : "")).font(PanelFont.ui(m.r(0.6), 700)).tracking(0.04 * m.r(0.6))
                    .foregroundStyle(Color(hex: SlicerWindow.actionColour[a.rawValue])).opacity(a == .thru ? 0.35 : 1)
            }
            .foregroundStyle(WinStyle.text)
            .frame(maxWidth: .infinity, minHeight: m.r(2.6))
            .padding(.vertical, m.r(0.3))
            .background(RoundedRectangle(cornerRadius: m.r(0.35)).fill(Color(hex: play ? "#3a2a10" : now ? "#2b2f36" : "#15171a")))
            .overlay(RoundedRectangle(cornerRadius: m.r(0.35)).stroke(WinStyle.line, lineWidth: 1))
            .overlay(alignment: .leading) { if beat { Color(hex: "#555555").frame(width: 2).padding(.vertical, 1) } }
            .overlay { if i == sel { RoundedRectangle(cornerRadius: m.r(0.35)).stroke(th.led, lineWidth: 2).padding(1) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Slice \(i + 1): \(a.name)")
    }
}

/// .sltwo — Generate (styles and edits) beside Hold (momentary pads).
struct SlicerTwo: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let n: Int
    var body: some View {
        let gen = VStack(alignment: .leading, spacing: 0) {
            SlicerHeading(text: "Generate")
            FlowRow(gap: m.r(0.4), rowGap: m.r(0.4)) {
                ForEach([("SUBTLE", "subtle"), ("JUNGLE", "jungle"), ("GLITCH", "glitch"), ("TAPE", "tape"), ("CHAOS", "chaos")], id: \.1) { l, st in
                    Button(l) { c.slicerGenerate(st) }.buttonStyle(HBStyle())
                }
                Button("◀ SHIFT") { c.slicerRotate(-1) }.buttonStyle(HBStyle())
                Button("SHIFT ▶") { c.slicerRotate(1) }.buttonStyle(HBStyle())
                Button("MIRROR") { c.slicerMirror() }.buttonStyle(HBStyle())
                Button("NEW SEED") { c.set("sl.seed", Double(Int.random(in: 0..<100))) }.buttonStyle(HBStyle())
                Button("CLEAR") { c.setSlicerProgram(SlicerSlot.clearProgram) }.buttonStyle(HBStyle())
            }
            .padding(.vertical, m.r(0.2))
        }
        let hold = VStack(alignment: .leading, spacing: 0) {
            SlicerHeading(text: "Hold — momentary, overrides the program")
            let names = DrumLists.slicerHold
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: m.r(0.25)), count: 3), spacing: m.r(0.25)) {
                ForEach(1..<names.count, id: \.self) { i in HoldPad(c: c, index: i, name: names[i]).frame(height: m.r(3.6)) }
            }
        }
        if m.width <= 640 { VStack(alignment: .leading, spacing: 0) { gen; hold } }
        else { HStack(alignment: .top, spacing: m.r(0.6)) { gen.frame(maxWidth: .infinity, alignment: .leading); hold.frame(maxWidth: .infinity, alignment: .leading) } }
    }
}

/// .slpad — a hold pad: down = sl.hold i (and the Slicer on), up = 0.
struct HoldPad: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    let index: Int
    let name: String
    @State private var down = false
    var body: some View {
        let r = m.r(0.55), fs = m.r(0.62)
        ZStack {
            RoundedRectangle(cornerRadius: r).fill(RadialGradient(stops: [.init(color: Color(hex: "#3b3d40"), location: 0), .init(color: Color(hex: "#26282a"), location: 0.45), .init(color: Color(hex: "#1d1e20"), location: 1)],
                                                                center: UnitPoint(x: 0.5, y: 0), startRadius: 0, endRadius: m.r(8)))
            VStack { RoundedRectangle(cornerRadius: m.r(0.11)).fill(down ? th.led : Color(hex: "#2b2015")).frame(height: m.r(0.22)).padding(.horizontal, 30).padding(.top, m.r(0.45)); Spacer() }
            Text("\(index)").font(PanelFont.ui(fs, 700)).tracking(0.08 * fs).foregroundStyle(Color(hex: "#8f939a")).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).padding(.leading, m.r(0.45)).padding(.top, m.r(0.4))
            Text(name.uppercased()).font(PanelFont.ui(fs, 700)).tracking(0.16 * fs).foregroundStyle(Color(hex: "#bdb9b0")).frame(maxHeight: .infinity, alignment: .bottom).padding(.bottom, m.r(0.45))
        }
        .overlay(RoundedRectangle(cornerRadius: r).stroke(Color(hex: "#070708"), lineWidth: 1))
        .shadow(color: .black.opacity(0.75), radius: down ? 1 : 3, y: down ? 1 : 4)
        .offset(y: down ? 2 : 0)
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 0)
            .onChanged { _ in if !down { down = true; if c.value("sl.on") < 0.5 { c.set("sl.on", 1) }; c.set("sl.hold", Double(index)) } }
            .onEnded { _ in down = false; c.set("sl.hold", 0) })
        .accessibilityLabel("Hold \(name)")
    }
}

/// .slmods — the Slicer's wires as removable chips.
struct SlicerWires: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        FlowRow(gap: m.r(0.3), rowGap: m.r(0.3)) {
            ForEach(slicerWireIndices, id: \.self) { i in SlicerWireChip(c: c, index: i) }
        }
    }
}

/// .slmetal — METALISE: ON / OFF (hold it to automate), its chance, an old-glitch note, Mix · Grain · Stretch.
struct MetaliseBox: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        VStack(alignment: .leading, spacing: m.r(0.15)) {
            MetaliseHeader(c: c)
            MetaliseOldNote(c: c)
            MetaliseKnobs(c: c)
        }
        .padding(.top, m.r(0.25)).padding(.horizontal, m.r(0.35)).padding(.bottom, m.r(0.2))
        .background(RoundedRectangle(cornerRadius: m.r(0.45)).fill(Color.black.opacity(0.45)))
        .overlay(RoundedRectangle(cornerRadius: m.r(0.45)).stroke(Color.white.opacity(0.07), lineWidth: 1))
        .padding(.horizontal, m.r(0.2))
    }
}
struct MetaliseHeader: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    @State private var holdTimer: Timer?
    @State private var held = false
    var body: some View {
        let metal: Bool = c.value("gl.on") > 0.5 && Int(c.value("gl.mode").rounded()) == 2
        HStack(spacing: m.r(0.35)) {
            Text("METALISE").font(.system(size: m.r(0.68), weight: .heavy)).tracking(0.18 * m.r(0.68)).foregroundStyle(th.print).brightness(0.12)
                .padding(.leading, m.r(0.4)).overlay(alignment: .leading) { th.led.frame(width: 3) }
            Button(metal ? "ON" : "OFF") { press(metal) }
                .buttonStyle(HBStyle(led: .red, on: metal))
                .overlay { if c.isWired("gl.on") { RoundedRectangle(cornerRadius: m.r(0.32)).stroke(Color(hex: "#3fd7ff", opacity: 0.6), lineWidth: 2).padding(-2) } }
                .simultaneousGesture(holdGesture)
                .accessibilityLabel("Metalise on or off — touch and hold to automate it")
            MetaliseChance(c: c)
        }
    }
    private func press(_ metal: Bool) {
        if held { held = false; return }
        if metal { c.set("gl.on", 0) } else { c.set("gl.mode", 2); c.set("gl.on", 1) }
    }
    private var holdGesture: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .named("root")).onChanged { g in
            guard holdTimer == nil else { return }
            let p = g.location
            holdTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { _ in MainActor.assumeIsolated { held = true; c.modPopup = ModPopupRequest(key: "gl.on", point: p) } }
        }.onEnded { _ in holdTimer?.invalidate(); holdTimer = nil }
    }
}
struct MetaliseChance: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    var body: some View {
        let chance: Double = c.value("gl.chance")
        let divs: [String] = ParameterSpec.spec(forKey: "gl.chdiv")?.choices ?? []
        let div: String = divs[safe: Int(c.value("gl.chdiv").rounded())] ?? ""
        if chance > 0 {
            Text(String(Int((chance * 100).rounded())) + "% / " + div).font(.system(size: m.r(0.55), weight: .bold, design: .monospaced)).foregroundStyle(th.cyan)
        }
    }
}
struct MetaliseOldNote: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        let mode: Int = Int(c.value("gl.mode").rounded())
        let modes: [String] = ParameterSpec.spec(forKey: "gl.mode")?.choices ?? []
        if c.value("gl.on") > 0.5 && mode != 2 {
            Text("this kit plays the old " + (modes[safe: mode] ?? "").uppercased() + " glitch — tap OFF→ON for Metalise")
                .font(PanelFont.ui(m.r(0.55), 400)).foregroundStyle(Color(hex: "#c98a4a")).frame(maxWidth: m.r(11), alignment: .leading)
        }
    }
}
struct MetaliseKnobs: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        HStack(alignment: .top, spacing: m.r(0.05)) {
            ParamKnob(c: c, key: "gl.mix", label: "Mix", format: Fmt.pct, cellWidth: 3.4)
            ParamKnob(c: c, key: "gl.size", label: "Grain", format: Self.grain, cellWidth: 3.4)
            ParamKnob(c: c, key: "gl.speed", label: "Stretch", format: Self.stretch, cellWidth: 3.4)
        }
    }
    static func grain(_ t: Double) -> String { String(format: t < 0.4 ? "%.1f ms" : "%.0f ms", 3 * pow(20, t)) }
    static func stretch(_ t: Double) -> String { "\(Int(((0.25 + 0.75 * t) * 100).rounded()))%" }
}

extension DrumController {
    /// web slicerCount: slices in the cycle (1 or 2 bars ÷ the slice length), at most 32.
    var slicerCount: Int {
        let bars = Int(value("sl.bars").rounded()) + 1, beats = DrumLists.slicerDivisionBeats[safe: Int(value("sl.div").rounded())] ?? 0.25
        return min(DrumLists.slicerSlots, Int((Double(bars * 4) / beats).rounded()))
    }
    func setSlicerSlot(_ i: Int, _ s: SlicerSlot) {
        edit { p in if p.slicer.count < DrumLists.slicerSlots { p.slicer = SlicerSlot.clearProgram }; p.slicer[i] = s }
        engine.send(.setSlice(slot: i, s))
    }
    func setSlicerAction(slot i: Int, _ a: SlicerAction, count n: Int) {
        var s = project.slicer[safe: i] ?? SlicerSlot(action: .thru, source: i)
        s.action = a
        if a == .permute && s.source == i { s.source = (i + n - 1) % max(1, n) }
        setSlicerSlot(i, s)
    }
    func setSlicerProgram(_ prog: [SlicerSlot]) {
        edit { $0.slicer = prog }
        for (i, s) in prog.enumerated() { engine.send(.setSlice(slot: i, s)) }
    }
    func slicerRotate(_ d: Int) {
        let n = slicerCount; var prog = project.slicer; let c0 = Array(prog.prefix(n))
        for i in 0..<n { prog[(i + d + n) % n] = c0[i] }
        setSlicerProgram(prog)
    }
    func slicerMirror() {
        let n = slicerCount; var prog = project.slicer; let c0 = Array(prog.prefix(n))
        for i in 0..<n { prog[i] = c0[n - 1 - i] }
        setSlicerProgram(prog)
    }
    /// web slicerGenerate: a style's weighted actions; bar ends get more.
    func slicerGenerate(_ style: String) {
        let n = slicerCount, per = max(1, Int((Double(n) / Double(Int(value("sl.bars").rounded()) + 1)).rounded()))
        let W: [Double] = ["subtle": [14, 2, 1, 1, 0, 0, 0, 0, 0, 2, 0, 1], "jungle": [5, 3, 3, 2, 0, 0, 1, 0, 1, 5, 0, 2], "glitch": [3, 1, 5, 1, 0, 0, 2, 2, 3, 2, 3, 1],
                          "tape": [8, 0, 0, 1, 1, 0, 1, 3, 0, 1, 1, 1], "chaos": [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]][style] ?? []
        func pick() -> Int { var r = Double.random(in: 0..<W.reduce(0, +)); for (i, w) in W.enumerated() { r -= w; if r < 0 { return i } }; return 0 }
        var prog: [SlicerSlot] = []
        for i in 0..<DrumLists.slicerSlots {
            let endBar = (i % per) >= per - max(1, per >> 2)
            var a = pick()
            if style == "subtle" && !endBar { a = Double.random(in: 0..<1) < 0.85 ? 0 : a }
            if style == "tape" && i % per == per - 1 { a = 4 }
            if style == "tape" && i % per == 0 && Double.random(in: 0..<1) < 0.5 { a = 5 }
            if a == 4 && style != "tape" && style != "chaos" { a = 0 }
            prog.append(SlicerSlot(action: SlicerAction(rawValue: a) ?? .thru, source: a == 9 ? Int.random(in: 0..<max(1, n)) : i))
        }
        if style == "jungle" { set("sl.div", 1); set("sl.stutter", 2) }
        if style == "glitch" { set("sl.div", 0) }
        toast("Slicer: \(style) program"); setSlicerProgram(prog)
    }
    /// A pattern's own Slicer: SONG → ON → OFF → SONG.
    func cyclePatternSlicer(_ p: Int) {
        let v = project.patterns[p].slicer
        let n: Bool? = v == nil ? true : v! ? false : nil
        edit { $0.patterns[p].slicer = n }; engine.send(.setPatternSlicer(pattern: p, n))
    }
}

extension SlicerWires {
    var slicerWireIndices: [Int] { c.project.wires.indices.filter { c.project.wires[$0].param.hasPrefix("sl.") } }
}
struct SlicerWireChip: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let index: Int
    var body: some View {
        let w = c.project.wires[index]
        let col: Color = ModColors.color(w.source.rawValue)
        let pct: Int = Int((w.amount * 100).rounded())
        let name: String = ParameterSpec.spec(forKey: w.param)?.name ?? w.param
        let label: String = w.source.name + " → " + name + " " + (w.amount > 0 ? "+" : "") + String(pct) + "%"
        HStack(spacing: m.r(0.35)) {
            Text(label)
            Button("✕") { c.deleteWire(index) }.buttonStyle(.plain).accessibilityLabel("Delete wire")
        }
        .font(PanelFont.ui(m.r(0.66), 500)).foregroundStyle(col)
        .padding(.vertical, m.r(0.12)).padding(.leading, m.r(0.55)).padding(.trailing, m.r(0.2))
        .overlay(Capsule().stroke(col, lineWidth: 1))
    }
}
