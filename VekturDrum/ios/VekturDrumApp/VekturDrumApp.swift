import SwiftUI
import VekturDrumCore

@main
struct VekturDrumApp: App {
    @StateObject private var host = StandaloneAudioHost()
    @StateObject private var model = DrumProjectModel()
    @State private var startupError: String?
    @State private var showStartupError = false

    var body: some Scene {
        WindowGroup {
            DrumSequencerView(model: model, engine: host.engine, audioReady: host.isRunning)
                .alert("Audio Engine Could Not Start", isPresented: $showStartupError) {
                    Button("OK", role: .cancel) { }
                } message: {
                    Text(startupError ?? "The audio engine could not be started.")
                }
                .task {
                    do {
                        // Use the song's saved internal-clock tempo for standalone playback.
                        host.tempo = model.project.tempo
                        try await host.start()
                    } catch {
                        startupError = error.localizedDescription
                        showStartupError = true
                    }
                }
        }
    }
}
