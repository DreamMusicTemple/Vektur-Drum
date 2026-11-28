// Vektur Drum — the factory kits (88 + INIT: the Vektur Pulse kits, Jungle Metal Grain, FM Percussion Lab, and 10 each of IDM,
// Techno, Lo-Fi & Downtempo, Hard Trance & Psytrance, 80s Electro, Breakbeat and Ambient). Resources/FactoryKits.json is generated from the web app by
// tools/gen_factory.mjs — each kit a vektur-drum-state document, read with the same StateCodec as songs, so the native
// kits are exactly the web kits.
import Foundation

public enum FactoryKits {
    private struct File: Decodable { var format: String; var version: Int; var kits: [Entry] }
    private struct Entry: Decodable { var name: String; var category: String; var bpm: Double?; var init_: Bool?; var state: AnyJSON
        enum CodingKeys: String, CodingKey { case name, category, bpm, init_ = "init", state } }
    /// Keeps a kit's state as raw JSON so StateCodec reads it exactly as it reads a song file.
    private struct AnyJSON: Decodable {
        let data: Data
        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            let v = try c.decode(JSONValue.self)
            data = try JSONSerialization.data(withJSONObject: v.any)
        }
    }
    private enum JSONValue: Decodable {
        case n(Double), s(String), b(Bool), a([JSONValue]), o([String: JSONValue]), null
        init(from d: Decoder) throws {
            let c = try d.singleValueContainer()
            if c.decodeNil() { self = .null } else if let x = try? c.decode(Bool.self) { self = .b(x) } else if let x = try? c.decode(Double.self) { self = .n(x) }
            else if let x = try? c.decode(String.self) { self = .s(x) } else if let x = try? c.decode([JSONValue].self) { self = .a(x) } else { self = .o(try c.decode([String: JSONValue].self)) }
        }
        var any: Any { switch self { case .n(let x): return x; case .s(let x): return x; case .b(let x): return x; case .a(let x): return x.map(\.any); case .o(let x): return x.mapValues(\.any); case .null: return NSNull() } }
    }

    /// All factory kits, in browser order, from this package's own FactoryKits.json.
    /// (`Bundle.module` is internal, so it can't be a public default argument: hence two overloads.)
    public static func load() -> [Kit] { load(bundle: .module) }

    /// All factory kits from FactoryKits.json in `bundle`. Empty if the resource is missing (never crashes the host).
    public static func load(bundle: Bundle) -> [Kit] {
        guard let url = bundle.url(forResource: "FactoryKits", withExtension: "json"), let d = try? Data(contentsOf: url),
              let f = try? JSONDecoder().decode(File.self, from: d) else { return [] }
        return f.kits.compactMap { e in
            guard let r = try? StateCodec.decode(e.state.data, librarySamples: []) else { return nil }
            var k = Kit(name: e.name, category: e.category.isEmpty ? nil : e.category, project: r.project)
            k.tempo = e.bpm
            return k
        }
    }
    /// The style filters of the preset browser (as the web app's).
    public static let styles = ["IDM", "Techno", "Lo-Fi & Downtempo", "Hard Trance", "Psytrance", "80s Electro", "Breakbeat", "Ambient"]
    /// INIT: the blank kit (every parameter at its default, empty patterns, no samples).
    public static func initKit(in kits: [Kit]) -> Kit? { kits.first { $0.isInit } }
}
