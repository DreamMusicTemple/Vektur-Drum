// Vektur Drum — layout measurement for the parity check: views tagged with .measure("id") report their frame in the
// panel's coordinate space; the reference render writes them next to the images (compare with the web's element boxes).
import SwiftUI

struct FrameKey: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) { value.merge(nextValue()) { a, _ in a } }
}
enum Measure {
    @MainActor static var frames: [String: CGRect] = [:]
}
extension View {
    func measure(_ id: String) -> some View {
        background(GeometryReader { g in Color.clear.preference(key: FrameKey.self, value: [id: g.frame(in: .named("panel"))]) })
    }
}
