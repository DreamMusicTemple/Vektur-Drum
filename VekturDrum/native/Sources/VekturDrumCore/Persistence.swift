// Vektur Drum — persistence and library contracts.
// The app and the AUv3 extension share kits and samples through the App Group container, so a kit saved in the
// app appears in the plug-in inside a DAW and the other way round. A project inside a host is saved by the host
// (AUAudioUnit.fullState); in the standalone app it is a document.
import Foundation

/// Where shared files live: the App Group container (Kits/, Samples/), so app and extension see the same library.
public protocol LibraryLocation: Sendable {
    var kitsDirectory: URL { get }
    var samplesDirectory: URL { get }
}

public protocol KitLibrary: Sendable {
    func factoryKits() -> [Kit]
    func userKits() throws -> [Kit]
    func save(_ kit: Kit) throws
    func delete(_ id: Kit.ID) throws
    /// Reads a `vektur-pulse-presets` (v1, from Vektur VJ) or Vektur Drum kit file; adds any samples it carries.
    func importKits(from url: URL) throws -> [Kit]
    func export(_ kits: [Kit], to url: URL) throws
    // NEW: user banks (KitBanks.count × KitBanks.slots)
    func bank(_ number: Int) -> KitBank
    func saveBank(_ bank: KitBank) throws
}

/// NEW: 20 user banks of 99 presets each, beside the factory kits — in the App Group (Kits/Banks/NN.json), so the app and
/// every plug-in instance share them (web app: IndexedDB 'bank:N', same shape). A song's own 16 slots stay with the song.
public enum KitBanks {
    public static let count = 20, slots = 99
}
public struct KitBank: Codable, Hashable, Sendable, Identifiable {
    public var number: Int                    // 1…99
    public var name: String
    public var slots: [Kit?]                  // always KitBanks.slots entries
    public var id: Int { number }
    public init(number: Int, name: String? = nil, slots: [Kit?] = []) {
        self.number = min(max(number, 1), KitBanks.count)
        self.name = name ?? String(format: "Bank %02d", self.number)
        self.slots = Array((slots + Array(repeating: nil, count: KitBanks.slots)).prefix(KitBanks.slots))
    }
    public var count: Int { slots.lazy.compactMap { $0 }.count }
    /// Fills empty slots in order; returns how many did not fit.
    @discardableResult public mutating func add(_ kits: [Kit]) -> Int {
        var left = kits[...]
        for i in slots.indices where slots[i] == nil { guard let k = left.popFirst() else { break }; slots[i] = k }
        return left.count
    }
}

/// Banks on disk: one small JSON file per bank, written atomically (a crash never leaves half a bank).
public struct FileKitBankStore: Sendable {
    public let directory: URL
    public init(directory: URL) { self.directory = directory }
    private func url(_ n: Int) -> URL { directory.appendingPathComponent(String(format: "%02d.json", n)) }
    public func bank(_ n: Int) -> KitBank {
        guard let d = try? Data(contentsOf: url(n)), var b = try? JSONDecoder().decode(KitBank.self, from: d) else { return KitBank(number: n) }
        b = KitBank(number: n, name: String(b.name.prefix(40)), slots: b.slots)   // shape and range checked
        return b
    }
    public func save(_ b: KitBank) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let enc = JSONEncoder(); enc.outputFormatting = [.sortedKeys]
        try enc.encode(KitBank(number: b.number, name: b.name, slots: b.slots)).write(to: url(b.number), options: .atomic)
    }
    /// Names and preset counts of all the banks, for the bank picker.
    public func summaries() -> [(number: Int, name: String, count: Int)] { (1...KitBanks.count).map { n in let b = bank(n); return (n, b.name, b.count) } }
}

/// Decoded audio for a sample, ready to hand to the engine (built off the audio thread).
public struct DecodedSample: Sendable {
    public var channels: [[Float]]        // 1 or 2
    public var sampleRate: Double

    public init(channels: [[Float]], sampleRate: Double) {
        self.channels = channels
        self.sampleRate = sampleRate
    }
}

public protocol SampleLibrary: Sendable {
    /// Copies a user-picked WAV/FLAC/AIFF/CAF (security-scoped URL) into the library; returns its ref (dedupes by hash).
    func importSample(from url: URL) async throws -> SampleRef
    func decoded(_ ref: SampleRef) async throws -> DecodedSample     // cached; capped length (30 s, as Vektur Pulse)
    func contains(_ ref: SampleRef) -> Bool
    /// Removes files no project, kit or open instance refers to.
    func prune(keeping refs: Set<SampleRef>) throws
    // ---- for saving songs with their samples (AUAudioUnit.fullState) — synchronous, never on the audio thread
    func allKeys() -> Set<String>
    func fileBytes(key: String) -> (name: String, fmt: String, bytes: Data)?
    /// Adds a sample carried inside a song (checks the bytes hash to `key`; existing keys are left alone).
    func store(bytes: Data, key: String, name: String, fmt: String) throws
}

public protocol ProjectStore: Sendable {
    func encode(_ project: DrumProject) throws -> Data               // also used for AUAudioUnit.fullState
    func decode(_ data: Data) throws -> DrumProject                  // validates and clamps, never trusts input
}
