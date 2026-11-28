// Vektur Drum — GENERATE (web/src/songgen.js renderSongGen / songGenerate) and EXPORT (web/src/export.js renderExport),
// over the native SongGenerator and Exporter that already exist in VekturDrumCore / VekturDrumAudio.
import SwiftUI
import UIKit
import VekturDrumCore
import VekturDrumAudio

// MARK: - GENERATE

struct GenerateWindow: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    @State private var genre = 0
    @State private var seed: UInt32 = 0
    @State private var useBreak = true
    static let bpmText = ["172–176", "160–168", "118–124", "80–92", "86–96", "136–140", "122–126"]
    var body: some View {
        let bt = c.breakTrack
        ModalSheet(c: c, title: "GENERATE A SONG", width: 720 / 13) {
            VStack(alignment: .leading, spacing: 0) {
                HelpText(text: "Pick a genre: a kit, tempo, eight patterns and an arranged chain replace the current song (your samples stay in the set). Each press is a new seed.")
                LazyVGrid(columns: [GridItem(.adaptive(minimum: m.r(9)), spacing: m.r(0.45))], spacing: m.r(0.45)) {   // .sggenres
                    ForEach(SongGenre.allCases.indices, id: \.self) { i in
                        let g = SongGenre.allCases[i], sel = i == genre && seed != 0
                        Button { genre = i; seed = UInt32.random(in: 1...999_999_999); c.generateSong(g, seed: seed, useBreak: useBreak) } label: {
                            VStack(alignment: .leading, spacing: m.r(0.2)) {
                                Text(g.rawValue).font(.system(size: m.r(1), weight: .bold)).foregroundStyle(Color(hex: "#e8e9ec"))
                                Text("\(Self.bpmText[i]) BPM").font(.system(size: m.r(0.6), weight: .semibold)).tracking(0.1 * m.r(0.6)).foregroundStyle(Color(hex: "#9a9ea6"))
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, m.r(0.7)).padding(.horizontal, m.r(0.8))
                            .background(RoundedRectangle(cornerRadius: m.r(0.5)).fill(Color(hex: sel ? "#24251c" : "#17181c")))
                            .overlay(RoundedRectangle(cornerRadius: m.r(0.5)).stroke(Color(hex: sel ? "#ffd23d" : "#33363c"), lineWidth: 1))
                            .contentShape(Rectangle())
                        }.buttonStyle(.plain)
                    }
                }
                .padding(.vertical, m.r(0.6))
                FlowRow(gap: m.r(0.25), rowGap: m.r(0.25)) {   // .dmchain
                    if let bt { Button(useBreak ? "USE BREAK (TRACK \(bt + 1)) ✓" : "USE BREAK (TRACK \(bt + 1))") { useBreak.toggle() }.buttonStyle(HBStyle(led: .cyan, on: useBreak)) }
                    else { PanelNote(text: "Tip: load and slice a break in the BREAK LAB and DnB, Jungle, TripHop and Hip Hop will chop it in.", maxWidth: nil) }
                    if seed != 0 {
                        Color(hex: "#3a3d43").frame(width: 1, height: m.r(1.9)).padding(.horizontal, m.r(0.2))
                        PanelNote(text: "Last: \(SongGenre.allCases[genre].rawValue) · seed \(seed)", maxWidth: nil)
                        Button("AGAIN (SAME SEED)") { c.generateSong(SongGenre.allCases[genre], seed: seed, useBreak: useBreak) }.buttonStyle(HBStyle())
                        Button("NEW SEED") { seed = UInt32.random(in: 1...999_999_999); c.generateSong(SongGenre.allCases[genre], seed: seed, useBreak: useBreak) }.buttonStyle(HBStyle())
                    }
                }
                .padding(.top, m.r(0.35))
            }
        }
    }
}

extension DrumController {
    /// web sgBreakTrack: the first track with a sample cut into at least 4 slices.
    var breakTrack: Int? {
        (0..<TrackLimits.capacity).first { project.tracks[$0].sample != nil && (project.tracks[$0].slices?.slices.count ?? 0) >= 4 }
    }
    /// web songGenerate: the generated kit, tempo, eight patterns and arranged chain replace the song; samples stay.
    func generateSong(_ genre: SongGenre, seed: UInt32, useBreak: Bool) {
        let breakG: Set<SongGenre> = [.dnb, .jungle, .tripHop, .hipHop]
        let bt = useBreak ? breakTrack : nil
        let brk = bt.flatMap { t in breakG.contains(genre) ? (track: t, slices: min(16, project.tracks[t].slices?.slices.count ?? 0)) : nil }
        let song = SongGenerator.build(genre, seed: seed, breakTrack: brk)
        var p = project
        var vals = song.params
        vals["dr.ch"] = value("dr.ch")   // the MIDI channel never changes
        for t in 0..<TrackLimits.capacity where p.tracks[t].sample != nil && t != brk?.track { vals["t\(t + 1).engine"] = 0 }
        if let b = brk {
            let k = "t\(b.track + 1)"
            vals[k + ".engine"] = 1; vals[k + ".tsmode"] = 2; vals[k + ".decay"] = 3; vals[k + ".level"] = 0.85
            if genre == .jungle { vals[k + ".rsmp"] = 0.45; vals[k + ".smodel"] = 0; vals[k + ".rsmode"] = 0 }
            if genre == .hipHop || genre == .tripHop { vals[k + ".rsmp"] = 0.35; vals[k + ".smodel"] = 3 }
        }
        if genre == .jungle || genre == .dnb { vals["sl.on"] = 0 }
        // every parameter back to its default, then the song's (web: d.p = song.p)
        for t in 0..<TrackLimits.capacity { p.tracks[t].values = [:] }
        p.master = Dictionary(ParameterSpec.master.filter { $0.index < ParameterID.trackBase }.map { ($0.key, $0.defaultValue) }, uniquingKeysWith: { a, _ in a })
        for (key, v) in vals {
            if key.first == "t", let dot = key.firstIndex(of: "."), let n = Int(key[key.index(after: key.startIndex)..<dot]), n >= 1, n <= TrackLimits.capacity {
                p.tracks[n - 1].values[String(key[key.index(after: dot)...])] = v
            } else { p.master[key] = v }
        }
        p.patterns = song.patterns + Array(repeating: Pattern(), count: max(0, TrackLimits.patterns - song.patterns.count))
        p.chain = song.chain; p.chainEnabled = true; p.trackCount = TrackLimits.playable.upperBound
        p.slicer = (0..<DrumLists.slicerSlots).map { SlicerSlot(action: $0 % 8 == 6 ? .stutter : $0 % 8 == 7 ? .reverse : .thru, source: $0) }
        p.wires = []
        let name = "\(genre.rawValue) · \(seed)"
        unit.keeper?.applyKit(Kit(name: name, category: nil, project: p))
        unit.keeper?.update { $0.tempo = song.bpm; $0.selectedPattern = 1; $0.currentKitName = name }
        unit.standaloneTempo = song.bpm
        engine.send(.selectPattern(1))
        reloadFromKeeper(); dirty()
        if !on { setOn(true) }
    }
}

// MARK: - EXPORT

struct ExportWindow: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    @AppStorage("vekturdrum.export.v1") private var prefs = Data()
    @State private var o = ExportOptions()
    @State private var busy = false
    @State private var status = ""
    @State private var files: [URL] = []
    var body: some View {
        let pl = Exporter.plan(c.project), bpm = c.project.tempo
        ModalSheet(c: c, title: "EXPORT", width: 36) {
            VStack(alignment: .leading, spacing: 0) {
                (Text(pl.label).foregroundColor(th.led).bold() + Text(" — \(pl.bars) bar\(pl.bars == 1 ? "" : "s"), \(String(format: "%.1f", pl.seconds)) s at \(shortNumber(bpm)) BPM" +
                    (o.ringOut ? " + the effects ringing out (until silence, at most 30 s)" : " — cut at the end (loop-ready)") + ".\n" +
                    (pl.chain ? "CHAIN is on, so the whole chain is exported once." : "CHAIN is off, so the selected pattern is exported once — turn CHAIN on to export the chain.")))
                    .font(PanelFont.ui(m.r(0.74), 400)).foregroundStyle(WinStyle.text).lineSpacing(m.r(0.74) * 0.4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, m.r(0.45)).padding(.horizontal, m.r(0.55))
                    .background(RoundedRectangle(cornerRadius: m.r(0.4)).fill(Color(hex: "#0b0c0e")))
                    .padding(.bottom, m.r(0.3))
                ExRow(label: "EXPORT", options: [("master", "MASTER"), ("stems", "STEMS")], selected: o.what.rawValue) { o.what = ExportOptions.What(rawValue: $0) ?? .master; save() }
                if o.what == .stems {
                    let st = Exporter.stemTracks(c.project)
                    ExNote(text: st.isEmpty ? "No track plays in the rendered patterns." : "\(st.count) stems: " + st.map { "\($0 + 1) \(c.trackName($0))" }.joined(separator: " · ") + " — each with its own share of the effects, saved together in a folder.")
                }
                ExRow(label: "FORMAT", options: [("wav", "WAV"), ("flac", "FLAC"), ("mp3", "MP3")], selected: o.format.rawValue) { o.format = ExportOptions.Format(rawValue: $0) ?? .wav; save() }
                if o.format == .wav { ExRow(label: "BITS", options: [("16", "16-bit"), ("24", "24-bit"), ("32", "32-bit float")], selected: "\(o.wavBits)") { o.wavBits = Int($0) ?? 24; save() } }
                if o.format == .flac { ExRow(label: "BITS", options: [("16", "16-bit"), ("24", "24-bit")], selected: "\(o.flacBits)") { o.flacBits = Int($0) ?? 24; save() } }
                if o.format == .mp3 { ExRow(label: "BITRATE", options: [("128", "128"), ("192", "192"), ("256", "256"), ("320", "320 kbps")], selected: "\(o.mp3Kbps)") { o.mp3Kbps = Int($0) ?? 320; save() } }
                ExRow(label: "RATE", options: [("44100", "44.1 kHz"), ("48000", "48 kHz")], selected: "\(o.sampleRate)") { o.sampleRate = Int($0) ?? 48000; save() }
                ExRow(label: "TAIL", options: [("ring", "RING OUT"), ("cut", "CUT")], selected: o.ringOut ? "ring" : "cut") { o.ringOut = $0 == "ring"; save() }
                HStack(spacing: m.r(0.6)) {   // .exgo
                    Button(o.what == .stems ? "Export stems" : "Export master") { run() }.buttonStyle(CButton()).fontWeight(.bold).disabled(busy)
                    Text(status).font(PanelFont.ui(m.r(0.72), 400)).foregroundStyle(th.led)
                }
                .padding(.top, m.r(0.6)).padding(.bottom, m.r(0.4))
                ExNote(text: "Rendered offline: faster than real time, and the music keeps playing while it works. Tempo, swing, HUMANISE, chance and every effect are as you hear them. MP3 files carry a gapless tag, so they start and end on the exact sample.")
            }
        }
        .onAppear { if let x = try? JSONDecoder().decode(ExportOptions.self, from: prefs) { o = x } }
        .sheet(isPresented: Binding(get: { !files.isEmpty }, set: { if !$0 { files = [] } })) { FileSaver(urls: files) { r in status = r; files = [] } }
    }
    private func save() { prefs = (try? JSONEncoder().encode(o)) ?? Data() }
    private func run() {
        guard !busy else { return }
        busy = true; status = "Rendering…"
        let p = c.unit.keeper?.currentProject() ?? c.project, opts = o
        let names = (0..<TrackLimits.capacity).map { c.trackName($0) }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("export-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        Task.detached(priority: .userInitiated) {
            do {
                let urls = try await Exporter.export(p, library: nil, options: opts, trackName: { names[$0] }, to: dir) { _, s in Task { @MainActor in status = s } }
                await MainActor.run { busy = false; files = urls.count > 1 ? [urls[0].deletingLastPathComponent()] : urls }
            } catch ExportError.nothingToExport {
                await MainActor.run { busy = false; status = "Nothing to export: the rendered patterns have no steps." }
            } catch {
                await MainActor.run { busy = false; status = "Could not export" }
            }
        }
    }
}

/// .exrow: a printed label with an LED bar (5.2rem) and a row of options.
struct ExRow: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let label: String
    let options: [(String, String)]
    let selected: String
    let set: (String) -> Void
    var body: some View {
        FlowRow(gap: m.r(0.3), rowGap: m.r(0.3)) {
            Text(label).font(PanelFont.ui(m.r(0.66), 800)).tracking(0.16 * m.r(0.66)).foregroundStyle(th.print).brightness(0.12)
                .padding(.leading, m.r(0.4)).overlay(alignment: .leading) { th.led.frame(width: 3) }
                .frame(width: m.r(5.2), alignment: .leading)
            ForEach(options, id: \.0) { o in Button(o.1) { set(o.0) }.buttonStyle(HBStyle(led: .cyan, on: o.0 == selected)) }
        }
        .padding(.vertical, m.r(0.35))
    }
}
struct ExNote: View {
    @Environment(\.panel) private var m
    let text: String
    var body: some View {
        Text(text).font(PanelFont.ui(m.r(0.64), 400)).foregroundStyle(WinStyle.text).opacity(0.75).lineSpacing(m.r(0.64) * 0.35)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, m.r(0.2)).padding(.bottom, m.r(0.3)).padding(.leading, m.width <= 560 ? 0 : m.r(5.6))
    }
}

/// The iOS "save to Files" panel for exported files (what the web app's download / save dialog is on an iPad).
struct FileSaver: UIViewControllerRepresentable {
    let urls: [URL]
    let done: (String) -> Void
    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let v = UIDocumentPickerViewController(forExporting: urls, asCopy: true); v.delegate = context.coordinator; return v
    }
    func updateUIViewController(_ v: UIDocumentPickerViewController, context: Context) {}
    func makeCoordinator() -> Coord { Coord(done: done, names: urls.map(\.lastPathComponent)) }
    final class Coord: NSObject, UIDocumentPickerDelegate {
        let done: (String) -> Void, names: [String]
        init(done: @escaping (String) -> Void, names: [String]) { self.done = done; self.names = names }
        func documentPicker(_ c: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { done("Saved " + names.joined(separator: ", ")) }
        func documentPickerWasCancelled(_ c: UIDocumentPickerViewController) { done("Not saved") }
    }
}
