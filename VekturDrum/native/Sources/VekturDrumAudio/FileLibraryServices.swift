import AVFoundation
import CryptoKit
import Foundation
import VekturDrumCore

public struct AppGroupLibraryLocation: LibraryLocation {
    public let kitsDirectory: URL
    public let samplesDirectory: URL

    public init(groupIdentifier: String) throws {
        guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupIdentifier) else {
            throw NSError(domain: "VekturDrumLibrary", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "The App Group container is unavailable."])
        }
        kitsDirectory = root.appendingPathComponent("Kits", isDirectory: true)
        samplesDirectory = root.appendingPathComponent("Samples", isDirectory: true)
        try FileManager.default.createDirectory(at: kitsDirectory, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: samplesDirectory, withIntermediateDirectories: true)
    }
}

/// App Group-backed sample files shared by the standalone app and all AUv3 instances.
public final class FileSampleLibrary: SampleLibrary, @unchecked Sendable {
    private struct Metadata: Codable {
        var name: String
        var format: String
    }

    private let directory: URL
    private let lock = NSLock()
    private var decodedCache: [String: DecodedSample] = [:]

    public init(directory: URL) throws {
        self.directory = directory
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    public func importSample(from url: URL) async throws -> SampleRef {
        try await Task.detached(priority: .userInitiated) { [self] in
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let bytes = try Data(contentsOf: url)
            let key = Self.hash(bytes)
            let format = url.pathExtension.isEmpty ? "caf" : url.pathExtension.lowercased()
            try store(bytes: bytes, key: key, name: url.lastPathComponent, fmt: format)
            return SampleRef(key: key, name: url.lastPathComponent)
        }.value
    }

    public func decoded(_ ref: SampleRef) async throws -> DecodedSample {
        if let cached = lock.withLock({ decodedCache[ref.key] }) { return cached }
        guard let url = audioFileURL(for: ref.key) else {
            throw NSError(domain: "VekturDrumLibrary", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "Sample file is missing: \(ref.name)"])
        }
        let sample = try await Task.detached(priority: .userInitiated) {
            let file = try AVAudioFile(forReading: url)
            let format = file.processingFormat
            let maximumFrames = AVAudioFrameCount(max(0, min(file.length, Int64(format.sampleRate * 30))))
            guard maximumFrames > 0,
                  let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: maximumFrames) else {
                throw NSError(domain: "VekturDrumLibrary", code: 3,
                              userInfo: [NSLocalizedDescriptionKey: "The sample contains no readable audio."])
            }
            try file.read(into: buffer, frameCount: maximumFrames)
            guard let channels = buffer.floatChannelData else {
                throw NSError(domain: "VekturDrumLibrary", code: 4,
                              userInfo: [NSLocalizedDescriptionKey: "The sample could not be decoded as Float PCM."])
            }
            let count = Int(buffer.frameLength)
            let channelCount = min(2, Int(format.channelCount))
            let data = (0..<channelCount).map { channel in
                Array(UnsafeBufferPointer(start: channels[channel], count: count))
            }
            return DecodedSample(channels: data, sampleRate: format.sampleRate)
        }.value
        lock.withLock { decodedCache[ref.key] = sample }
        return sample
    }

    public func contains(_ ref: SampleRef) -> Bool {
        audioFileURL(for: ref.key) != nil
    }

    public func prune(keeping refs: Set<SampleRef>) throws {
        let keep = Set(refs.map(\.key))
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        for file in files where !keep.contains(file.deletingPathExtension().lastPathComponent) {
            try FileManager.default.removeItem(at: file)
        }
        lock.withLock { decodedCache = decodedCache.filter { keep.contains($0.key) } }
    }

    public func allKeys() -> Set<String> {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        return Set(files.filter { $0.pathExtension.lowercased() != "json" }.map { $0.deletingPathExtension().lastPathComponent })
    }

    public func fileBytes(key: String) -> (name: String, fmt: String, bytes: Data)? {
        guard let url = audioFileURL(for: key), let bytes = try? Data(contentsOf: url) else { return nil }
        let metadata = (try? Data(contentsOf: metadataURL(for: key)))
            .flatMap { try? JSONDecoder().decode(Metadata.self, from: $0) }
        return (metadata?.name ?? url.lastPathComponent, metadata?.format ?? url.pathExtension, bytes)
    }

    public func store(bytes: Data, key: String, name: String, fmt: String) throws {
        guard Self.hash(bytes) == key else {
            throw NSError(domain: "VekturDrumLibrary", code: 5,
                          userInfo: [NSLocalizedDescriptionKey: "Sample hash does not match its library key."])
        }
        let safeFormat = fmt.lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }
        let ext = safeFormat.isEmpty ? "caf" : safeFormat
        try bytes.write(to: directory.appendingPathComponent("\(key).\(ext)"), options: .atomic)
        let metadata = Metadata(name: name, format: ext)
        let data = try JSONEncoder().encode(metadata)
        try data.write(to: metadataURL(for: key), options: .atomic)
        lock.withLock { decodedCache.removeValue(forKey: key) }
    }

    private func audioFileURL(for key: String) -> URL? {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        return files.first {
            $0.deletingPathExtension().lastPathComponent == key && $0.pathExtension.lowercased() != "json"
        }
    }

    private func metadataURL(for key: String) -> URL {
        directory.appendingPathComponent("\(key).json")
    }

    private static func hash(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}

/// JSON kit library and the existing 20 × 99 user-bank store.
public struct FileKitLibrary: KitLibrary, Sendable {
    public let directory: URL
    private let bankStore: FileKitBankStore

    public init(directory: URL) {
        self.directory = directory
        self.bankStore = FileKitBankStore(directory: directory.appendingPathComponent("Banks", isDirectory: true))
    }

    public func factoryKits() -> [Kit] { FactoryKits.load() }

    public func userKits() throws -> [Kit] {
        let userDirectory = directory.appendingPathComponent("User", isDirectory: true)
        try FileManager.default.createDirectory(at: userDirectory, withIntermediateDirectories: true)
        let files = try FileManager.default.contentsOfDirectory(at: userDirectory, includingPropertiesForKeys: nil)
        return try files.filter { $0.pathExtension.lowercased() == "json" }.map {
            try JSONDecoder().decode(Kit.self, from: Data(contentsOf: $0))
        }
    }

    public func save(_ kit: Kit) throws {
        let userDirectory = directory.appendingPathComponent("User", isDirectory: true)
        try FileManager.default.createDirectory(at: userDirectory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(kit)
        try data.write(to: userDirectory.appendingPathComponent("\(kit.id.uuidString).json"), options: .atomic)
    }

    public func delete(_ id: Kit.ID) throws {
        let url = directory.appendingPathComponent("User", isDirectory: true)
            .appendingPathComponent("\(id.uuidString).json")
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }

    public func importKits(from url: URL) throws -> [Kit] {
        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        if let kits = try? decoder.decode([Kit].self, from: data) { return kits }
        if let kit = try? decoder.decode(Kit.self, from: data) { return [kit] }
        if let state = try? StateCodec.decode(data, librarySamples: []) {
            return [Kit(name: state.project.name, category: nil, project: state.project)]
        }
        throw NSError(domain: "VekturDrumLibrary", code: 6,
                      userInfo: [NSLocalizedDescriptionKey: "This file is not a supported Vektur Drum kit or project."])
    }

    public func export(_ kits: [Kit], to url: URL) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(kits).write(to: url, options: .atomic)
    }

    public func bank(_ number: Int) -> KitBank { bankStore.bank(number) }
    public func saveBank(_ bank: KitBank) throws { try bankStore.save(bank) }
}

public struct StateProjectStore: ProjectStore, Sendable {
    public init() {}
    public func encode(_ project: DrumProject) throws -> Data {
        try StateCodec.encode(project, writer: "Vektur Drum")
    }
    public func decode(_ data: Data) throws -> DrumProject {
        try StateCodec.decode(data, librarySamples: []).project
    }
}
