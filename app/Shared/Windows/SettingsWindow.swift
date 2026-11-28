// Vektur Drum — SETTINGS (web/src/settings.js renderSettings, appearance.js setAppearance, state.js setProject): a small
// .dm chassis with its own top strip (SETTINGS · CLOSE), the tabs, and panel sections of rows.
import SwiftUI
import UniformTypeIdentifiers
import VekturDrumCore
import VekturDrumAudio

struct SettingsWindow: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    static let tabs = [("audio", "AUDIO & POWER"), ("appearance", "APPEARANCE"), ("project", "PROJECT"), ("midi", "MIDI"), ("cc", "PARAMETERS & CC"), ("manual", "MANUAL"), ("about", "ABOUT")]
    var body: some View {
        GeometryReader { g in
            ZStack {
                Color.black.opacity(0.55).ignoresSafeArea().onTapGesture { close() }
                VStack(alignment: .leading, spacing: 0) {
                    HStack {   // .dmtop: SETTINGS … CLOSE
                        Text("SETTINGS").font(PanelFont.ui(m.r(0.82), 800)).tracking(0.32 * m.r(0.82)).foregroundStyle(th.strip[3]).shadow(color: .white.opacity(0.35), radius: 0, y: 1)
                        Spacer()
                        Button("CLOSE") { close() }.buttonStyle(HBStyle())
                    }
                    .padding(.vertical, m.r(0.35)).padding(.horizontal, m.r(0.65))
                    .background { StripBackground(radius: m.r(0.7)) }
                    .padding(.top, -m.r(0.55)).padding(.horizontal, -m.r(0.65)).padding(.bottom, m.r(0.5))
                    FlowRow(gap: m.r(0.3), rowGap: m.r(0.3)) {   // .settabs
                        ForEach(Self.tabs, id: \.0) { k, n in Button(n) { c.settingsTab = k }.buttonStyle(HBStyle(led: .cyan, on: c.settingsTab == k)) }
                    }
                    .padding(.bottom, m.r(0.5))
                    ScrollView(.vertical) {
                        VStack(alignment: .leading, spacing: m.r(0.5)) {
                            switch c.settingsTab {
                            case "appearance": SetAppearance(c: c)
                            case "project": SetProject(c: c)
                            case "midi": SetMidi(c: c)
                            case "cc": SetCC(c: c)
                            case "manual": SetManual()
                            case "about": SetAbout(c: c)
                            default: SetAudio(c: c)
                            }
                        }
                        .padding(.bottom, m.r(0.4))
                    }
                    .scrollIndicators(.hidden)
                }
                .padding(.top, m.r(0.55)).padding(.horizontal, m.r(0.65)).padding(.bottom, m.r(0.7))
                .frame(width: min(m.r(56), g.size.width * 0.98))
                .frame(maxHeight: g.size.height * 0.94)
                .fixedSize(horizontal: false, vertical: true)
                .background {
                    LinearGradient(stops: [.init(color: th.chassis[0], location: 0), .init(color: th.chassis[1], location: 0.02), .init(color: th.chassis[2], location: 1)], startPoint: .top, endPoint: .bottom)
                        .clipShape(RoundedRectangle(cornerRadius: m.r(0.7)))
                }
                .overlay(RoundedRectangle(cornerRadius: m.r(0.7)).strokeBorder(Color.black, lineWidth: 1))
                .shadow(color: .black.opacity(0.6), radius: 20, y: 10)
            }
        }
    }
    private func close() { c.learnKey = nil; c.window = nil }
}

/// .setrow: the title and its description on the left, the control on the right (stacked on narrow screens).
struct SetRow<Control: View>: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let title: String
    var desc: String? = nil
    var last = false
    @ViewBuilder var control: Control
    var body: some View {
        let text = VStack(alignment: .leading, spacing: m.r(0.15)) {
            Text(title).font(PanelFont.ui(m.r(0.78), 700)).tracking(0.08 * m.r(0.78)).foregroundStyle(Color(hex: "#e4e1d8"))
            if let desc { Text(desc).font(PanelFont.ui(m.r(0.68), 400)).foregroundStyle(th.print).lineSpacing(m.r(0.68) * 0.4).fixedSize(horizontal: false, vertical: true) }
        }.frame(maxWidth: m.r(34), alignment: .leading)
        Group {
            if m.width <= 640 { VStack(alignment: .leading, spacing: m.r(0.8)) { text; control } }
            else { HStack(spacing: m.r(0.8)) { text; Spacer(minLength: 0); control } }
        }
        .padding(.vertical, m.r(0.45)).padding(.horizontal, m.r(0.1))
        .overlay(alignment: .bottom) { if !last { Color(hex: "#222428").frame(height: 1) } }
    }
}
struct SetToggle: View {
    let on: Bool
    let label: String
    let toggle: () -> Void
    var body: some View { Button(on ? "ON" : "OFF", action: toggle).buttonStyle(HBStyle(size: .normal, minWidth: 3.6, led: .amber, on: on)).accessibilityLabel(label) }
}
/// .setoled: a display line inside a section.
struct SetOled: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let text: String
    var body: some View {
        OledBox(pad: 0.3) {
            Text(text).font(PanelFont.mono(m.r(0.66), 600)).foregroundStyle(th.cyan).lineSpacing(m.r(0.66) * 0.35)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, m.r(0.2)).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, m.r(0.35))
    }
}
/// A settings choice row of small keys (.setchoice), right-aligned.
struct SetChoice: View {
    @Environment(\.panel) private var m
    let options: [(String, String)]
    let selected: String
    let set: (String) -> Void
    var body: some View {
        FlowRow(gap: m.r(0.25), rowGap: m.r(0.25)) {
            ForEach(options, id: \.0) { o in Button(o.1) { set(o.0) }.buttonStyle(HBStyle(led: .amber, on: o.0 == selected)) }
        }
        .fixedSize()
    }
}

// MARK: - AUDIO & POWER

struct SetAudio: View {
    @Environment(\.panel) private var m
    let c: DrumController
    @State private var insertOn = false
    var body: some View {
        let p = c.prefs, host = c.host
        let lat = DevicePrefs.latencies.first { $0.id == p.latency } ?? DevicePrefs.latencies[0]
        PanelSection(title: "AUDIO ENGINE") {
            VStack(alignment: .leading, spacing: 0) {
                SetRow(title: "Sample rate", desc: host == nil ? "Set by the app that hosts the plug-in." : "Higher rates cost more battery; the drums sound the same at all of them. Changing it restarts the engine (your music is kept).") {
                    SetChoice(options: DevicePrefs.rates.map { ("\(Int($0.0))", $0.1) }, selected: "\(Int(p.sampleRate))") { v in c.updatePrefs { $0.sampleRate = Double(v) ?? 0 }; host?.applyAudioPrefs(c.prefs) }
                        .disabled(host == nil).opacity(host == nil ? 0.5 : 1)
                }
                SetRow(title: "Latency", desc: host == nil ? "Set by the app that hosts the plug-in." : lat.text) {
                    SetChoice(options: DevicePrefs.latencies.map { ($0.id, $0.name.uppercased()) }, selected: p.latency) { v in c.updatePrefs { $0.latency = v }; host?.applyAudioPrefs(c.prefs) }
                        .disabled(host == nil).opacity(host == nil ? 0.5 : 1)
                }
                SetOled(text: host?.audioStatus ?? "Running inside the host app: its audio session sets the rate and buffer.")
            }
        }
        PanelSection(title: "INSERT INPUT") {
            VStack(alignment: .leading, spacing: 0) {
                SetRow(title: "Process an audio input", desc: host == nil ? "In a host, load Vektur Drum as an effect (Vektur Drum FX) to process another app's audio." : "Runs the input through the delay and reverb sends, the glitch, the Slicer and tape, with the drums or without. Use headphones with a microphone.") {
                    SetToggle(on: insertOn, label: "Insert input") {
                        guard let host else { return }
                        Task { let want = !insertOn; if let err = await host.setInsert(want) { c.toast(err) } else { c.toast(want ? "Insert on: the input runs through the effects" : "Insert off") }; insertOn = host.insertRunning }
                    }.disabled(host == nil).opacity(host == nil ? 0.5 : 1)
                }
                SetRow(title: "Input mix", desc: "Input level, its delay and reverb sends, and whether the drums play too.", last: true) {
                    HStack(alignment: .top, spacing: m.r(0.05)) {
                        ParamKnob(c: c, key: "in.level", label: "Input"); ParamKnob(c: c, key: "in.dly", label: "Delay"); ParamKnob(c: c, key: "in.rev", label: "Reverb")
                        let d = c.value("in.drums") > 0.5
                        Button(d ? "DRUMS ON" : "DRUMS OFF") { c.set("in.drums", d ? 0 : 1) }.buttonStyle(HBStyle(led: .amber, on: d))
                    }
                }
            }
        }
        .onAppear { insertOn = host?.insertRunning ?? false }
        PanelSection(title: "POWER") {
            VStack(alignment: .leading, spacing: 0) {
                SetRow(title: "Battery saving mode", desc: "Lights update less often, and the audio engine sleeps after 20 seconds stopped and silent. A tap or a MIDI note wakes it.") {
                    SetToggle(on: p.battery, label: "Battery saving mode") { c.updatePrefs { $0.battery.toggle() } }
                }
                SetRow(title: "Don't sleep", desc: "Keeps the screen on while Vektur Drum is in front (for performing). Uses more battery.") {
                    SetToggle(on: p.noSleep, label: "Don't sleep") { c.updatePrefs { $0.noSleep.toggle() } }
                }
                SetRow(title: "Background audio", desc: "Keeps playing when you switch to another app or lock the screen. Off: audio pauses in the background and resumes when you return.", last: true) {
                    SetToggle(on: p.background, label: "Background audio") { c.updatePrefs { $0.background.toggle() }; host?.applyAudioPrefs(c.prefs) }
                }
            }
        }
    }
}

// MARK: - APPEARANCE

struct SetAppearance: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    var body: some View {
        let t = c.prefs.theme
        PanelSection(title: "DIALS") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: m.r(6.4)), spacing: m.r(0.35))], spacing: m.r(0.35)) {
                ForEach(AppearanceTheme.dialStyles, id: \.id) { d in
                    Button { c.updatePrefs { $0.dial = d.id } } label: {
                        VStack(spacing: m.r(0.25)) {
                            DialArt(style: d.id, t: 0.67, colorHex: th.ledHex, dragging: false).frame(width: m.r(2.6) * 1.3, height: m.r(2.6) * 1.3).frame(height: m.r(3.4))
                            Text(d.name).font(PanelFont.ui(m.r(0.7), 700)).tracking(0.04 * m.r(0.7))
                            Text(d.family == "Drum" ? "Vektur Drum" : "from Vektur \(d.family)").font(PanelFont.ui(m.r(0.5), 400)).opacity(0.6)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, m.r(0.4)).padding(.horizontal, m.r(0.3))
                        .modifier(ThemeTile(on: c.prefs.dial == d.id, ledHex: th.ledHex, fill: "#15171a"))
                    }.buttonStyle(.plain)
                }
            }
        }
        PanelSection(title: "STEP DESIGN") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: m.r(6.4)), spacing: m.r(0.35))], spacing: m.r(0.35)) {
                ForEach(AppearanceTheme.stepStyles, id: \.id) { s in
                    Button { c.updatePrefs { $0.steps = s.id } } label: {
                        VStack(spacing: m.r(0.25)) {
                            HStack(spacing: m.r(0.18)) {
                                ForEach([1, 0, 2, 1], id: \.self) { v in
                                    StepFace(design: s.id, on: v > 0, accent: v == 2, playhead: false, muted: false, radius: m.r(0.25)).frame(width: m.r(1.05), height: m.r(1.9))
                                }
                            }.frame(height: m.r(3.4))
                            Text(s.name).font(PanelFont.ui(m.r(0.7), 700))
                            Text(s.description).font(PanelFont.ui(m.r(0.5), 400)).opacity(0.6)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, m.r(0.4)).padding(.horizontal, m.r(0.3))
                        .modifier(ThemeTile(on: c.prefs.steps == s.id, ledHex: th.ledHex, fill: "#15171a"))
                    }.buttonStyle(.plain)
                }
            }
        }
        PanelSection(title: "THEMES") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: m.r(7.4)), spacing: m.r(0.35))], spacing: m.r(0.35)) {
                ForEach(AppearanceTheme.all) { x in
                    Button { c.updatePrefs { $0.theme = ThemePrefs(id: x.id) } } label: {
                        VStack(alignment: .leading, spacing: m.r(0.25)) {
                            HStack(spacing: m.r(0.2)) {
                                ForEach([x.led, x.display, x.arc], id: \.self) { h in Circle().fill(Color(hex: h)).frame(width: m.r(0.9), height: m.r(0.9)).shadow(color: Color(hex: h), radius: 2.5) }
                            }
                            Text(x.name).font(PanelFont.ui(m.r(0.7), 700)).tracking(0.04 * m.r(0.7))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.top, m.r(0.9)).padding(.horizontal, m.r(0.45)).padding(.bottom, m.r(0.4))
                        .overlay(alignment: .top) { Color(hex: AppearanceTheme.strips[x.strip]?.colors[0] ?? "#7d8086").frame(height: m.r(0.45)) }
                        .modifier(ThemeTile(on: t.id == x.id, ledHex: x.led, fill: AppearanceTheme.chassis[x.chassis]?.colors[3] ?? "#111214"))
                    }.buttonStyle(.plain)
                }
            }
        }
        PanelSection(title: "YOUR COLOURS") {
            VStack(alignment: .leading, spacing: 0) {
                SetRow(title: "LED colour", desc: "Lit buttons, steps, pads, dial values and the playhead.") { ColourWell(hex: th.ledHex) { h in c.updatePrefs { $0.theme.led = h } } }
                SetRow(title: "Display colour", desc: "The displays, selections and the second LED colour.") { ColourWell(hex: c.panelThemeDisplayHex) { h in c.updatePrefs { $0.theme.disp = h } } }
                SetRow(title: "Dial arc colour", desc: "The lit ring on every dial.") { ColourWell(hex: th.arcHex) { h in c.updatePrefs { $0.theme.arc = h } } }
                SetRow(title: "Chassis", desc: "The body and the panel sections.") {
                    SetChoice(options: ["graphite", "black", "blue", "warm", "purple", "green"].map { ($0, (AppearanceTheme.chassis[$0]?.name ?? $0).uppercased()) }, selected: c.panelThemeChassis) { k in c.updatePrefs { $0.theme.chassis = k } }
                }
                SetRow(title: "Top strip", desc: "The bar with the name and the main buttons.") {
                    SetChoice(options: ["alu", "dark", "copper", "gold"].map { ($0, (AppearanceTheme.strips[$0]?.name ?? $0).uppercased()) }, selected: c.panelThemeStrip) { k in c.updatePrefs { $0.theme.strip = k } }
                }
                SetRow(title: "Reset", desc: "Back to the chosen theme’s own colours.", last: true) {
                    Button("RESET TO THE THEME") { c.updatePrefs { $0.theme = ThemePrefs(id: $0.theme.id) } }.buttonStyle(HBStyle())
                }
            }
        }
    }
}
struct ThemeTile: ViewModifier {
    @Environment(\.panel) private var m
    let on: Bool
    let ledHex: String
    let fill: String
    func body(content: Content) -> some View {
        content.foregroundStyle(Color(hex: "#e4e1d8"))
            .background(Color(hex: fill))
            .clipShape(RoundedRectangle(cornerRadius: m.r(0.45)))
            .overlay(RoundedRectangle(cornerRadius: m.r(0.45)).stroke(Color(hex: "#3a3d44"), lineWidth: 1))
            .overlay { if on { RoundedRectangle(cornerRadius: m.r(0.45) + 2).stroke(Color(hex: ledHex), lineWidth: 2).padding(-3) } }
    }
}
/// input[type=color]: a colour well (3.2rem × 1.9rem) that opens the system colour picker.
struct ColourWell: View {
    @Environment(\.panel) private var m
    let hex: String
    let set: (String) -> Void
    var body: some View {
        ColorPicker("", selection: Binding(get: { Color(hex: hex) }, set: { col in
            let u = UIColor(col); var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0; u.getRed(&r, green: &g, blue: &b, alpha: &a)
            set(String(format: "#%02x%02x%02x", Int((min(1, max(0, r)) * 255).rounded()), Int((min(1, max(0, g)) * 255).rounded()), Int((min(1, max(0, b)) * 255).rounded())))
        }), supportsOpacity: false)
        .labelsHidden()
        .frame(width: m.r(3.2), height: m.r(1.9))
        .background(RoundedRectangle(cornerRadius: m.r(0.3)).fill(Color(hex: "#111111")))
        .overlay(RoundedRectangle(cornerRadius: m.r(0.3)).stroke(Color(hex: "#3a3d44"), lineWidth: 1))
    }
}
extension DrumController {
    var panelThemeDisplayHex: String {
        let base = AppearanceTheme.all.first { $0.id == prefs.theme.id } ?? AppearanceTheme.all[0]
        return prefs.theme.disp ?? base.display
    }
    var panelThemeChassis: String { let base = AppearanceTheme.all.first { $0.id == prefs.theme.id } ?? AppearanceTheme.all[0]; return prefs.theme.chassis ?? base.chassis }
    var panelThemeStrip: String { let base = AppearanceTheme.all.first { $0.id == prefs.theme.id } ?? AppearanceTheme.all[0]; return prefs.theme.strip ?? base.strip }
}

// MARK: - PROJECT

struct SetProject: View {
    @Environment(\.panel) private var m
    let c: DrumController
    @State private var embed = true
    @State private var saveURL: URL?
    @State private var opening = false
    var body: some View {
        let p = c.unit.keeper?.currentProject() ?? c.project
        let data = (try? StateCodec.encode(p, embed: nil, writer: "Vektur Drum")) ?? Data()
        let used = p.tracks.prefix(c.trackCount).filter { $0.sample != nil }.count
        PanelSection(title: "PROJECT") {
            VStack(alignment: .leading, spacing: 0) {
                SetRow(title: "Export audio", desc: "The master or stems as WAV, FLAC or MP3 — the whole chain when CHAIN is on, otherwise the selected pattern.") {
                    Button("EXPORT AUDIO…") { c.window = .export }.buttonStyle(HBStyle())
                }
                SetRow(title: "Project file", desc: "Everything about this song in one file: all sound settings, the 8 patterns, chain, track count, tempo, samples and your MIDI CC map. The same format the web app and the plug-in save inside GarageBand, Cubasis, AUM and Logic.") {
                    HStack(spacing: m.r(0.25)) {
                        Button("SAVE PROJECT…") { saveProject(p) }.buttonStyle(HBStyle())
                        Button("OPEN PROJECT…") { opening = true }.buttonStyle(HBStyle())
                    }
                }
                SetRow(title: "Include samples", desc: "Puts the track samples inside the file, so the song opens complete on any device. Off: smaller file; samples must already be on the device that opens it.", last: true) {
                    SetToggle(on: embed, label: "Include samples") { embed.toggle() }
                }
                SetOled(text: "Format \(StateFile.format) v\(StateFile.version) · " + String(format: data.count < 102400 ? "%.1f KB" : "%.0f KB", Double(data.count) / 1024) + " · \(used) sample\(used == 1 ? "" : "s")\nKit: \(p.currentKitName.flatMap { $0.isEmpty ? nil : $0 } ?? "—")")
            }
        }
        .sheet(isPresented: Binding(get: { saveURL != nil }, set: { if !$0 { saveURL = nil } })) { if let u = saveURL { FileSaver(urls: [u]) { c.toast($0); saveURL = nil } } }
        .fileImporter(isPresented: $opening, allowedContentTypes: [.json, .data]) { r in
            guard case .success(let url) = r else { return }
            let a = url.startAccessingSecurityScopedResource(); defer { if a { url.stopAccessingSecurityScopedResource() } }
            guard let d = try? Data(contentsOf: url), (try? StateCodec.decode(d, librarySamples: [])) != nil else { c.toast("That isn't a Vektur Drum project"); return }
            c.unit.keeper?.restore([AUStateKeeper.stateKey: d], reason: .song)
            c.toast("Opened \(url.deletingPathExtension().lastPathComponent)")
        }
    }
    private func saveProject(_ p: DrumProject) {
        let name = "Vektur Drum" + (p.currentKitName.flatMap { $0.isEmpty ? nil : " - " + $0 } ?? "") + ".vdrum.json"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name.replacingOccurrences(of: "/", with: "-"))
        let full = c.unit.keeper?.fullState(base: nil)[AUStateKeeper.stateKey] as? Data
        guard let d = embed ? full : (try? StateCodec.encode(p, embed: nil, writer: "Vektur Drum")), (try? d.write(to: url)) != nil else { c.toast("Could not save"); return }
        saveURL = url
    }
}

// MARK: - MIDI

struct SetMidi: View {
    @Environment(\.panel) private var m
    let c: DrumController
    var body: some View {
        let host = c.host
        PanelSection(title: "MIDI") {
            VStack(alignment: .leading, spacing: 0) {
                SetRow(title: "Enable MIDI input", desc: host == nil ? "In a host app, MIDI reaches the plug-in through the host's routing; notes on the drum channel play the tracks." : "Notes on the drum channel play the tracks (and record while REC is lit); CCs move the parameters in the CC list.") {
                    SetToggle(on: c.prefs.midiIn, label: "Enable MIDI input") { c.updatePrefs { $0.midiIn.toggle() }; host?.setMIDIEnabled(c.prefs.midiIn) }
                }
                SetRow(title: "Enable MIDI learn", desc: "Use LEARN in the Parameters & CC list: the next CC you move is assigned to that parameter.") {
                    Button("PARAMETERS & CC") { c.settingsTab = "cc" }.buttonStyle(HBStyle())
                }
                SetRow(title: "Drum note channel", desc: "The channel whose notes play the drums (saved with the kit's project). CCs are taken on any channel.", last: true) {
                    ParamSelect(c: c, key: "dr.ch", options: (0...16).map { $0 == 0 ? "Any channel" : "Channel \($0)" })
                }
                SetOled(text: (host.map { $0.midiPorts.isEmpty ? "No MIDI inputs found yet." : "Inputs: " + $0.midiPorts.joined(separator: ", ") } ?? "MIDI comes from the host app.")
                        + (c.lastCC.map { "\nLast CC: \($0.cc) = \($0.v) (channel \($0.ch))" } ?? ""))
            }
        }
    }
}

// MARK: - PARAMETERS & CC

struct SetCC: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    @State private var open: Set<String> = []
    @State private var confirm: String?
    var body: some View {
        let ch = Int(c.value("dr.ch").rounded())
        PanelSection(title: "MIDI NOTES") {
            VStack(alignment: .leading, spacing: 0) {
                SetTable(headers: ["Track", "Note", "Sound now"], rows: ParameterSpec.trackNotes.enumerated().map { t, n in
                    ["Track \(t + 1)", "\(n) (\(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][n % 12])\(n / 12 - 1))", c.trackName(t)] })
                PanelNote(text: "On channel \(ch == 0 ? "any" : String(ch)). Notes from 36 upwards that aren't listed wrap round the tracks.", maxWidth: nil).padding(.top, m.r(0.35))
            }
        }
        PanelSection(title: "PARAMETERS & MIDI CC") {
            VStack(alignment: .leading, spacing: m.r(0.25)) {
                HStack(spacing: m.r(0.25)) {
                    Button("RESET CC MAP") { confirm = "reset" }.buttonStyle(HBStyle())
                    Button("CLEAR ALL CCs") { confirm = "clear" }.buttonStyle(HBStyle())
                    if let k = c.learnKey { Text("Move a MIDI control for \(DrumController.paramLabel(k))…").font(PanelFont.ui(m.r(0.68), 400)).foregroundStyle(th.cyan).padding(.leading, m.r(0.4)) }
                }
                PanelNote(text: "Every parameter, its range and its MIDI CC. LEARN: the next CC you move is assigned. Assignments are this device's, for any channel.", maxWidth: nil)
                ForEach(Array(ccGroups.enumerated()), id: \.offset) { gi, g in
                    let mapped = g.1.filter { c.prefs.ccMap[$0] != nil }.count, isOpen = open.contains(g.0) || ((gi == 0 || gi >= 9) && !open.contains("-" + g.0))
                    VStack(alignment: .leading, spacing: 0) {
                        Button { if isOpen { open.remove(g.0); open.insert("-" + g.0) } else { open.insert(g.0); open.remove("-" + g.0) } } label: {
                            HStack(spacing: m.r(0.6)) {
                                Text((isOpen ? "▾ " : "▸ ") + g.0).font(PanelFont.ui(m.r(0.72), 500)).tracking(0.1 * m.r(0.72)).foregroundStyle(Color(hex: "#e4e1d8"))
                                if mapped > 0 { Text("\(mapped) on CC").font(PanelFont.ui(m.r(0.62), 500)).foregroundStyle(th.led) }
                                Spacer()
                            }.padding(.vertical, m.r(0.25)).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                        if isOpen { CCTable(c: c, keys: g.1) }
                    }
                    .padding(.vertical, m.r(0.3)).padding(.horizontal, m.r(0.5))
                    .background(RoundedRectangle(cornerRadius: m.r(0.35)).fill(Color(hex: "#0d0e10")))
                }
            }
        }
        .alert(confirm == "reset" ? "Restore the factory CC map? Your learned CCs are removed." : "Remove every CC assignment?", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } })) {
            Button("OK") { let r = confirm == "reset"; c.updatePrefs { $0.ccMap = r ? DevicePrefs.ccFactory() : [:] }; confirm = nil }
            Button("Cancel", role: .cancel) { confirm = nil }
        }
    }
    /// web setCC groups: tracks 1–9, then master/delay/reverb, glitch and LFOs, Slicer, env follower and chaos, other.
    private var ccGroups: [(String, [String])] {
        var g: [(String, [String])] = (1...9).map { t in ("Track \(t) · \(c.trackName(t - 1))", ParameterSpec.track.map { "t\(t).\($0.key)" }) }
        let master = ParameterSpec.master.filter { $0.index < ParameterID.trackBase }.map(\.key)
        g.append(("Master, delay and reverb", master.filter { $0.hasPrefix("dr.") }))
        g.append(("Glitch and LFOs", master.filter { $0.hasPrefix("gl.") || $0.hasPrefix("lfo") }))
        g.append(("Slicer", master.filter { $0.hasPrefix("sl.") }))
        g.append(("Envelope follower and chaos", master.filter { $0.hasPrefix("env.") || $0.hasPrefix("ch.") }))
        let seen = Set(g.flatMap(\.1)), rest = master.filter { !seen.contains($0) } + (10...TrackLimits.playable.upperBound).flatMap { t in ParameterSpec.track.map { "t\(t).\($0.key)" } }
        if !rest.isEmpty { g.append(("Other", rest)) }
        return g
    }
}
struct CCTable: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    let keys: [String]
    var body: some View {
        VStack(spacing: 0) {
            row(["PARAMETER", "RANGE", "DEFAULT", "CC"], header: true, key: nil)
            ForEach(keys, id: \.self) { k in
                if let s = ParameterSpec.spec(forKey: k) {
                    let e = c.prefs.ccMap[k], d = ParameterSpec.trackDefault(forKey: k) ?? s.defaultValue
                    row([s.name, Self.range(s), s.kind == .choice ? (s.choices[safe: Int(d)] ?? "") : s.kind == .toggle ? (d > 0 ? "on" : "off") : ParamFormat.text(s, d), e.map { "CC \($0.cc)" + ($0.ch > 0 ? " ch \($0.ch)" : "") } ?? "—"], header: false, key: k)
                }
            }
        }
    }
    static func range(_ s: ParameterSpec) -> String {
        if s.kind == .choice { return s.choices.joined(separator: " / ") }
        if s.kind == .toggle { return "off / on" }
        return "\(ParamFormat.text(s, s.range.lowerBound)) … \(ParamFormat.text(s, s.range.upperBound))"
    }
    private func row(_ cells: [String], header: Bool, key: String?) -> some View {
        let fs = m.r(header ? 0.56 : 0.68)
        return HStack(spacing: m.r(0.3)) {
            Text(cells[0]).frame(width: m.r(8), alignment: .leading)
            Text(cells[1]).frame(maxWidth: .infinity, alignment: .leading).lineLimit(2)
            Text(cells[2]).frame(width: m.r(5), alignment: .leading)
            Text(cells[3]).font(header ? PanelFont.ui(fs, 700) : PanelFont.mono(fs, 500)).foregroundStyle(header ? th.print : th.cyan).frame(width: m.r(4), alignment: .leading)
            HStack(spacing: m.r(0.2)) {
                if let k = key {
                    Button(c.learnKey == k ? "LISTENING" : "LEARN") { c.learnKey = c.learnKey == k ? nil : k }.buttonStyle(HBStyle(minWidth: 0, height: 1.6, led: .cyan, on: c.learnKey == k))
                    if c.prefs.ccMap[k] != nil { Button("✕") { c.updatePrefs { $0.ccMap[k] = nil } }.buttonStyle(HBStyle(minWidth: 0, height: 1.6)) }
                }
            }.frame(width: m.r(6.4), alignment: .trailing)
        }
        .font(PanelFont.ui(fs, header ? 700 : 400)).tracking(header ? 0.14 * fs : 0).foregroundStyle(header ? th.print : Color(hex: "#d8d4c8"))
        .padding(.vertical, m.r(header ? 0.25 : 0.22)).padding(.horizontal, m.r(0.3))
        .overlay(alignment: .bottom) { Color(hex: header ? "#26282c" : "#1a1b1e").frame(height: 1) }
    }
}
/// .settab — a simple table.
struct SetTable: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let headers: [String]
    let rows: [[String]]
    var body: some View {
        VStack(spacing: 0) {
            line(headers.map { $0.uppercased() }, header: true)
            ForEach(rows.indices, id: \.self) { line(rows[$0], header: false) }
        }
    }
    private func line(_ cells: [String], header: Bool) -> some View {
        let fs = m.r(header ? 0.56 : 0.68)
        return HStack(spacing: m.r(0.3)) { ForEach(cells.indices, id: \.self) { Text(cells[$0]).frame(maxWidth: .infinity, alignment: .leading) } }
            .font(PanelFont.ui(fs, header ? 700 : 400)).tracking(header ? 0.14 * fs : 0).foregroundStyle(header ? th.print : Color(hex: "#d8d4c8"))
            .padding(.vertical, m.r(header ? 0.25 : 0.22)).padding(.horizontal, m.r(0.3))
            .overlay(alignment: .bottom) { Color(hex: header ? "#26282c" : "#1a1b1e").frame(height: 1) }
    }
}

// MARK: - MANUAL · ABOUT

struct SetManual: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    var body: some View {
        PanelSection(title: "USER MANUAL") {
            ScrollViewReader { proxy in
                VStack(alignment: .leading, spacing: 0) {
                    FlowRow(gap: m.r(0.25), rowGap: m.r(0.25)) {
                        ForEach(UserManual.sections.indices, id: \.self) { i in
                            Button(UserManual.sections[i].title.uppercased()) { withAnimation { proxy.scrollTo("man\(i)", anchor: .top) } }.buttonStyle(HBStyle(height: 1.7, fontSize: 0.52))
                        }
                    }
                    .padding(.bottom, m.r(0.4))
                    ForEach(UserManual.sections.indices, id: \.self) { i in
                        let s = UserManual.sections[i]
                        Text(s.title.uppercased()).font(PanelFont.ui(m.r(0.78), 700)).tracking(0.18 * m.r(0.78)).foregroundStyle(th.led)
                            .padding(.top, m.r(1)).padding(.bottom, m.r(0.3)).id("man\(i)")
                        ForEach(s.blocks.indices, id: \.self) { j in
                            Text(ManualText.attributed(s.blocks[j])).font(PanelFont.ui(m.r(0.78), 400)).foregroundStyle(Color(hex: "#d8d4c8")).lineSpacing(m.r(0.78) * 0.55)
                                .tint(th.cyan).fixedSize(horizontal: false, vertical: true).padding(.vertical, m.r(0.2))
                        }
                    }
                }
                .frame(maxWidth: m.r(46), alignment: .leading)
            }
        }
    }
}
/// The manual's blocks are small HTML fragments (p, ul/li, b, i, a): shown as attributed text.
enum ManualText {
    static func attributed(_ html: String) -> AttributedString {
        var s = html.replacingOccurrences(of: "<li>", with: "• ").replacingOccurrences(of: "</li>", with: "\n")
            .replacingOccurrences(of: "<br>", with: "\n").replacingOccurrences(of: "</p>", with: "\n")
        s = s.replacingOccurrences(of: #"<b>(.*?)</b>"#, with: "**$1**", options: .regularExpression)
            .replacingOccurrences(of: #"<i>(.*?)</i>"#, with: "*$1*", options: .regularExpression)
            .replacingOccurrences(of: #"<a href="([^"]*)"[^>]*>(.*?)</a>"#, with: "[$2]($1)", options: .regularExpression)
            .replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: "&amp;", with: "&").replacingOccurrences(of: "&lt;", with: "<").replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&nbsp;", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        return (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s)
    }
}

struct SetAbout: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    var body: some View {
        let ver = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.9.1") + " (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"))"
        PanelSection(title: "ABOUT") {
            VStack(spacing: m.r(0.4)) {
                Image(uiImage: UIImage(named: "DMTLogo") ?? UIImage()).resizable().scaledToFit().frame(width: min(m.r(11), m.width * 0.55)).clipShape(Circle())
                    .shadow(color: Color(120, 90, 255, 0.35), radius: 11).padding(.top, m.r(0.4)).padding(.bottom, m.r(0.2))
                Text("VEKTUR DRUM").font(PanelFont.ui(m.r(1.1), 700)).tracking(0.35 * m.r(1.1)).foregroundStyle(Color(hex: "#e4e1d8"))
                Text("Hybrid drum machine · Version \(ver)").font(PanelFont.mono(m.r(0.8), 500)).foregroundStyle(Color(hex: "#e4e1d8"))
                Group {
                    Text("Vektur Drum is created by **DMT Cymatics — Dream Music Temple**.")
                    Text("Bug reports or questions: [DMTcymatics@humanoid.net](mailto:DMTcymatics@humanoid.net)")
                    Text("Website: [DreamMusicTemple.com](https://DreamMusicTemple.com)")
                }.font(PanelFont.ui(m.r(0.8), 400)).foregroundStyle(Color(hex: "#e4e1d8")).tint(th.cyan)
                Text("© 2026 DMT Cymatics / Dream Music Temple. All rights reserved.").font(PanelFont.ui(m.r(0.7), 400)).foregroundStyle(th.print)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, m.r(0.3)).padding(.horizontal, m.r(0.2))
        }
        PanelSection(title: "THIS DEVICE") {
            SetOled(text: (c.host?.audioStatus ?? "Running inside a host app.") + "\nMIDI: \(c.host == nil ? "from the host" : c.prefs.midiIn ? "on" : "off") · Screen lock: supported")
        }
    }
}
