import SwiftUI
import VekturDrumCore

@main
struct VekturDrumApp: App {
    @StateObject private var host = StandaloneAudioHost()
    @State private var project = DrumProject()

    var body: some Scene {
        WindowGroup {
            DrumHomeView(project: $project, host: host)
                .task {
                    do {
                        try await host.start()
                    } catch {
                        // The screen remains available and exposes the audio-start failure.
                    }
                }
        }
    }
}

struct DrumHomeView: View {
    @Binding var project: DrumProject
    @ObservedObject var host: StandaloneAudioHost
    @State private var playing = false
    @State private var audioError: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("VEKTUR DRUM").font(.largeTitle.bold())
                        Text(host.isRunning ? "NATIVE AUDIO ENGINE READY" : "AUDIO ENGINE STOPPED")
                            .font(.caption2.monospaced())
                            .foregroundStyle(host.isRunning ? .green : .secondary)
                    }
                    Spacer()
                    Text("\(Int(project.tempo)) BPM")
                        .font(.headline.monospacedDigit())
                }

                HStack(spacing: 6) {
                    ForEach(0..<8, id: \.self) { pattern in
                        Button("\(pattern + 1)") {
                            project.selectedPattern = pattern
                            _ = host.engine?.send(.selectPattern(pattern))
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(project.selectedPattern == pattern ? .orange : .gray)
                    }
                }

                HStack {
                    Text("PATTERN \(project.selectedPattern + 1)")
                        .font(.caption.bold())
                    Spacer()
                    Text("\(project.trackCount) TRACKS · 16 STEPS")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }

                ScrollView([.vertical, .horizontal]) {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(0..<project.trackCount, id: \.self) { track in
                            HStack(spacing: 5) {
                                Text(String(format: "%02d", track + 1))
                                    .font(.caption.monospaced().bold())
                                    .frame(width: 25)
                                ForEach(0..<16, id: \.self) { step in
                                    let active = project.patterns[project.selectedPattern].tracks[track].steps[step] != nil
                                    Button {
                                        toggleStep(track: track, step: step)
                                    } label: {
                                        RoundedRectangle(cornerRadius: 4)
                                            .fill(active ? Color.orange : Color.secondary.opacity(0.18))
                                            .frame(width: 30, height: 34)
                                            .overlay {
                                                if step % 4 == 0 {
                                                    RoundedRectangle(cornerRadius: 4)
                                                        .stroke(Color.primary.opacity(0.35), lineWidth: 1)
                                                }
                                            }
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Track \(track + 1), step \(step + 1), \(active ? "on" : "off")")
                                }
                            }
                        }
                    }
                    .padding(.vertical, 8)
                }

                if let audioError {
                    Text(audioError).font(.footnote).foregroundStyle(.red)
                }

                Button {
                    guard let engine = host.engine else {
                        audioError = "Audio engine is not available."
                        return
                    }
                    playing.toggle()
                    _ = engine.send(.transport(play: playing))
                } label: {
                    Label(playing ? "STOP" : "PLAY", systemImage: playing ? "stop.fill" : "play.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .tint(playing ? .gray : .orange)
                .disabled(!host.isRunning)

            }
            .padding()
            .navigationTitle("Sequencer")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onChange(of: project.selectedPattern) { _, pattern in
            _ = host.engine?.send(.selectPattern(pattern))
        }
    }

    private func toggleStep(track: Int, step: Int) {
        let pattern = project.selectedPattern
        var value = project.patterns[pattern].tracks[track].steps[step]
        if value == nil {
            value = Step()
        } else {
            value = nil
        }
        project.patterns[pattern].tracks[track].steps[step] = value
        _ = host.engine?.send(.setStep(pattern: pattern, track: track, step: step, value))
    }
}
