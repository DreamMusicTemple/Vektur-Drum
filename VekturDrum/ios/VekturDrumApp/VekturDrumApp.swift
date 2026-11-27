import SwiftUI
import VekturDrumCore

@main
struct VekturDrumApp: App {
    @State private var project = DrumProject()
    var body: some Scene {
        WindowGroup {
            DrumHomeView(project: $project)
        }
    }
}

struct DrumHomeView: View {
    @Binding var project: DrumProject
    @State private var playing = false
    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Text("VEKTUR DRUM").font(.largeTitle.bold())
                Text("Native drum machine • 12 tracks • 8 patterns")
                    .font(.subheadline).foregroundStyle(.secondary)
                HStack {
                    Text("TEMPO")
                    Spacer()
                    Text("\(Int(project.tempo)) BPM").monospacedDigit()
                }
                Slider(value: $project.tempo, in: 40...240, step: 1)
                HStack {
                    ForEach(0..<8, id: \.self) { p in
                        Button("\(p + 1)") { project.selectedPattern = p }
                            .buttonStyle(.borderedProminent)
                            .tint(project.selectedPattern == p ? .orange : .gray)
                    }
                }
                Text("TRACKS: \(project.trackCount)")
                Button(playing ? "STOP" : "PLAY") { playing.toggle() }
                    .font(.headline).frame(maxWidth: .infinity).padding()
                    .background(.orange, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.black)
            }.padding()
        }
    }
}
