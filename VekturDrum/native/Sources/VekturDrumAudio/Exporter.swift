// Vektur Drum — EXPORT (NEW 0.8): the master or stems as WAV, FLAC or MP3, rendered offline in dedicated engines
// (never the one you hear), with the same rules as the web app:
//   · CHAIN on (and a chain set): the whole chain once · otherwise the selected pattern once;
//   · RING OUT: the effects ring on until 0.5 s of silence (at most 30 s) · CUT: exactly the music (loop-ready);
//   · STEMS: one render per track that plays in those patterns (and isn't muted), every other track muted, all padded
//     to the longest, so they line up from zero; written to a folder.
// The renders and encoders are the C++ ones (vd_engine_render_offline, vd_encode): WAV and FLAC files are
// byte-identical to the web app's encoders. Not yet compiled (no Swift toolchain where it was written).
import Foundation
import VekturDrumCore
import VekturDrumDSP

public struct ExportOptions: Sendable, Codable, Equatable {
    public enum What: String, Sendable, Codable { case master, stems }
    public enum Format: String, Sendable, Codable { case wav, flac, mp3 }
    public var what: What = .master
    public var format: Format = .wav
    public var wavBits = 24          // 16 | 24 | 32 (float)
    public var flacBits = 24         // 16 | 24
    public var mp3Kbps = 320         // 128 | 192 | 256 | 320
    public var sampleRate = 48000    // 44100 | 48000
    public var ringOut = true
    public init() {}
    var quality: UInt32 { UInt32(format == .wav ? wavBits : format == .flac ? flacBits : mp3Kbps) }
    var fileFormat: vd_file_format { format == .wav ? VD_FILE_WAV : format == .flac ? VD_FILE_FLAC : VD_FILE_MP3 }
}

public enum ExportError: Error { case engine, nothingToExport, encode }

public enum Exporter {
    public static let tailMaxSeconds: Float = 30

    /// What will be rendered (for the EXPORT sheet): label, bars, seconds.
    public static func plan(_ p: DrumProject) -> (chain: Bool, order: [Int], bars: Int, seconds: Double, label: String) {
        let chain = p.chainEnabled && !p.chain.isEmpty, order = chain ? Array(p.chain.prefix(TrackLimits.chainMax)) : [p.selectedPattern]
        let bars = order.reduce(0) { $0 + p.patterns[min(max($1, 0), TrackLimits.patterns - 1)].bars.rawValue }
        return (chain, order, bars, Double(bars * 4) * 60 / p.tempo, chain ? "Chain " + order.map { String($0 + 1) }.joined(separator: " · ") : "Pattern \(p.selectedPattern + 1)")
    }
    /// The stems: tracks that play in the rendered patterns and aren't muted.
    public static func stemTracks(_ p: DrumProject) -> [Int] {
        let pl = plan(p)
        return (0..<p.trackCount).filter { t in
            (p.tracks[t].values["mute"] ?? 0) < 0.5 && pl.order.contains { p.patterns[min(max($0, 0), TrackLimits.patterns - 1)].tracks[t].steps.contains { $0 != nil } }
        }
    }

    /// Renders and writes the files into `folder`; returns their URLs. Call off the main actor (it is CPU work).
    public static func export(_ p: DrumProject, library: SampleLibrary?, options o: ExportOptions, trackName: (Int) -> String,
                              to folder: URL, progress: @Sendable (Double, String) -> Void = { _, _ in }) async throws -> [URL] {
        let pl = plan(p), base = "Vektur Drum" + (p.currentKitName.map { " - " + safe($0) } ?? "") + " - " + (pl.chain ? "Chain" : "Pattern \(p.selectedPattern + 1)")
        let ext = o.format.rawValue
        if o.what == .master {
            progress(0, "Rendering…")
            let ch = try await render(p, library: library, options: o, solo: -1)
            progress(0.9, "Encoding \(ext.uppercased())…")
            let url = folder.appendingPathComponent(base + " - Master." + ext)
            try encode(ch, options: o).write(to: url)
            progress(1, "Saved"); return [url]
        }
        let tracks = stemTracks(p); guard !tracks.isEmpty else { throw ExportError.nothingToExport }
        var stems: [(Int, [[Float]])] = []
        for (i, t) in tracks.enumerated() {
            progress(Double(i) / Double(tracks.count + 1), "Stem \(i + 1) of \(tracks.count) (track \(t + 1))")
            stems.append((t, try await render(p, library: library, options: o, solo: t)))
        }
        let len = stems.map { $0.1[0].count }.max() ?? 0
        let dir = folder.appendingPathComponent(base + " - Stems", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var urls: [URL] = []
        for (t, ch) in stems {
            let padded = ch.map { $0 + [Float](repeating: 0, count: len - $0.count) }
            let url = dir.appendingPathComponent(base + " - " + String(format: "%02d ", t + 1) + safe(trackName(t)) + "." + ext)
            try encode(padded, options: o).write(to: url); urls.append(url)
        }
        progress(1, "Saved \(urls.count) stems"); return urls
    }

    static func render(_ p: DrumProject, library: SampleLibrary?, options o: ExportOptions, solo: Int) async throws -> [[Float]] {
        guard let e = vd_engine_create(Double(o.sampleRate), 4096) else { throw ExportError.engine }
        defer { vd_engine_destroy(e) }
        let keeper = AUStateKeeper(engine: e, library: library)
        await keeper.loadForOffline(p)
        var c = vd_command(); c.type = UInt16(VD_CMD_ENABLE.rawValue); c.u.value = 1; _ = vd_engine_send(e, &c)
        let body = vd_engine_offline_length(e, p.tempo), cap = body + UInt64(Double(tailMaxSeconds) * Double(o.sampleRate))
        var L = [Float](repeating: 0, count: Int(cap)), R = L
        var cfg = vd_offline_config(); cfg.tempo = p.tempo; cfg.solo_track = Int32(solo); cfg.ring_out = o.ringOut ? 1 : 0; cfg.tail_max_seconds = tailMaxSeconds
        let n = L.withUnsafeMutableBufferPointer { lb in R.withUnsafeMutableBufferPointer { rb in vd_engine_render_offline(e, &cfg, lb.baseAddress, rb.baseAddress, cap) } }
        vd_engine_collect_garbage(e)
        return [Array(L.prefix(Int(n))), Array(R.prefix(Int(n)))]
    }
    static func encode(_ ch: [[Float]], options o: ExportOptions) throws -> Data {
        var out: UnsafeMutablePointer<UInt8>? = nil
        let size = ch[0].withUnsafeBufferPointer { a in ch[1].withUnsafeBufferPointer { b -> Int in
            var ptrs: [UnsafePointer<Float>?] = [a.baseAddress, b.baseAddress]
            return vd_encode(o.fileFormat, &ptrs, 2, UInt32(ch[0].count), UInt32(o.sampleRate), o.quality, &out)
        } }
        guard size > 0, let out else { throw ExportError.encode }
        defer { vd_encode_free(out) }
        return Data(bytes: out, count: size)
    }
    static func safe(_ s: String) -> String {
        String(s.unicodeScalars.filter { !"\\/:*?\"<>|".unicodeScalars.contains($0) }).trimmingCharacters(in: .whitespaces).prefix(60).description
    }
}
