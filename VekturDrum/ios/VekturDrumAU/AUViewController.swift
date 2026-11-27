import CoreAudioKit
import AudioToolbox
import AVFoundation
import VekturDrumAudio

public final class VekturDrumAUViewController: CoreAudioKit.AUViewController, AUAudioUnitFactory {
    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let label = UILabel()
        label.text = "VEKTUR DRUM"
        label.font = .boldSystemFont(ofSize: 24)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    public func createAudioUnit(with componentDescription: AudioComponentDescription) throws -> AUAudioUnit {
        try VekturDrumAudioUnit(componentDescription: componentDescription, options: [])
    }
}
