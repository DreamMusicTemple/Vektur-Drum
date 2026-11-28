// Vektur Drum — visual check against the web app. Launched with `-renderReference`, the app renders its panel (full
// height, like the web reference's full-page captures) at the reference widths into Documents/ui-native/<size>.png,
// at 2× like design/ui-reference. CI pulls these from the simulator and compares them with the web screenshots.
import SwiftUI
import VekturDrumCore

enum ReferenceRender {
    static let sizes: [(String, CGFloat)] = [("ipad13-landscape", 1366), ("ipad11-landscape", 1194), ("ipad11-portrait", 834),
                                            ("iphone-landscape", 852), ("iphone-portrait", 393)]
    static var requested: Bool { ProcessInfo.processInfo.arguments.contains("-renderReference") }

    @MainActor static func run(_ c: DrumController) async {
        try? await Task.sleep(for: .seconds(1))
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("ui-native", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        for (name, w) in sizes {
            let m = PanelMetrics(width: w), th = PanelTheme(c.theme)
            let view = DrumPanel(c: c).frame(width: m.sheetWidth).padding(.top, m.sheetTop).frame(width: w).background(th.chassis[5])
                .environment(\.panel, m).environment(\.theme, th).environment(\.referenceRender, true)
            let r = ImageRenderer(content: view); r.scale = 2; r.proposedSize = ProposedViewSize(width: w, height: nil)
            if let img = r.uiImage, let png = img.pngData() { try? png.write(to: dir.appendingPathComponent("\(name).png")) }
        }
        // frames from the live panel on screen (this simulator's width), for comparison with the web's element boxes
        let fr = Measure.frames.mapValues { ["x": $0.minX, "y": $0.minY, "w": $0.width, "h": $0.height] }
        if let j = try? JSONSerialization.data(withJSONObject: ["screenWidth": UIScreen.main.bounds.width, "frames": fr], options: [.sortedKeys, .prettyPrinted]) {
            try? j.write(to: dir.appendingPathComponent("frames-live.json"))
        }
        try? Data("done".utf8).write(to: dir.appendingPathComponent("DONE"))
    }
}
