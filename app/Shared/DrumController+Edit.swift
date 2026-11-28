// Vektur Drum — the panel's editing actions, ported from web/src/panel.js (pattern edits, BARS, CHAIN, LENGTH, DIV, the
// step editor, pads), web/src/undo.js (undo / redo) and toast(). Every change goes to the song (DrumController.edit →
// the unit's AUStateKeeper) and to the engine through the existing commands and parameters — nothing new in the engine.
import SwiftUI
import VekturDrumCore
import VekturDrumAudio

/// The windows the top strip opens (web: the modals).
enum PanelWindow: Equatable { case presets, slicer, mod, breakLab, generate, export, settings, ring(track: Int, step: Int), pads }

extension DrumController {
    // MARK: - toast (web toast(): a line at the bottom for ~2 s)
    func toast(_ s: String) {
        toastText = s; toastTimer?.invalidate()
        toastTimer = Timer.scheduledTimer(withTimeInterval: 2.2, repeats: false) { [weak self] _ in MainActor.assumeIsolated { self?.toastText = nil } }
    }

    // MARK: - pushing the music to the engine (web drumPushPattern / drumPushChain)
    func pushPattern(_ p: Int) {
        let pt = project.patterns[p]
        engine.send(.setBars(pattern: p, pt.bars)); engine.send(.setPatternSlicer(pattern: p, pt.slicer))
        for (t, tr) in pt.tracks.prefix(TrackLimits.capacity).enumerated() {
            engine.send(.setTrackLayout(pattern: p, track: t, length: tr.length, division: tr.division))
            for (s, st) in tr.steps.prefix(TrackLimits.steps).enumerated() { engine.send(.setStep(pattern: p, track: t, step: s, st)) }
        }
    }
    func pushChain() { engine.send(.setChain(Array(project.chain.prefix(16)), enabled: project.chainEnabled)) }

    // MARK: - PATTERN row: COPY · PASTE · CLEAR · SLICER mode
    func copyPattern() { clip = project.patterns[project.selectedPattern]; toast("Pattern \(project.selectedPattern + 1) copied") }
    func pastePattern() {
        guard let c = clip else { return }
        let p = project.selectedPattern; edit { $0.patterns[p] = c }; pushPattern(p)
    }
    func clearPattern() { let p = project.selectedPattern; edit { $0.patterns[p] = Pattern() }; pushPattern(p) }
    /// SONG → ON → OFF → SONG (web: pat.sl −1 → 1 → 0 → −1).
    func cyclePatternSlicer() {
        let p = project.selectedPattern, v = project.patterns[p].slicer
        let n: Bool? = v == nil ? true : v! ? false : nil
        edit { $0.patterns[p].slicer = n }; engine.send(.setPatternSlicer(pattern: p, n))
    }
    func setBars(_ b: Pattern.Bars) { let p = project.selectedPattern; edit { $0.patterns[p].bars = b }; engine.send(.setBars(pattern: p, b)) }

    // MARK: - CHAIN
    func toggleChain() { edit { $0.chainEnabled.toggle() }; pushChain() }
    func chainAdd(_ pattern: Int, at i: Int? = nil) {
        guard project.chain.count < 16 else { return }
        edit { $0.chain.insert(pattern, at: min(i ?? $0.chain.count, $0.chain.count)) }; pushChain()
    }
    func chainRemove(_ i: Int) { guard project.chain.indices.contains(i) else { return }; edit { $0.chain.remove(at: i) }; pushChain() }
    func chainMove(_ i: Int, to j: Int) {
        guard project.chain.indices.contains(i), i != j else { return }
        edit { let m = $0.chain.remove(at: i); $0.chain.insert(m, at: min(max(0, j), $0.chain.count)) }; pushChain()
    }
    func chainClear() { edit { $0.chain = []; $0.chainEnabled = false }; pushChain() }

    // MARK: - LENGTH · DIV
    func nudgeLength(track t: Int, by d: Int) {
        let p = project.selectedPattern
        let n = min(16, max(1, project.patterns[p].tracks[t].length + d))
        edit { $0.patterns[p].tracks[t].length = n }
        engine.send(.setTrackLayout(pattern: p, track: t, length: n, division: project.patterns[p].tracks[t].division))
    }
    func setDivision(track t: Int, _ d: StepDivision) {
        let p = project.selectedPattern
        edit { $0.patterns[p].tracks[t].division = d }
        engine.send(.setTrackLayout(pattern: p, track: t, length: project.patterns[p].tracks[t].length, division: d))
    }

    // MARK: - steps (web stepEvents / selectStep / renderDrumStep)
    /// A tap: with EDIT lit it selects the step; otherwise it switches it (on at velocity .8, ratchet 1) and selects it when on.
    func tapStep(track t: Int, step s: Int) {
        if editMode { selectStep(track: t, step: s); return }
        let p = project.selectedPattern
        let new: Step? = project.patterns[p].tracks[t].steps[s] == nil ? Step() : nil
        edit { $0.patterns[p].tracks[t].steps[s] = new }
        engine.send(.setStep(pattern: p, track: t, step: s, new))
        if new != nil { selectedTrack = t; selectedStep = s }
    }
    /// A hold (380 ms), or a tap with EDIT: the step goes to the STEP section.
    func selectStep(track t: Int, step s: Int, quiet: Bool = false) {
        selectedTrack = t; selectedStep = s
        if !quiet { toast("Editing track \(t + 1), step \(s + 1)") }
    }
    var selectedStepValue: Step? {
        guard selectedStep >= 0 else { return nil }
        return project.patterns[project.selectedPattern].tracks[selectedTrack].steps[selectedStep]
    }
    /// Changes the selected step (switching it on at [.8, 0, 0, 1] first if it is off, as web ensure()).
    func updateStep(_ f: (inout Step) -> Void) {
        guard selectedStep >= 0 else { return }
        let p = project.selectedPattern, t = selectedTrack, s = selectedStep
        var st = project.patterns[p].tracks[t].steps[s] ?? Step()
        f(&st)
        edit { $0.patterns[p].tracks[t].steps[s] = st }
        engine.send(.setStep(pattern: p, track: t, step: s, st))
    }
    func toggleSelectedStep() {
        guard selectedStep >= 0 else { return }
        let p = project.selectedPattern, t = selectedTrack, s = selectedStep
        let new: Step? = project.patterns[p].tracks[t].steps[s] == nil ? Step() : nil
        edit { $0.patterns[p].tracks[t].steps[s] = new }
        engine.send(.setStep(pattern: p, track: t, step: s, new))
    }

    // MARK: - pads (web drumHit: velocity 50…127 by height; selects the track)
    func hitPad(_ t: Int, velocity127: Double) {
        if on { engine.send(.note(track: t, velocity: Float(min(127, max(1, velocity127)) / 127))) }
        lastPadVelocity = Int(velocity127.rounded())
        if selectedTrack != t { selectedTrack = t }
    }

    // MARK: - undo / redo (web undo.js)
    func dirty() {
        guard !undoApplying else { return }
        undoTimer?.invalidate()
        undoTimer = Timer.scheduledTimer(withTimeInterval: 0.45, repeats: false) { [weak self] _ in MainActor.assumeIsolated { self?.undoCapture() } }
        undoVersion &+= 1
    }
    func undoCapture() {
        undoTimer?.invalidate(); undoTimer = nil
        guard let k = unit.keeper else { return }
        var s = k.currentProject(); s.selectedPattern = 0
        defer { undoVersion &+= 1 }
        guard let cur = undoCur else { undoCur = s; return }
        if s == cur { return }
        undoBack.append(cur); if undoBack.count > 60 { undoBack.removeFirst() }
        undoCur = s; undoFwd = []
    }
    func canUndo(_ d: Int) -> Bool { _ = undoVersion; return d < 0 ? !undoBack.isEmpty || undoTimer != nil : !undoFwd.isEmpty }
    func undoStep(_ d: Int) {
        if undoTimer != nil { undoCapture() }
        guard let cur = undoCur else { return }
        if d < 0 { guard let s = undoBack.popLast() else { toast("Nothing to undo"); return }; undoFwd.append(cur); undoCur = s }
        else { guard let s = undoFwd.popLast() else { toast("Nothing to redo"); return }; undoBack.append(cur); undoCur = s }
        guard let snap = undoCur, let k = unit.keeper else { return }
        undoApplying = true
        let sel = project.selectedPattern
        // the song goes back without stopping the transport (web: stateApply + drumPushAll)
        k.applyKit(Kit(name: snap.currentKitName ?? "", category: nil, project: snap))
        k.update { $0.tempo = snap.tempo; $0.currentKitName = snap.currentKitName; $0.selectedPattern = sel }
        reloadFromKeeper()
        undoApplying = false
        undoVersion &+= 1
        toast(d < 0 ? "Undo" : "Redo")
    }

    // MARK: - track names for pads (web drumPadName)
    func padName(_ t: Int, max: Int) -> String {
        if Int(value("t\(t + 1).engine").rounded()) == 1 { return project.tracks[t].sample.map { abbreviate($0.name, max: max) } ?? "NO SAMPLE" }
        return trackName(t)
    }
    func engineKind(_ t: Int) -> Int { Int(value("t\(t + 1).engine").rounded()) }
}
