// Vektur Drum — the Swift-facing audio contracts. SwiftUI and the app talk only to these; none of them expose DSP
// internals. Implementations: DrumEngine (wraps vd_engine), VekturDrumAudioUnit (AUv3), StandaloneAudioHost.
import Foundation
import VekturDrumCore

/// Structural edits (not automatable). Mirrors vd_command_type.
public enum EngineCommand: Sendable {
    case setStep(pattern: Int, track: Int, step: Int, Step?)
    case setTrackLayout(pattern: Int, track: Int, length: Int, division: StepDivision)
    case setBars(pattern: Int, Pattern.Bars)
    case setChain([Int], enabled: Bool)
    case selectPattern(Int)                  // switches at pattern end while playing
    case transport(play: Bool)               // play starts on the next beat
    case recordArm(Bool)
    case setTrackCount(Int)                  // 6…12
    case note(track: Int, velocity: Float)   // pads
    case enable(Bool)
    case panic
    case setWire(slot: Int, ModWire?)        // NEW: nil empties the slot
    case setSlice(slot: Int, SlicerSlot)     // NEW: one slice of the Slicer program
    case setPatternSlicer(pattern: Int, Bool?)   // NEW (0.9): nil follows SLICER, false keeps the pattern dry, true slices it
    case noteSlice(track: Int, slice: Int, velocity: Float)   // NEW (0.9): a BREAK LAB slice pad (REC records the slice)
    case setLfoPoints(lfo: Int, start: Int, [Float])         // NEW (0.9.1): up to 8 points of an LFO's drawn shape
}

/// What the UI reads at display rate. Mirrors vd_telemetry.
public struct EngineTelemetry: Sendable {
    public enum Transport: UInt8, Sendable { case stopped, waiting, running }
    public var transport: Transport
    public var currentPattern: Int
    public var chainPosition: Int
    public var trackCount: Int
    public var outputLevel: Float
    public var beat: Double
    public var currentStep: [Int]           // per track, −1 = none
    public var hitCount: [UInt32]           // per track; a change = a hit (LEDs, pads)
    public var envelope: [Float]            // per track, 0…1
    public var modSources: [Float] = []     // NEW: LFO 1–3, envelope (0…1), chaos — for the meters on the source chips
    public var slicerSlice: Int = -1        // NEW: the slice playing (−1 = Slicer off), for the program's live highlight
    public var slicerAction: Int = 0        // NEW: its action after density / evolve / hold
    public var modulatedDials: [ModulatedDial] = []   // NEW (0.7): every dial a wire moves, and where it is now → the light on its rim
}
public struct ModulatedDial: Sendable { public var parameter: ParameterID; public var position: Float }   // position 0…1 of the dial's travel

public struct RecordedHit: Sendable { public var pattern, track, step: Int; public var velocity: Float; public var slice: Int = 0 }   // slice (0.9): 0 = the track's

/// Control surface of one engine instance. Thread rules follow vd_engine.h: call from the main actor.
@MainActor
public protocol DrumEngineControl: AnyObject {
    func setParameter(_ id: ParameterID, _ value: Double)
    func parameter(_ id: ParameterID) -> Double
    @discardableResult func send(_ command: EngineCommand) -> Bool
    func setSample(_ sample: DecodedSample?, track: Int)
    /// NEW (0.9): the sample as the engine plays it on this track — its slices prepared (stretched for the tune mode) when it has any.
    func setSample(_ sample: DecodedSample?, track: Int, slices: SampleSlices?, values: [String: Double], tempo: Double)
    func telemetry() -> EngineTelemetry?
    func drainRecordedHits() -> [RecordedHit]
    /// Rebuilds the engine's mirror from the model: after loading, an engine reset or a sample-rate change.
    func sync(from project: DrumProject)
}

/// Where musical time comes from.
public enum ClockSource: Sendable, Equatable {
    case internalClock                       // standalone: DrumProject.tempo
    case host                                // AUv3: the host's musical context + transport
    case midiClock                           // NEW (planned): external MIDI clock in the standalone app
}

/// The standalone app's audio host: session, engine, lifecycle. The AUv3 needs none of this — the host app does it.
@MainActor
public protocol StandaloneAudioHosting: AnyObject {
    var engine: DrumEngineControl? { get }
    var isRunning: Bool { get }
    /// Configures AVAudioSession (.playback), loads VekturDrumAudioUnit in-process into AVAudioEngine and starts.
    func start() async throws
    func stop()
    /// Called by the host on interruptions, route changes, media-services reset and sample-rate changes:
    /// stop or restart audio and resync the engine; the project is never lost.
    var onEngineRebuilt: (() -> Void)? { get set }
}

/// MIDI into the standalone app (CoreMIDI). In the AUv3, MIDI comes through the render block instead.
public protocol MIDIInputDelegate: AnyObject {
    func midiReceived(status: UInt8, data1: UInt8, data2: UInt8, hostTime: UInt64)
}
