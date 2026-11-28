// TEMPORARY (removed when each window lands in this branch): build scaffolding so the panel compiles while the
// remaining windows are ported.
import SwiftUI
struct PresetsWindow: View { let c: DrumController; var body: some View { ModalSheet(c: c, title: "VEKTUR DRUM PRESETS") { EmptyView() } } }
struct ModWindow: View { let c: DrumController; var body: some View { ModalSheet(c: c, title: "MOD") { EmptyView() } } }
struct BreakLabWindow: View { let c: DrumController; var body: some View { ModalSheet(c: c, title: "BREAK LAB") { EmptyView() } } }
struct SettingsWindow: View { let c: DrumController; var body: some View { ModalSheet(c: c, title: "SETTINGS") { EmptyView() } } }
