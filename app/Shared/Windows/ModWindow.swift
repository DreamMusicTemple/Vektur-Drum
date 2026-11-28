// Vektur Drum — the MOD window (web/src/mod-panel.js modModal / renderMod): a floating drawer over the panel (which
// stays playable) — move it by its bar, resize from the corner, A− / A+, dock left / right, fold to the chips — with the
// sources, their settings, the wire list and every destination. Remembered on this device.
import SwiftUI
import VekturDrumCore

struct ModWindow: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    @AppStorage("vekturdrum.modwin.mode") private var mode = "float"     // float · left · right
    @AppStorage("vekturdrum.modwin.x") private var gx: Double = -1
    @AppStorage("vekturdrum.modwin.y") private var gy: Double = 64
    @AppStorage("vekturdrum.modwin.w") private var gw: Double = 380
    @AppStorage("vekturdrum.modwin.h") private var gh: Double = 560
    @AppStorage("vekturdrum.modwin.scale") private var scale: Double = 1
    @AppStorage("vekturdrum.modwin.min") private var mini = false
    @State private var drag0: CGPoint?
    var body: some View {
        GeometryReader { g in
            let vw = g.size.width, vh = g.size.height, sc = min(1.6, max(0.7, scale))
            let w = min(max(gw, 250), vw), h = min(max(gh, 160), vh)
            let x = mode == "float" ? min(max(gx < 0 ? vw - w - 16 : gx, -w + 80), vw - 80) : (mode == "left" ? 0 : vw - min(w, vw))
            let y = mode == "float" ? min(max(gy, 0), vh - 40) : 0
            let peek = c.modPick >= 0 && mode != "float"
            VStack(spacing: 0) {
                bar(sc).gesture(DragGesture().onChanged { v in
                    guard mode == "float" else { return }
                    if drag0 == nil { drag0 = CGPoint(x: x, y: y) }
                    gx = drag0!.x + v.translation.width; gy = drag0!.y + v.translation.height
                }.onEnded { _ in drag0 = nil })
                if !mini {
                    ScrollView(.vertical) {
                        ModSheet(c: c).padding(.vertical, m.r(0.5)).padding(.horizontal, m.r(0.7)).frame(maxWidth: .infinity, alignment: .leading)
                            .environment(\.panel, PanelMetrics(width: m.width, scale: m.scale * sc))
                    }
                    .background(th.chassis[2])
                }
            }
            .frame(width: w, height: mode == "float" ? (mini ? nil : h) : vh)
            .background(th.chassis[2])
            .clipShape(RoundedRectangle(cornerRadius: mode == "float" ? m.r(0.55) : 0))
            .overlay(RoundedRectangle(cornerRadius: mode == "float" ? m.r(0.55) : 0).stroke(Color(hex: "#3a3d44"), lineWidth: mode == "float" ? 1 : 0))
            .overlay(alignment: mode == "right" ? .bottomLeading : .bottomTrailing) {
                if !mini { ResizeGrip(flip: mode == "right").gesture(DragGesture().onChanged { v in
                    if drag0 == nil { drag0 = CGPoint(x: w, y: h) }
                    gw = drag0!.x + (mode == "right" ? -1 : 1) * v.translation.width
                    if mode == "float" { gh = drag0!.y + v.translation.height }
                }.onEnded { _ in drag0 = nil }) }
            }
            .shadow(color: .black.opacity(0.67), radius: 20, x: mode == "right" ? -8 : 0, y: mode == "float" ? 12 : 0)
            .offset(x: x + (peek ? (mode == "left" ? -(w - m.r(2.4)) : w - m.r(2.4)) : 0), y: y)
            .opacity(peek ? 0.85 : 1)
        }
    }
    /// .modbar: MODULATION, the chips when folded, A− A+ ◧ ❐ ◨ — ✕.
    private func bar(_ sc: Double) -> some View {
        HStack(spacing: m.r(0.2) * sc) {
            Text("MODULATION").font(PanelFont.ui(m.r(0.62) * sc, 700)).tracking(0.18 * m.r(0.62) * sc).foregroundStyle(th.strip[3])
            if mini { HStack(spacing: m.r(0.2)) { ForEach(0..<5, id: \.self) { ModChipButton(c: c, source: $0, compact: true) } } }
            Spacer(minLength: 0)
            Button("A−") { scale = ((scale - 0.1) * 10).rounded() / 10 }.buttonStyle(ModBtn())
            Button("A+") { scale = ((scale + 0.1) * 10).rounded() / 10 }.buttonStyle(ModBtn())
            Button("◧") { mode = "left"; mini = false }.buttonStyle(ModBtn()).accessibilityLabel("Dock to the left edge")
            Button("❐") { mode = "float" }.buttonStyle(ModBtn()).accessibilityLabel("Float")
            Button("◨") { mode = "right"; mini = false }.buttonStyle(ModBtn()).accessibilityLabel("Dock to the right edge")
            Button("—") { mini.toggle(); if mini { mode = "float" } }.buttonStyle(ModBtn()).accessibilityLabel("Fold down to the source chips")
            Button("✕") { c.modPick = -1; c.window = nil }.buttonStyle(ModBtn()).accessibilityLabel("Close")
        }
        .padding(.vertical, m.r(0.3)).padding(.leading, m.r(0.6)).padding(.trailing, m.r(0.35))
        .background(LinearGradient(colors: [th.strip[0], th.strip[2]], startPoint: .top, endPoint: .bottom))
    }
}

struct ResizeGrip: View {
    @Environment(\.panel) private var m
    var flip = false
    var body: some View {
        Canvas { ctx, s in
            for (a, b) in [(0.5, 0.58), (0.7, 0.78)] {
                var p = Path(); p.move(to: CGPoint(x: s.width * a, y: s.height)); p.addLine(to: CGPoint(x: s.width, y: s.height * a))
                ctx.stroke(p, with: .color(Color(hex: "#6a6f78")), lineWidth: s.width * (b - a) * 0.7)
            }
        }
        .frame(width: m.r(1.3), height: m.r(1.3)).scaleEffect(x: flip ? -1 : 1).contentShape(Rectangle())
    }
}

/// The drawer's content (renderMod).
struct ModSheet: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if c.modPick >= 0 {
                Text("\(DrumLists.modSources[c.modPick]) picked — tap any dial or destination (tap the chip again to cancel)")
                    .font(PanelFont.ui(m.r(0.72), 600)).foregroundStyle(.black)
                    .padding(.vertical, m.r(0.35)).padding(.horizontal, m.r(0.5)).frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: m.r(0.4)).fill(ModColors.color(c.modPick)))
                    .padding(.top, m.r(0.2)).padding(.bottom, m.r(0.4))
            }
            SheetHeading(text: "Sources — drag onto any dial")
            FlowRow(gap: m.r(0.35), rowGap: m.r(0.35)) { ForEach(0..<5, id: \.self) { ModChipButton(c: c, source: $0) } }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: m.r(15)), spacing: m.r(0.4))], alignment: .leading, spacing: m.r(0.4)) {   // .modset
                ModBox(title: "ENV FOLLOWER") {
                    ParamSelect(c: c, key: "env.src", options: Array((ParameterSpec.spec(forKey: "env.src")?.choices ?? ["Master"]).prefix(c.trackCount + 1)), fontSize: 0.66)
                    HStack(alignment: .top, spacing: m.r(0.05)) {
                        ParamKnob(c: c, key: "env.att", label: "Attack"); ParamKnob(c: c, key: "env.rel", label: "Release"); ParamKnob(c: c, key: "env.gain", label: "Gain")
                    }
                }
                ModBox(title: "CHAOS") {
                    HStack(spacing: m.r(0.25)) {
                        ForEach(Array((ParameterSpec.spec(forKey: "ch.mode")?.choices ?? []).enumerated()), id: \.offset) { i, n in
                            Button(n.uppercased()) { c.set("ch.mode", Double(i)) }.buttonStyle(HBStyle(led: .cyan, on: Int(c.value("ch.mode").rounded()) == i))
                        }
                    }
                    ParamKnob(c: c, key: "ch.rate", label: "Rate")
                }
                ModBox(title: "LFO 1–3") {
                    ForEach(1...3, id: \.self) { i in
                        let k = "lfo\(i)", sync = c.value(k + ".sync") > 0.5
                        HStack(spacing: m.r(0.3)) {   // .modlfo
                            ModChipButton(c: c, source: i - 1, compact: true)
                            ParamSelect(c: c, key: k + ".shape", fontSize: 0.66)
                            Button("SYNC") { c.set(k + ".sync", sync ? 0 : 1) }.buttonStyle(HBStyle(led: .cyan, on: sync))
                            if sync { ParamSelect(c: c, key: k + ".div", fontSize: 0.66) } else { ParamKnob(c: c, key: k + ".rate", label: "Rate", cellWidth: 3.8, knobSize: 1.8) }
                        }
                        .padding(.vertical, m.r(0.1))
                        if Int(c.value(k + ".shape").rounded()) == LFOShapes.drawShape { LfoDrawEditor(c: c, lfo: i - 1, width: 220, height: 52) }
                    }
                }
            }
            .padding(.top, m.r(0.4))
            HelpText(text: "Each LFO also still moves its own glitch target with its Depth (in the LFO row). Env follower: the level of the master or one track. Chaos: Lorenz (smooth, never repeats), Logistic (stepped jumps), Drift (slow random walk).")
            SheetHeading(text: "Wires — \(c.project.wires.count) of \(DrumLists.modWires)")
            if c.project.wires.isEmpty { HelpText(text: "No wires yet. Drag a source onto a dial.").padding(.top, -m.r(0.5)) }
            VStack(spacing: m.r(0.3)) {
                ForEach(Array(c.project.wires.enumerated()), id: \.offset) { i, w in
                    let col = ModColors.color(w.source.rawValue)
                    HStack(spacing: m.r(0.35)) {   // .modwire
                        PanelSelect(options: DrumLists.modSources, selected: w.source.rawValue, fontSize: 0.66, label: "Wire source") { c.setWire(i, source: $0) }
                        Text("→").opacity(0.5)
                        Text(ModKeys.name(w.param)).font(PanelFont.ui(m.r(0.72), 500)).frame(maxWidth: .infinity, alignment: .leading)
                        ValueKnob(label: "Depth", value: w.amount, range: -1...1, defaultValue: 0.5, bipolar: true, cellWidth: 3.2, knobSize: 1.9,
                                  format: { ($0 > 0 ? "+" : "") + "\(Int(($0 * 100).rounded()))%" }) { c.setWire(i, amount: abs($0) < 0.02 ? 0 : $0) }
                        Button("INV") { c.setWire(i, amount: -w.amount) }.buttonStyle(HBStyle())
                        Button("✕") { c.deleteWire(i) }.buttonStyle(HBStyle())
                    }
                    .foregroundStyle(WinStyle.text)
                    .padding(.vertical, m.r(0.15)).padding(.horizontal, m.r(0.3))
                    .background(RoundedRectangle(cornerRadius: m.r(0.3)).fill(Color.white.opacity(0.024)))
                    .overlay(alignment: .leading) { col.frame(width: 3) }
                }
            }
            if !c.project.wires.isEmpty { Button("CLEAR ALL") { c.confirmClearWires = true }.buttonStyle(HBStyle()).padding(.top, m.r(0.4)) }
            SheetHeading(text: "Destinations — every dial")
            let groups = c.modGroups, names = groups.map(\.0)
            PanelSelect(options: names, selected: names.firstIndex(of: c.modGroup) ?? 0, fontSize: 0.74, label: "Destination group") { c.modGroup = names[$0] }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: m.r(0.3)), GridItem(.flexible(), spacing: m.r(0.3))], spacing: m.r(0.3)) {   // .moddests
                ForEach(groups.first { $0.0 == c.modGroup }?.1 ?? [], id: \.self) { key in
                    let wired = c.project.wires.contains { $0.param == key }
                    Button { if c.modPick >= 0 { let s = c.modPick; c.modPick = -1; c.addWire(source: s, key: key) } else { c.toast("Drag a source here, or tap a source first") } } label: {
                        HStack(spacing: m.r(0.3)) {
                            Text(ParameterSpec.spec(forKey: key)?.name ?? key)
                            Spacer(minLength: 0)
                            Text(ParameterSpec.spec(forKey: key).map { ParamFormat.text($0, c.value(key)) } ?? "").font(PanelFont.ui(m.r(0.6), 400)).opacity(0.55)
                        }
                        .font(PanelFont.ui(m.r(0.72), 500)).foregroundStyle(WinStyle.text)
                        .padding(.vertical, m.r(0.4)).padding(.horizontal, m.r(0.5))
                        .background(RoundedRectangle(cornerRadius: m.r(0.4)).fill(WinStyle.panel2))
                        .overlay(RoundedRectangle(cornerRadius: m.r(0.4)).stroke(wired ? Color(hex: "#ff5ad2") : WinStyle.line, lineWidth: 1))
                    }.buttonStyle(.plain)
                }
            }
            .padding(.top, m.r(0.4))
        }
        .alert("Delete every wire?", isPresented: Binding(get: { c.confirmClearWires }, set: { c.confirmClearWires = $0 })) {
            Button("Delete", role: .destructive) { c.clearWires() }
            Button("Cancel", role: .cancel) {}
        }
    }
}

/// .modbox — a bordered settings box with a small title.
struct ModBox<Content: View>: View {
    @Environment(\.panel) private var m
    let title: String
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: m.r(0.25)) {
            Text(title).font(PanelFont.ui(m.r(0.6), 700)).tracking(0.16 * m.r(0.6)).foregroundStyle(WinStyle.text).opacity(0.7)
            content
        }
        .padding(.vertical, m.r(0.4)).padding(.horizontal, m.r(0.5))
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: m.r(0.45)).stroke(WinStyle.line, lineWidth: 1))
    }
}

extension DrumController {
    /// web modGroups: every modulatable parameter by group, in the web's order (tracks first, then the master groups).
    var modGroups: [(String, [String])] {
        var out: [(String, [String])] = []
        func add(_ g: String, _ k: String) { if let i = out.firstIndex(where: { $0.0 == g }) { out[i].1.append(k) } else { out.append((g, [k])) } }
        for t in 1...trackCount { for s in ParameterSpec.track where s.isModulatable { add("Track \(t)", "t\(t).\(s.key)") } }
        for s in ParameterSpec.master where s.index < ParameterID.trackBase && s.isModulatable { add(ModKeys.group(s.key), s.key) }
        return out
    }
}
