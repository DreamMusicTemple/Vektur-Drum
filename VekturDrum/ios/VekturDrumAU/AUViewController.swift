import CoreAudioKit
import AudioToolbox
import AVFoundation
import SwiftUI
import VekturDrumAudio
import VekturDrumCore

public final class VekturDrumAUViewController: CoreAudioKit.AUViewController, AUAudioUnitFactory {
    private var drumUnit: VekturDrumAudioUnit?
    private var engineControl: DrumEngine?
    private var projectModel: DrumProjectModel?
    private var hostingController: UIHostingController<DrumSequencerView>?

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        preferredContentSize = CGSize(width: 620, height: 560)

        guard let unit = drumUnit, let rawEngine = unit.engine else {
            let label = UILabel()
            label.text = "VEKTUR DRUM"
            label.font = .boldSystemFont(ofSize: 24)
            label.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(label)
            NSLayoutConstraint.activate([
                label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
                label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
            ])
            return
        }

        let model = DrumProjectModel(project: unit.keeper?.currentProject() ?? DrumProject())
        let control = DrumEngine(borrowing: rawEngine)
        let sequencer = DrumSequencerView(
            model: model,
            engine: control,
            audioReady: true,
            onProjectEdited: { [weak unit] project in
                unit?.keeper?.update { $0 = project }
            }
        )
        let hosting = UIHostingController(rootView: sequencer)
        addChild(hosting)
        hosting.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hosting.view)
        NSLayoutConstraint.activate([
            hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        hosting.didMove(toParent: self)

        projectModel = model
        engineControl = control
        hostingController = hosting
    }

    public func createAudioUnit(with componentDescription: AudioComponentDescription) throws -> AUAudioUnit {
        let unit = try VekturDrumAudioUnit(componentDescription: componentDescription, options: [])
        drumUnit = unit
        return unit
    }
}
