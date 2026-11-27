import SwiftUI
import VekturDrumAudio
import VekturDrumCore

@MainActor
final class DrumProjectModel: ObservableObject {
    @Published var project: DrumProject

    init(project: DrumProject = DrumProject()) {
        self.project = project
    }
}

/// Shared native sequencer surface used by the standalone app and the AUv3 extension.
@MainActor
struct DrumSequencerView: View {
    @ObservedObject var model: DrumProjectModel
    let engine: DrumEngineControl?
    let audioReady: Bool
    var onProjectEdited: ((DrumProject) -> Void)? = nil

    @State private var playing = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("VEKTUR DRUM").font(.largeTitle.bold())
                        Text(audioReady ? "NATIVE AUDIO READY" : "AUDIO ENGINE STOPPED")
                            .font(.caption2.monospaced())
                            .foregroundStyle(audioReady ? .green : .secondary)
                    }
                    Spacer()
                    Text("\(Int(model.project.tempo)) BPM")
                        .font(.headline.monospacedDigit())
                }

                HStack(spacing: 6) {
                    ForEach(0..<8, id: \.self) { pattern in
                        Button("\(pattern + 1)") {
                            model.project.selectedPattern = pattern
                            _ = engine?.send(.selectPattern(pattern))
                            onProjectEdited?(model.project)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(model.project.selectedPattern == pattern ? .orange : .gray)
                    }
                }

                HStack {
                    Text("PATTERN \(model.project.selectedPattern + 1)")
                        .font(.caption.bold())
                    Spacer()
                    Text("\(model.project.trackCount) TRACKS · 16 STEPS")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }

                ScrollView([.vertical, .horizontal]) {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(0..<model.project.trackCount, id: \.self) { track in
                            HStack(spacing: 5) {
                                Text(String(format: "%02d", track + 1))
                                    .font(.caption.monospaced().bold())
                                    .frame(width: 25)
                                ForEach(0..<16, id: \.self) { step in
                                    let active = model.project.patterns[model.project.selectedPattern].tracks[track].steps[step] != nil
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

                Button {
                    guard let engine else { return }
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
                .disabled(!audioReady || engine == nil)
            }
            .padding()
            .navigationTitle("Sequencer")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func toggleStep(track: Int, step: Int) {
        let pattern = model.project.selectedPattern
        var project = model.project
        var value = project.patterns[pattern].tracks[track].steps[step]
        if value == nil {
            value = Step()
        } else {
            value = nil
        }
        project.patterns[pattern].tracks[track].steps[step] = value
        model.project = project
        _ = engine?.send(.setStep(pattern: pattern, track: track, step: step, value))
        onProjectEdited?(project)
    }
}
