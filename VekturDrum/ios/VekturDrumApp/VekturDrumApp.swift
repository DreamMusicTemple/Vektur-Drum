import SwiftUI
import VekturDrumCore

@main
struct VekturDrumApp: App {
    @StateObject private var host = StandaloneAudioHost()
    @StateObject private var model = DrumProjectModel()

    var body: some Scene {
        WindowGroup {
            DrumSequencerView(model: model, engine: host.engine, audioReady: host.isRunning)
                .task {
                    do {
                        try await host.start()
                    } catch {
                        // The screen remains available and reports audio readiness through the host state.
                    }
                }
        }
    }
}
