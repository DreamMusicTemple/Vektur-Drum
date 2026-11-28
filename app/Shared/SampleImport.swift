// Vektur Drum — importing a sample onto a track (web/src/samples.js drumSampleMenu / drumImportSample / drumRemoveSample).
// The file is decoded off the main thread to mono at its own rate, at most 30 s (web dsmpDecode), keyed by the same
// FNV-1a hash as the web (dsmpKey), and handed to the engine with the existing DrumEngine.setSample.
import SwiftUI
import AVFoundation
import UniformTypeIdentifiers
import VekturDrumCore
import VekturDrumAudio

struct SampleMenuRequest: Equatable { var track: Int; var point: CGPoint }

enum SampleDecode {
    static let maxBytes = 20 * 1024 * 1024
    static func key(_ d: Data) -> String {
        var h: UInt32 = 0x811c9dc5
        for b in d { h ^= UInt32(b); h = h &* 0x01000193 }
        return "s" + String(format: "%08x", h)
    }
    static func decode(_ url: URL) throws -> DecodedSample {
        let f = try AVAudioFile(forReading: url)
        let fmt = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: f.fileFormat.sampleRate, channels: f.fileFormat.channelCount, interleaved: false)!
        let frames = AVAudioFrameCount(min(Double(f.length), f.fileFormat.sampleRate * 30))
        guard let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: frames) else { throw CocoaError(.fileReadCorruptFile) }
        try f.read(into: buf, frameCount: frames)
        let n = Int(buf.frameLength), chs = Int(fmt.channelCount)
        guard let data = buf.floatChannelData, n > 0, chs > 0 else { throw CocoaError(.fileReadCorruptFile) }
        var mono = [Float](repeating: 0, count: n)
        for c in 0..<chs { let p = data[c]; for i in 0..<n { mono[i] += p[i] } }
        if chs > 1 { let k = 1 / Float(chs); for i in 0..<n { mono[i] *= k } }
        return DecodedSample(channels: [mono], sampleRate: fmt.sampleRate)
    }
}

extension DrumController {
    /// A long press on a track name or pad, or LOAD SAMPLE…: the small menu (import / replace, remove, cancel).
    func requestSampleImport(track t: Int, at point: CGPoint? = nil) {
        if let point { sampleMenu = SampleMenuRequest(track: t, point: point) } else { sampleImportTrack = t }
    }
    func importSample(track t: Int, url: URL) {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let ext = url.pathExtension.lowercased()
        guard ["wav", "wave", "flac"].contains(ext) else { toast("Choose a WAV or FLAC file"); return }
        guard let bytes = try? Data(contentsOf: url) else { toast("That file couldn't be read"); return }
        guard bytes.count <= SampleDecode.maxBytes else { toast("That file is larger than 20 MB"); return }
        guard let sample = try? SampleDecode.decode(url) else { toast("That file isn't a WAV or FLAC this device can read"); return }
        let name = String(url.deletingPathExtension().lastPathComponent.replacingOccurrences(of: #"[_-]+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces).prefix(40))
        let ref = Self.sampleRef(key: SampleDecode.key(bytes), name: name.isEmpty ? "Sample" : name)
        edit { $0.tracks[t].sample = ref; $0.tracks[t].slices = nil; $0.currentKitName = "" }
        set("t\(t + 1).engine", 1)   // loading a sample selects the Sample engine
        engine.setSample(sample, track: t, slices: nil, values: project.tracks[t].values, tempo: project.tempo)
        toast("Track \(t + 1) plays \(ref?.name ?? name)")
    }
    func removeSample(track t: Int) {
        guard project.tracks[t].sample != nil else { return }
        edit { $0.tracks[t].sample = nil; $0.tracks[t].slices = nil }
        set("t\(t + 1).engine", 0)
        engine.setSample(nil, track: t)
    }
    /// SampleRef has no public memberwise initialiser; it is Codable, so it is built from its coded form.
    static func sampleRef(key: String, name: String) -> SampleRef? {
        try? JSONDecoder().decode(SampleRef.self, from: JSONSerialization.data(withJSONObject: ["key": key, "name": name]))
    }
}

/// .dsmpmenu — the small menu: TRACK n · name, Import / Replace, Remove, Cancel.
struct SampleMenuView: View {
    @Environment(\.panel) private var m
    let c: DrumController
    let req: SampleMenuRequest
    var body: some View {
        let t = req.track, name = c.project.tracks[t].sample?.name
        let model = (ParameterSpec.spec(forKey: "t\(t + 1).model")?.choices ?? [])[safe: Int(c.value("t\(t + 1).model").rounded())] ?? ""
        VStack(alignment: .leading, spacing: 0) {
            Text("TRACK \(t + 1)" + (name.map { " · \($0)" } ?? "")).font(PanelFont.ui(m.r(0.62), 700)).tracking(0.12 * m.r(0.62)).foregroundStyle(Color(hex: "#9a9ea6"))
                .padding(.vertical, m.r(0.35)).padding(.horizontal, m.r(0.5))
            item(name == nil ? "Import sample (WAV or FLAC)…" : "Replace sample (WAV or FLAC)…") { c.sampleImportTrack = t }
            if name != nil { item("Remove sample — back to the drum synth (\(model))") { c.removeSample(track: t) } }
            item("Cancel") {}
        }
        .padding(m.r(0.35))
        .frame(minWidth: m.r(15), alignment: .leading)
        .background(RoundedRectangle(cornerRadius: m.r(0.5)).fill(Color(hex: "#1b1c1f")))
        .overlay(RoundedRectangle(cornerRadius: m.r(0.5)).stroke(Color(hex: "#3a3c41"), lineWidth: 1))
        .shadow(color: .black.opacity(0.67), radius: 15, y: 10)
        .fixedSize()
    }
    private func item(_ s: String, _ f: @escaping () -> Void) -> some View {
        Button { c.sampleMenu = nil; f() } label: {
            Text(s).font(PanelFont.ui(m.r(0.85), 400)).foregroundStyle(Color(hex: "#e8e9ec")).frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, m.r(0.55)).padding(.horizontal, m.r(0.6)).contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
}

/// Long press (550 ms, cancelled by moving 10 pt) opens the sample menu where the finger is (web drumLongPress).
struct SampleLongPress: ViewModifier {
    let c: DrumController
    let t: Int
    @State private var timer: Timer?
    @State private var start: CGPoint?
    func body(content: Content) -> some View {
        content.simultaneousGesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("root"))
            .onChanged { g in
                if start == nil {
                    start = g.location; timer?.invalidate()
                    timer = Timer.scheduledTimer(withTimeInterval: 0.55, repeats: false) { _ in MainActor.assumeIsolated { c.suppressNextTap = true; c.requestSampleImport(track: t, at: g.location) } }
                } else if let s = start, abs(g.location.x - s.x) + abs(g.location.y - s.y) > 10 { timer?.invalidate() }
            }
            .onEnded { _ in timer?.invalidate(); start = nil })
    }
}
extension View { func sampleLongPress(_ c: DrumController, _ t: Int) -> some View { modifier(SampleLongPress(c: c, t: t)) } }
