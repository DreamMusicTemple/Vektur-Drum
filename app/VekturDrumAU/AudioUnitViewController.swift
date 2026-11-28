// Vektur Drum — the AUv3 extension: vends VekturDrumAudioUnit for all three components (instrument, insert effect,
// music effect; the unit reads its component type) and shows the same panel as the app.
import SwiftUI
import CoreAudioKit
import VekturDrumCore
import VekturDrumAudio

public final class AudioUnitViewController: AUViewController, AUAudioUnitFactory {
    private var unit: VekturDrumAudioUnit?
    private var hosting: UIHostingController<AnyView>?

    public func createAudioUnit(with componentDescription: AudioComponentDescription) throws -> AUAudioUnit {
        let au = try VekturDrumAudioUnit(componentDescription: componentDescription, options: [])
        if let starter = DrumController.starterState() { au.keeper?.restore(starter, reason: .song) }   // a host's saved song replaces it
        unit = au
        DispatchQueue.main.async { [weak self] in self?.attachPanel() }
        return au
    }

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0x0c / 255, green: 0x0d / 255, blue: 0x0e / 255, alpha: 1)
        preferredContentSize = CGSize(width: 1024, height: 700)
        attachPanel()
    }

    private func attachPanel() {
        guard hosting == nil, isViewLoaded, let au = unit, let c = DrumController(unit: au) else { return }
        c.setOn(true)   // in a host the drum machine is live as soon as it loads
        let h = UIHostingController(rootView: AnyView(PanelRoot(controller: c)))
        addChild(h)
        h.view.translatesAutoresizingMaskIntoConstraints = false
        h.view.backgroundColor = .clear
        view.addSubview(h.view)
        NSLayoutConstraint.activate([
            h.view.leadingAnchor.constraint(equalTo: view.leadingAnchor), h.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            h.view.topAnchor.constraint(equalTo: view.topAnchor), h.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        h.didMove(toParent: self)
        hosting = h
    }
}
