// Vektur Drum — PRESETS (web/src/presets.js renderPresets): the factory kits by style, YOURS (the set's 16 slots or one of
// 20 banks of 99 on this device), and the actions on the selected preset. A drum preset is the kit with its 8 patterns
// and chain; loading one keeps your MIDI channel. Kits load through AUStateKeeper.applyKit (the transport keeps going).
import SwiftUI
import UniformTypeIdentifiers
import VekturDrumCore
import VekturDrumAudio

struct PresetsWindow: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let c: DrumController
    @State private var cat = "All"
    @State private var bank = 0                  // 0 = the set's 16 slots
    @State private var sel: (src: Character, i: Int)?
    @State private var naming: (slot: Int, name: String)?
    @State private var renaming: String?
    @State private var bankRename: String?
    @State private var confirmDelete = false
    @State private var confirmClear = false
    @State private var copyBank: String?
    @State private var importing = false
    @State private var exportURL: URL?
    @State private var version = 0
    static let big = ["IDM", "Techno", "Lo-Fi & Downtempo", "Hard Trance", "Psytrance"]
    var body: some View {
        let F = KitStore.factory, u = slots, cur = c.project.currentKitName ?? ""
        let cats = Set(F.map { $0.category ?? "Other" }), groups = ["All"] + Self.big.filter { cats.contains($0) } + ["More"]
        let selKit: Kit? = sel.flatMap { $0.src == "f" ? F[safe: $0.i] : u[safe: $0.i] ?? nil }
        let userSel = sel?.src == "u", isBank = bank > 0
        ModalSheet(c: c, title: "VEKTUR DRUM PRESETS", width: 60, pad: (0.7, 0.9)) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Current: \(cur.isEmpty ? "—" : cur) · a drum preset is the kit with its 8 patterns and chain").font(PanelFont.ui(m.r(0.8), 400)).foregroundStyle(WinStyle.text).opacity(0.75)
                    .padding(.top, -m.r(0.4)).padding(.bottom, m.r(0.2))
                factorySection(F: F, groups: groups, cur: cur)
                bankRow(isBank)
                PresetHeading(text: isBank ? "\(KitStore.bank(bank).name) — \(KitBanks.slots) slots, on this device (every set)" : "Yours — 16 slots")
                ScrollView(.vertical) {
                    PresetGrid {
                        ForEach(u.indices, id: \.self) { i in
                            let k = u[i]
                            PresetTile(top: isBank ? String(format: "%02d·%02d", bank, i + 1) : "Slot \(i + 1)", name: k?.name ?? "Empty — tap to save", empty: k == nil,
                                       current: k != nil && cur == k!.name, selected: sel?.src == "u" && sel?.i == i) {
                                sel = ("u", i)
                                if let k { c.loadKit(k) } else { naming = (i, cur.isEmpty ? "My kit" : cur + " (edit)") }
                            }
                        }
                    }.padding(.trailing, m.r(0.2))
                }
                .frame(maxHeight: isBank ? m.r(46 * 0.01 * 60) : nil)
                actionRow(F: F, u: u, cur: cur, selKit: selKit, userSel: userSel, isBank: isBank)
                HelpText(text: "Pick YOURS: 16 slots, or one of 20 banks of 99 presets kept on this device. Tap a preset to load it. Tap an empty slot to save the current kit and patterns there; select one of yours to overwrite, rename, delete or export it. Import adds the presets in a file to your empty slots. Your MIDI channel never changes.")
            }
            .id(version)
        }
        .alert("Preset name", isPresented: Binding(get: { naming != nil }, set: { if !$0 { naming = nil } })) {
            TextField("Name", text: Binding(get: { naming?.name ?? "" }, set: { naming?.name = $0 }))
            Button("Save") { if let n = naming { save(slot: n.slot, name: n.name) } }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Preset name", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Name", text: Binding(get: { renaming ?? "" }, set: { renaming = $0 }))
            Button("OK") { if let s = sel, var k = slots[s.i], let n = renaming?.trimmingCharacters(in: .whitespaces), !n.isEmpty { k.name = String(n.prefix(60)); put(k, s.i) } }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Bank name", isPresented: Binding(get: { bankRename != nil }, set: { if !$0 { bankRename = nil } })) {
            TextField("Name", text: Binding(get: { bankRename ?? "" }, set: { bankRename = $0 }))
            Button("OK") { if let n = bankRename?.trimmingCharacters(in: .whitespaces), !n.isEmpty { var b = KitStore.bank(bank); b.name = String(n.prefix(40)); KitStore.save(b); version += 1 } }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Copy to which bank (1–20)?", isPresented: Binding(get: { copyBank != nil }, set: { if !$0 { copyBank = nil } })) {
            TextField("Bank", text: Binding(get: { copyBank ?? "" }, set: { copyBank = $0 })).keyboardType(.numberPad)
            Button("OK") { if let b = Int(copyBank ?? ""), (1...KitBanks.count).contains(b), let k = selKit { copy(k, to: b) } }
            Button("Cancel", role: .cancel) {}
        }
        .alert(selKit.map { "Delete “\($0.name)” from slot \((sel?.i ?? 0) + 1)?" } ?? "", isPresented: $confirmDelete) {
            Button("Delete", role: .destructive) { if let s = sel { var b = KitStore.bank(bank); b.slots[s.i] = nil; KitStore.save(b); version += 1 } }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Delete all \(KitStore.bank(bank).count) presets in “\(KitStore.bank(bank).name)”?", isPresented: $confirmClear) {
            Button("Delete", role: .destructive) { var b = KitStore.bank(bank); b.slots = Array(repeating: nil, count: KitBanks.slots); KitStore.save(b); version += 1 }
            Button("Cancel", role: .cancel) {}
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json, .data]) { r in
            guard case .success(let url) = r else { return }
            let a = url.startAccessingSecurityScopedResource(); defer { if a { url.stopAccessingSecurityScopedResource() } }
            guard let d = try? Data(contentsOf: url), let kits = KitStore.read(d), !kits.isEmpty else { c.toast("That file is not a Vektur Drum preset file."); return }
            var b = KitStore.bank(bank); let left = b.add(kits); KitStore.save(b); version += 1
            let added = kits.count - left
            c.toast(added > 0 ? "Imported \(added) preset\(added > 1 ? "s" : "")" + (left > 0 ? " · \(left) skipped: no empty slots" : "") : "No empty slots: delete one of yours first")
        }
        .sheet(isPresented: Binding(get: { exportURL != nil }, set: { if !$0 { exportURL = nil } })) { if let u = exportURL { FileSaver(urls: [u]) { c.toast($0); exportURL = nil } } }
    }
    @ViewBuilder private func factorySection(F: [Kit], groups: [String], cur: String) -> some View {
                PresetHeading(text: "Factory — \(F.count)")
                FlowRow(gap: m.r(0.25), rowGap: m.r(0.25)) {
                    ForEach(groups, id: \.self) { g in Button(g.uppercased()) { cat = g }.buttonStyle(HBStyle(led: .amber, on: cat == g)) }
                }
                .padding(.top, m.r(0.1)).padding(.bottom, m.r(0.35))
                ScrollView(.vertical) {
                    PresetGrid {
                        ForEach(F.indices.filter { show(F[$0]) }, id: \.self) { i in
                            PresetTile(top: F[i].category ?? "", name: F[i].name, empty: false, current: cur == F[i].name, selected: sel?.src == "f" && sel?.i == i) { sel = ("f", i); c.loadKit(F[i]) }
                        }
                    }.padding(.trailing, m.r(0.2))
                }
                .frame(maxHeight: m.r(34 * 0.01 * 60))
    }
    @ViewBuilder private func bankRow(_ isBank: Bool) -> some View {
                FlowRow(gap: m.r(0.3), rowGap: m.r(0.3)) {   // .prebank
                    Text("YOURS").font(PanelFont.ui(m.r(0.6), 700)).tracking(0.16 * m.r(0.6)).foregroundStyle(WinStyle.text).opacity(0.7)
                    PanelSelect(options: ["Set — 16 slots, saved on this device (\(KitStore.bank(0).count))"] + (1...KitBanks.count).map { b in String(format: "%02d · %@ (%d)", b, KitStore.bank(b).name, KitStore.bank(b).count) },
                                selected: bank, fontSize: 0.8, label: "User bank") { bank = $0; sel = nil }
                    Button("◀") { bank = (bank + KitBanks.count) % (KitBanks.count + 1); sel = nil }.buttonStyle(HBStyle())
                    Button("▶") { bank = (bank + 1) % (KitBanks.count + 1); sel = nil }.buttonStyle(HBStyle())
                    if isBank {
                        Button("RENAME BANK") { bankRename = KitStore.bank(bank).name }.buttonStyle(HBStyle())
                        Button("EXPORT BANK") { let b = KitStore.bank(bank); if b.count == 0 { c.toast("This bank is empty") } else { export(b.slots.compactMap { $0 }, name: b.name) } }.buttonStyle(HBStyle())
                        Button("SET → BANK") { setToBank() }.buttonStyle(HBStyle())
                        Button("CLEAR BANK") { if KitStore.bank(bank).count > 0 { confirmClear = true } }.buttonStyle(HBStyle())
                    }
                }
                .padding(.top, m.r(0.7)).padding(.bottom, m.r(0.1))
    }
    @ViewBuilder private func actionRow(F: [Kit], u: [Kit?], cur: String, selKit: Kit?, userSel: Bool, isBank: Bool) -> some View {
                FlowRow(gap: m.r(0.4), rowGap: m.r(0.4)) {   // .prebtns
                    Button("INIT · blank kit") { if let k = F.first(where: { $0.isInit }) { c.loadKit(k) } }.buttonStyle(CButton())
                    Button(userSel ? "Save current to slot \(sel!.i + 1)" : "Save current…") {
                        let i = userSel ? sel!.i : (u.firstIndex { $0 == nil } ?? -1)
                        if i < 0 { c.toast("All \(u.count) slots are full: delete one first") } else { naming = (i, u[i]?.name ?? (cur.isEmpty ? "My kit" : cur + " (edit)")) }
                    }.buttonStyle(CButton())
                    Button("Rename…") { renaming = selKit?.name }.buttonStyle(CButton()).disabled(!(userSel && selKit != nil))
                    Button("Delete") { confirmDelete = true }.buttonStyle(CButton()).disabled(!(userSel && selKit != nil))
                    Button("Export") { if let k = selKit { export([k], name: k.name) } }.buttonStyle(CButton()).disabled(selKit == nil)
                    if !isBank { Button("Export all yours") { export(u.compactMap { $0 }, name: "set-kits") }.buttonStyle(CButton()).disabled(!u.contains { $0 != nil }) }
                    if selKit != nil { Button(isBank ? "Copy to set" : "Copy to bank…") { if isBank { copy(selKit!, to: 0) } else { copyBank = "1" } }.buttonStyle(CButton()) }
                    Button(isBank ? "Import into bank…" : "Import…") { importing = true }.buttonStyle(CButton())
                }
                .padding(.top, m.r(0.9)).padding(.bottom, m.r(0.5))
                .opacity(1)
    }
    private var slots: [Kit?] { _ = version; let b = KitStore.bank(bank); return bank == 0 ? Array(b.slots.prefix(16)) : b.slots }
    private func show(_ k: Kit) -> Bool { cat == "All" || (cat == "More" ? !Self.big.contains(k.category ?? "") : k.category == cat) }
    private func put(_ k: Kit, _ i: Int) { var b = KitStore.bank(bank); b.slots[i] = k; KitStore.save(b); version += 1 }
    private func save(slot i: Int, name: String) {
        guard let p = c.unit.keeper?.currentProject() else { return }
        var k = Kit(name: String(name.trimmingCharacters(in: .whitespaces).prefix(60)).isEmpty ? "My kit" : String(name.trimmingCharacters(in: .whitespaces).prefix(60)), category: nil, project: p)
        k.tempo = p.tempo
        put(k, i); c.edit { $0.currentKitName = k.name }; sel = ("u", i)
        c.toast(bank > 0 ? "Saved to \(KitStore.bank(bank).name), slot \(i + 1)" : "Saved to slot \(i + 1)")
    }
    private func copy(_ k: Kit, to b: Int) {
        var dst = KitStore.bank(b); let limit = b == 0 ? 16 : KitBanks.slots
        guard let i = dst.slots.prefix(limit).firstIndex(where: { $0 == nil }) else { c.toast(b == 0 ? "The 16 slots are full" : "That bank is full"); return }
        dst.slots[i] = k; KitStore.save(dst); version += 1
        c.toast(b == 0 ? "Copied to slot \(i + 1)" : "Copied to bank \(b), slot \(i + 1)")
    }
    private func setToBank() {
        let set = KitStore.bank(0).slots.prefix(16).compactMap { $0 }
        guard !set.isEmpty else { c.toast("The 16 slots have no presets"); return }
        var b = KitStore.bank(bank); let left = b.add(set); KitStore.save(b); version += 1
        c.toast("Copied \(set.count - left) preset\(set.count - left == 1 ? "" : "s") into the bank" + (left > 0 ? " · \(left) didn’t fit" : ""))
    }
    private func export(_ kits: [Kit], name: String) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name.replacingOccurrences(of: #"[^\w-]+"#, with: "_", options: .regularExpression) + ".vdrum-kits.json")
        guard let d = KitStore.write(kits), (try? d.write(to: url)) != nil else { c.toast("Could not export"); return }
        exportURL = url
    }
}

struct PresetHeading: View {
    @Environment(\.panel) private var m
    let text: String
    var body: some View { Text(text.uppercased()).font(PanelFont.ui(m.r(0.8), 700)).tracking(0.12 * m.r(0.8)).foregroundStyle(WinStyle.muted).padding(.top, m.r(0.55)).padding(.bottom, m.r(0.3)) }
}
/// .pregrid: auto-fill columns of at least 8.6rem (2 on narrow screens).
struct PresetGrid<Content: View>: View {
    @Environment(\.panel) private var m
    @ViewBuilder var content: Content
    var body: some View {
        LazyVGrid(columns: m.width <= 640 ? [GridItem(.flexible(), spacing: m.r(0.3)), GridItem(.flexible(), spacing: m.r(0.3))] : [GridItem(.adaptive(minimum: m.r(8.6)), spacing: m.r(0.3))],
                  alignment: .leading, spacing: m.r(0.3)) { content }
    }
}
/// .pretile: the style or slot small, the name; the loaded preset in the accent colour, the selected one ringed.
struct PresetTile: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let top: String
    let name: String
    let empty: Bool
    let current: Bool
    let selected: Bool
    let tap: () -> Void
    var body: some View {
        Button(action: tap) {
            VStack(alignment: .leading, spacing: m.r(0.05)) {
                Text(top.uppercased()).font(PanelFont.ui(m.r(0.55), 500)).tracking(0.08 * m.r(0.55)).opacity(0.6)
                Text(name).font(PanelFont.ui(m.r(0.76), empty ? 400 : 600)).opacity(empty ? 0.5 : 1).lineLimit(1)
            }
            .foregroundStyle(WinStyle.text)
            .frame(maxWidth: .infinity, minHeight: m.r(2.5), alignment: .leading)
            .padding(.vertical, m.r(0.3)).padding(.horizontal, m.r(0.45))
            .background(RoundedRectangle(cornerRadius: m.r(0.45)).fill(WinStyle.panel2))
            .overlay(RoundedRectangle(cornerRadius: m.r(0.45)).stroke(current ? th.led : WinStyle.line, lineWidth: 1))
            .overlay { if selected { RoundedRectangle(cornerRadius: m.r(0.45)).stroke(th.led, lineWidth: 2).padding(1) } }
            .contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
}

/// Kits on this device: the factory list (loaded once), the 16 slots (bank 0) and banks 1–20, in Application Support.
enum KitStore {
    static let factory: [Kit] = FactoryKits.load()
    static var store: FileKitBankStore {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Kits/Banks", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return FileKitBankStore(directory: dir)
    }
    static func bank(_ n: Int) -> KitBank { n == 0 ? setBank() : store.bank(n) }
    static func save(_ b: KitBank) { if b.number == 0 || b.name == "__set__" { saveSet(b) } else { try? store.save(b) } }
    // the 16 slots ("set") are kept in their own file (KitBank numbers start at 1)
    private static var setURL: URL { store.directory.appendingPathComponent("set.json") }
    private static func setBank() -> KitBank {
        var b = KitBank(number: 1, name: "__set__")
        if let d = try? Data(contentsOf: setURL), let s = try? JSONDecoder().decode([Kit?].self, from: d) { b.slots = Array((s + Array(repeating: nil, count: KitBanks.slots)).prefix(KitBanks.slots)) }
        return b
    }
    private static func saveSet(_ b: KitBank) { if let d = try? JSONEncoder().encode(Array(b.slots.prefix(16))) { try? d.write(to: setURL, options: .atomic) } }
    /// A kits file: { format: "vektur-drum-kits", version: 1, kits: [Kit] }.
    static func write(_ kits: [Kit]) -> Data? {
        struct F: Encodable { var format = "vektur-drum-kits"; var version = 1; var kits: [Kit] }
        return try? JSONEncoder().encode(F(kits: kits))
    }
    static func read(_ d: Data) -> [Kit]? {
        struct F: Decodable { var format: String; var kits: [Kit] }
        if let f = try? JSONDecoder().decode(F.self, from: d), f.format == "vektur-drum-kits" { return f.kits.map { var k = $0; k.id = UUID(); return k } }
        if let r = try? StateCodec.decode(d, librarySamples: []) { return [Kit(name: r.project.currentKitName ?? "Imported", category: nil, project: r.project)] }
        return nil
    }
}

extension DrumController {
    /// web presetApply: the kit, its 8 patterns, chain, Slicer, wires and LFO shapes; the MIDI channel stays; its tempo if it has one.
    func loadKit(_ k: Kit) {
        let ch = value("dr.ch")
        unit.keeper?.applyKit(k)
        set("dr.ch", ch)
        unit.keeper?.update { $0.selectedPattern = 0; $0.currentKitName = k.name }
        engine.send(.selectPattern(0))
        if let t = k.tempo { setTempo(t) }
        reloadFromKeeper(); dirty()
        if !on { setOn(true) }
        toast("\(k.name) loaded")
    }
}
