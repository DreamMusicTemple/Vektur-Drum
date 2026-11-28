// Vektur Drum — the dial designs of SETTINGS → APPEARANCE (web/src/dials.js): Classic (CSS knob), six SVG designs from
// Vektur Vocal (Machined, Chrome, Wood, Mecha, Porcelain, Blueprint — body, 31-notch printed scale, pointer) and the four
// canvas pots from Vektur Vortex (Interstellar, Aqua, Scientific, Holo ring). Drawn with the same numbers as the web.
import SwiftUI

/// One dial face. `t` 0…1, `centre` the bipolar centre (nil = unipolar); drawn in a square of 122 % of the knob.
struct DialArt: View {
    let style: String
    let t: Double
    var centre: Double? = nil
    let colorHex: String          // the dial arc colour (theme arc)
    var ledHex = "#ffb23d"        // .kpc pointer dots (theme LED)
    let dragging: Bool
    var body: some View {
        switch style {
        case "interstellar": InterstellarDial(t: t, colorHex: colorHex, dragging: dragging)
        case "aqua", "scientific", "holo": Canvas { cx, size in
            let w = Double(min(size.width, size.height))
            if style == "aqua" { VortexPots.aqua(cx, w, t, colorHex, dragging) } else if style == "holo" { VortexPots.holo(cx, w, t, colorHex) } else { VortexPots.tech(cx, w, t, colorHex) }
        }
        case "classic": ClassicDial(t: t, centre: centre ?? 0, colorHex: colorHex, dragging: dragging).padding(.all, 0).scaleEffect(1 / 1.22)
        default: Canvas { cx, size in VocalDials.draw(cx, size: min(size.width, size.height), style: style, t: t, centre: centre, arc: colorHex, led: ledHex) }
        }
    }
}

// MARK: - Classic (style.css .knob: u = the lit arc ring, b = the body, i = the pointer)

struct ClassicDial: View {
    let t: Double
    let centre: Double
    let colorHex: String
    let dragging: Bool
    var body: some View {
        GeometryReader { g in
            let w = min(g.size.width, g.size.height), lo = min(t, centre), hi = max(t, centre)
            ZStack {
                // u: conic from 225°: #25272b, the arc colour from --s to --e, #25272b to 270°, masked to a ring (61–63 %)
                Canvas { cx, s in
                    let c = CGPoint(x: s.width / 2, y: s.height / 2), r = Double(s.width) / 2
                    func arc(_ a: Double, _ b: Double, _ col: Color) {
                        guard b > a else { return }
                        var p = Path(); p.addArc(center: c, radius: r * 0.81, startAngle: .degrees(135 + a), endAngle: .degrees(135 + b), clockwise: false)
                        cx.stroke(p, with: .color(col), lineWidth: r * 0.38)
                    }
                    arc(0, 270, Color(hex: "#25272b")); arc(lo * 270, hi * 270, Color(hex: colorHex))
                }
                .mask(Circle().strokeBorder(lineWidth: w * 0.19).frame(width: w, height: w))
                Circle().fill(RadialGradient(stops: [.init(color: Color(hex: dragging ? "#666a71" : "#5b5f66"), location: 0), .init(color: Color(hex: dragging ? "#3a3d42" : "#34373c"), location: 0.42),
                                                     .init(color: Color(hex: dragging ? "#1f2124" : "#1d1f22"), location: 0.78)],
                                             center: UnitPoint(x: 0.5, y: 0.22), startRadius: 0, endRadius: w * 0.66 * 0.7))
                    .overlay(Circle().stroke(Color.white.opacity(0.22), lineWidth: 1).mask(LinearGradient(colors: [.white, .clear], startPoint: .top, endPoint: .center)))
                    .shadow(color: .black.opacity(0.75), radius: 3, y: 3)
                    .padding(w * 0.17)
                RoundedRectangle(cornerRadius: 1).fill(Color(hex: "#efe9dc")).frame(width: 2, height: w * 0.66 * 0.34)
                    .shadow(color: Color(255, 220, 160, 0.35), radius: 1)
                    .offset(y: -(w * 0.66 / 2) + w * 0.66 * 0.07 + w * 0.66 * 0.17)
                    .rotationEffect(.degrees(t * 270 - 135))
            }
            .frame(width: w, height: w)
        }
    }
}

// MARK: - Vektur Vocal's SVG dials (viewBox 66 × 66)

enum VocalDials {
    struct Vars { let rim, body, capTop, cap, capBot, pointer: String }
    static let vars: [String: Vars] = [
        "machined": Vars(rim: "#3a3e48", body: "#1c1e25", capTop: "#4d4d4d", cap: "#2b2e36", capBot: "#141414", pointer: "#E8ECF4"),
        "chrome": Vars(rim: "#C9CDD3", body: "#8E949C", capTop: "#EEF0F2", cap: "#B5BAC1", capBot: "#6E747C", pointer: "#111214"),
        "wood": Vars(rim: "#A06A3E", body: "#5C3A20", capTop: "#9a6a40", cap: "#7A4E2C", capBot: "#3e2614", pointer: "#F4E8D0"),
        "mecha": Vars(rim: "#C9D2E0", body: "#6E7890", capTop: "#c4ccda", cap: "#A8B2C4", capBot: "#5a6378", pointer: "#7CFF4F"),
        "porcelain": Vars(rim: "#FFFFFF", body: "#E2E8EE", capTop: "#fff", cap: "#FAFCFD", capBot: "#c9d1da", pointer: "#1B2531"),
        "blueprint": Vars(rim: "#FFFFFF", body: "#1A4B8D", capTop: "#2a62ad", cap: "#1C5097", capBot: "#123a70", pointer: "#FFFFFF"),
    ]
    static func draw(_ ctx: GraphicsContext, size: CGFloat, style: String, t: Double, centre: Double?, arc: String, led: String) {
        var cx = ctx; cx.scaleBy(x: size / 66, y: size / 66)
        let v = vars[style] ?? vars["machined"]!
        // the printed scale: 31 notches, lit up to the value (or between the value and the centre)
        let c = centre ?? 0, lo = min(t, c), hi = max(t, c)
        for i in 0...30 {
            let u = Double(i) / 30, a = (135 + 270 * u) * .pi / 180, major = i % 5 == 0, r1 = 24.0, r2 = 21 + (major ? 9 : 6.5)
            let on = u >= lo - 1e-6 && u <= hi + 1e-6 && (centre != nil || u <= t + 1e-6)
            var p = Path(); p.move(to: CGPoint(x: 33 + r1 * cos(a), y: 33 + r1 * sin(a))); p.addLine(to: CGPoint(x: 33 + r2 * cos(a), y: 33 + r2 * sin(a)))
            cx.stroke(p, with: .color(on ? Color(hex: arc) : Color.white.opacity(0.16)), style: StrokeStyle(lineWidth: major ? 1.8 : 1.1, lineCap: .round))
        }
        body(cx, style, v)
        var pc = cx; pc.translateBy(x: 33, y: 33); pc.rotate(by: .degrees(135 + 270 * t)); pc.translateBy(x: -33, y: -33)
        pointer(pc, style, v, led)
    }
    static func circle(_ x: Double, _ y: Double, _ r: Double) -> Path { Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)) }
    static func shadow(_ cx: GraphicsContext, y: Double, color: Color, blur: Double) { cx.drawLayer { l in l.addFilter(.blur(radius: blur)); l.fill(circle(33, y, 21), with: .color(color)) } }
    static func radial(_ a: String, _ b: String, cx: Double, cy: Double, r: Double) -> GraphicsContext.Shading {
        .radialGradient(Gradient(colors: [Color(hex: a), Color(hex: b)]), center: CGPoint(x: 12 + 42 * cx, y: 12 + 42 * cy), startRadius: 0, endRadius: 42 * r)
    }
    static func serrations(_ cx: GraphicsContext, n: Int, a1: Double, a2: Double) {
        for i in 0..<n {
            let a = Double(i) / Double(n) * 2 * .pi
            var p = Path(); p.move(to: CGPoint(x: 33 + 16.8 * cos(a), y: 33 + 16.8 * sin(a))); p.addLine(to: CGPoint(x: 33 + 20.2 * cos(a), y: 33 + 20.2 * sin(a)))
            cx.stroke(p, with: .color(.black.opacity(i % 2 == 0 ? a1 : a2)), lineWidth: 1)
        }
    }
    static func octagon(_ r: Double, dy: Double = 0) -> Path {
        var p = Path()
        for k in 0..<8 { let a = (22.5 + 45 * Double(k)) * .pi / 180, pt = CGPoint(x: 33 + r * cos(a), y: 33 + dy + r * sin(a)); if k == 0 { p.move(to: pt) } else { p.addLine(to: pt) } }
        p.closeSubpath(); return p
    }
    static func body(_ cx: GraphicsContext, _ style: String, _ v: Vars) {
        switch style {
        case "chrome":
            shadow(cx, y: 35.5, color: .black.opacity(0.6), blur: 2)
            cx.fill(circle(33, 33, 21), with: .linearGradient(Gradient(stops: [.init(color: Color(hex: "#f4f6f8"), location: 0), .init(color: Color(hex: "#8e949c"), location: 0.3), .init(color: Color(hex: "#e2e5e8"), location: 0.5),
                                                                              .init(color: Color(hex: "#7d838b"), location: 0.75), .init(color: Color(hex: "#eef0f2"), location: 1)]), startPoint: CGPoint(x: 12, y: 12), endPoint: CGPoint(x: 54, y: 54)))
            serrations(cx, n: 60, a1: 0.35, a2: 0.16)
            let cap = circle(33, 33, 15.54)
            cx.fill(cap, with: .radialGradient(Gradient(stops: [.init(color: .white, location: 0), .init(color: Color(hex: "#c9cdd3"), location: 0.55), .init(color: Color(hex: "#8e949c"), location: 1)]),
                                               center: CGPoint(x: 17.46 + 31.08 * 0.4, y: 17.46 + 31.08 * 0.35), startRadius: 0, endRadius: 31.08 * 0.8))
            cx.stroke(cap, with: .color(.black.opacity(0.5)), lineWidth: 1)
            for r in [3.45, 6.91, 10.36, 13.81] { cx.stroke(circle(33, 33, r), with: .color(.black.opacity(0.07)), lineWidth: 0.6) }
        case "wood":
            shadow(cx, y: 35, color: .black.opacity(0.6), blur: 2)
            cx.fill(circle(33, 33, 21), with: radial(v.rim, v.body, cx: 0.38, cy: 0.32, r: 0.9))
            for k in 0..<7 {
                let rx = 5.25 + 2.31 * Double(k), ry = 5.04 + 2.218 * Double(k), x = k % 2 == 0 ? 33.0 : 34.2
                cx.stroke(Path(ellipseIn: CGRect(x: x - rx, y: 33 - ry, width: 2 * rx, height: 2 * ry)), with: .color(.black.opacity(0.14)), lineWidth: 1)
            }
            cx.stroke(circle(33, 33, 21), with: .color(.black.opacity(0.55)), lineWidth: 1)
        case "mecha":
            cx.fill(octagon(21.0, dy: 3).offsetBy(dx: 2, dy: 0), with: .color(.black))
            cx.fill(octagon(21.0), with: .color(Color(hex: v.body)))
            cx.fill(octagon(18.0), with: .color(Color(hex: "#22E4FF")))
            cx.drawLayer { l in   // hazard stripes: black bands 5 wide every 10, at 45°
                l.clip(to: octagon(18.0))
                var s = l; s.translateBy(x: 33, y: 33); s.rotate(by: .degrees(45))
                var x = -40.0; while x < 40 { s.fill(Path(CGRect(x: x, y: -40, width: 5, height: 80)), with: .color(.black)); x += 10 }
            }
            let inner = octagon(14.75)
            cx.fill(inner, with: .linearGradient(Gradient(colors: [Color(hex: v.cap), Color(hex: v.body)]), startPoint: CGPoint(x: 33, y: 18.25), endPoint: CGPoint(x: 33, y: 47.75)))
            cx.stroke(inner, with: .color(.black), lineWidth: 2)
            cx.stroke(octagon(21.0), with: .color(.black), lineWidth: 2)
        case "porcelain":
            cx.drawLayer { l in l.addFilter(.blur(radius: 3)); l.fill(circle(33, 36, 21), with: .color(Color(40, 70, 100, 0.35))) }
            cx.fill(circle(33, 33, 21), with: radial("#ffffff", v.body, cx: 0.35, cy: 0.3, r: 0.9))
            cx.stroke(circle(33, 33, 21), with: .color(Color(hex: "#9aa7b5")), lineWidth: 1)
            let cap = circle(33, 33, 15.54)
            cx.fill(cap, with: .radialGradient(Gradient(colors: [.white, Color(hex: v.cap)]), center: CGPoint(x: 17.46 + 31.08 * 0.35, y: 17.46 + 31.08 * 0.3), startRadius: 0, endRadius: 31.08 * 0.9))
            cx.stroke(cap, with: .color(Color(hex: "#9aa7b5").opacity(0.7)), lineWidth: 0.8)
        case "blueprint":
            cx.stroke(circle(33, 33, 21), with: .color(.white), lineWidth: 1.3)
            cx.stroke(circle(33, 33, 15.54), with: .color(.white.opacity(0.7)), style: StrokeStyle(lineWidth: 0.8, dash: [2, 2]))
            cx.stroke(circle(33, 33, 2), with: .color(.white), lineWidth: 0.8)
            var p = Path()
            p.move(to: CGPoint(x: 8, y: 33)); p.addLine(to: CGPoint(x: 26.7, y: 33)); p.move(to: CGPoint(x: 39.3, y: 33)); p.addLine(to: CGPoint(x: 58, y: 33))
            p.move(to: CGPoint(x: 33, y: 8)); p.addLine(to: CGPoint(x: 33, y: 26.7)); p.move(to: CGPoint(x: 33, y: 39.3)); p.addLine(to: CGPoint(x: 33, y: 58))
            cx.stroke(p, with: .color(.white.opacity(0.55)), style: StrokeStyle(lineWidth: 0.6, dash: [4, 1.5, 1, 1.5]))
        default:   // machined
            shadow(cx, y: 34.5, color: .black.opacity(0.55), blur: 2)
            cx.fill(circle(33, 33, 21), with: radial(v.rim, v.body, cx: 0.35, cy: 0.3, r: 0.9))
            serrations(cx, n: 44, a1: 0.55, a2: 0.25)
            let cap = circle(33, 33, 15.54)
            cx.fill(cap, with: .linearGradient(Gradient(stops: [.init(color: Color(hex: v.capTop), location: 0), .init(color: Color(hex: v.cap), location: 0.5), .init(color: Color(hex: v.capBot), location: 1)]),
                                               startPoint: CGPoint(x: 33, y: 17.46), endPoint: CGPoint(x: 33, y: 48.54)))
            cx.stroke(cap, with: .color(.black.opacity(0.8)), lineWidth: 1)
            cx.fill(Path(ellipseIn: CGRect(x: 33 - 8.55, y: 25.23 - 5.44, width: 17.1, height: 10.88)), with: .color(.white.opacity(0.06)))
        }
    }
    /// The pointer, drawn along +x and rotated into place by the caller.
    static func pointer(_ cx: GraphicsContext, _ style: String, _ v: Vars, _ led: String) {
        func line(_ x1: Double, _ x2: Double, _ col: String, _ w: Double, round: Bool) {
            var p = Path(); p.move(to: CGPoint(x: x1, y: 33)); p.addLine(to: CGPoint(x: x2, y: 33))
            cx.stroke(p, with: .color(Color(hex: col)), style: StrokeStyle(lineWidth: w, lineCap: round ? .round : .butt))
        }
        switch style {
        case "chrome": line(35.3, 53, "#111214", 2.4, round: false)
        case "wood": line(37.2, 51.9, "#F4E8D0", 3, round: true); cx.fill(circle(51.9, 33, 2), with: .color(Color(hex: led)))
        case "mecha":
            var p = Path(); p.move(to: CGPoint(x: 47.8, y: 33)); p.addLine(to: CGPoint(x: 36, y: 29.6)); p.addLine(to: CGPoint(x: 36, y: 36.4)); p.closeSubpath()
            cx.fill(p, with: .color(Color(hex: "#7CFF4F"))); cx.stroke(p, with: .color(.black), style: StrokeStyle(lineWidth: 1.5, lineJoin: .round))
        case "blueprint":
            line(33, 53, "#ffffff", 1.4, round: false)
            cx.stroke(circle(46, 33, 2.4), with: .color(.white), lineWidth: 1); cx.fill(circle(46, 33, 1), with: .color(Color(hex: led)))
        case "porcelain": cx.fill(circle(43.9, 33, 3), with: .color(Color(hex: led)))
        default: line(37, 47.3, v.pointer, 2.2, round: true); cx.fill(circle(51.3, 33, 2.3), with: .color(Color(hex: led)))
        }
    }
}

// MARK: - Vektur Vortex's canvas pots (POT_DRAW.aqua / scientific / holo)

enum VortexPots {
    static let A0 = 0.75 * Double.pi, SW = 1.5 * Double.pi, TAU = 2 * Double.pi
    static func rgb(_ hex: String) -> (Double) -> Color { { a in Color(hex: hex, opacity: a) } }
    static func hash(_ n: Double) -> Double { let x = sin(n * 127.1 + 311.7) * 43758.5453; return x - floor(x) }
    static func circle(_ x: Double, _ y: Double, _ r: Double) -> Path { Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)) }
    static func arc(_ c: Double, _ r: Double, _ a: Double, _ b: Double) -> Path { var p = Path(); p.addArc(center: CGPoint(x: c, y: c), radius: r, startAngle: .radians(a), endAngle: .radians(b), clockwise: false); return p }
    static func topLight(_ c: Double, _ R: Double, _ a: Double) -> GraphicsContext.Shading {
        .linearGradient(Gradient(stops: [.init(color: .white.opacity(a), location: 0), .init(color: .white.opacity(a * 0.15), location: 0.45), .init(color: .white.opacity(0), location: 1)]),
                        startPoint: CGPoint(x: 0, y: c - R), endPoint: CGPoint(x: 0, y: c + R * 0.6))
    }
    static func shadowed(_ cx: GraphicsContext, _ w: Double, _ a: Double, _ draw: (inout GraphicsContext) -> Void) {
        cx.drawLayer { l in l.addFilter(.shadow(color: .black.opacity(a), radius: w * 0.045 / 2, x: 0, y: w * 0.032)); draw(&l) }
    }

    static func aqua(_ cx: GraphicsContext, _ w: Double, _ t: Double, _ col: String, _ dragging: Bool) {
        let c = w / 2, R0 = w * 0.375, tk = w * 0.085, N = 96, va = A0 + t * SW, L = rgb(col)
        func wob(_ a: Double) -> Double { sin(a * 3) * w * 0.0028 + sin(a * 5) * w * 0.002 + sin(a * 8) * w * 0.0013 }
        func bump(_ a: Double) -> Double { let d = atan2(sin(a - va), cos(a - va)); return exp(-d * d / 0.12) * w * 0.034 + exp(-d * d / 0.9) * w * 0.008 }
        var ring = Path(), outer = Path(), inner = Path()
        for i in 0...N {
            let a = Double(i) / Double(N) * TAU, b = bump(a), wv = wob(a)
            let po = CGPoint(x: c + cos(a) * (R0 + tk / 2 + wv + b), y: c + sin(a) * (R0 + tk / 2 + wv + b))
            let pi = CGPoint(x: c + cos(a) * (R0 - tk / 2 + wv * 0.6 + b * 0.45), y: c + sin(a) * (R0 - tk / 2 + wv * 0.6 + b * 0.45))
            if i == 0 { outer.move(to: po); inner.move(to: pi) } else { outer.addLine(to: po); inner.addLine(to: pi) }
        }
        outer.closeSubpath(); inner.closeSubpath(); ring.addPath(outer); ring.addPath(inner)
        shadowed(cx, w, 0.42) { $0.fill(circle(c, c, w * 0.27), with: .color(Color(10, 22, 32, 0.92))) }
        let lw = max(1, w * 0.012)
        cx.stroke(circle(c, c, w * 0.27 - lw / 2), with: topLight(c, w * 0.27, 0.55), lineWidth: lw)
        shadowed(cx, w, 0.32) { l in
            l.fill(ring, with: .linearGradient(Gradient(stops: [.init(color: Color(150, 225, 255, 0.55), location: 0), .init(color: Color(60, 160, 215, 0.38), location: 0.5), .init(color: Color(20, 90, 150, 0.45), location: 1)]),
                                               startPoint: CGPoint(x: 0, y: c - R0 - tk), endPoint: CGPoint(x: 0, y: c + R0 + tk)), style: FillStyle(eoFill: true))
        }
        cx.drawLayer { l in
            l.clip(to: ring, style: FillStyle(eoFill: true))
            for k in 0..<18 {
                let kk = Double(k), rr = R0 - tk * 0.4 + tk * 0.8 * hash(kk + 1), a0 = hash(kk + 20) * TAU, ln = 0.5 + hash(kk + 60) * 1.1
                l.stroke(arc(c, rr, a0, a0 + ln), with: .color(Color(225, 250, 255, 0.2 + hash(kk + 80) * 0.35)), lineWidth: max(0.7, w * (0.004 + hash(kk + 95) * 0.006)))
            }
            l.addFilter(.shadow(color: L(0.9), radius: w * 0.025))
            l.stroke(arc(c, R0, A0, va), with: .color(L(0.55)), lineWidth: tk * 1.3)
        }
        cx.stroke(ring, with: .linearGradient(Gradient(stops: [.init(color: .white.opacity(0.85), location: 0), .init(color: .white.opacity(0.12), location: 0.4), .init(color: Color(0, 30, 60, 0.35), location: 1)]),
                                              startPoint: CGPoint(x: 0, y: c - R0 - tk), endPoint: CGPoint(x: 0, y: c + R0 + tk)), lineWidth: max(1, w * 0.011))
        for k in 0..<7 {
            let kk = Double(k), a = hash(kk + 3) * TAU, d = R0 + tk * 0.7 + w * 0.012 + hash(kk + 9) * w * 0.028, rr = w * (0.007 + hash(kk + 15) * 0.01), x = c + cos(a) * d, y = c + sin(a) * d
            cx.fill(circle(x, y, rr), with: .color(Color(170, 230, 255, 0.45))); cx.fill(circle(x - rr * 0.3, y - rr * 0.35, rr * 0.38), with: .color(.white.opacity(0.75)))
        }
        let sx = cos(va), sy = sin(va), br = tk * (dragging ? 0.62 : 0.52), bd = R0 + (dragging ? tk * 0.1 : 0), bx = c + sx * bd, by = c + sy * bd
        shadowed(cx, w, 0.4) { l in
            l.fill(circle(bx, by, br), with: .radialGradient(Gradient(stops: [.init(color: .white.opacity(0.95), location: 0), .init(color: L(0.75), location: 0.5), .init(color: Color(20, 100, 170, 0.7), location: 1)]),
                                                            center: CGPoint(x: bx - br * 0.3, y: by - br * 0.4), startRadius: br * 0.1, endRadius: br))
        }
        if dragging {
            var p = Path(); p.move(to: CGPoint(x: c + sx * (R0 - tk * 0.3), y: c + sy * (R0 - tk * 0.3))); p.addLine(to: CGPoint(x: bx, y: by))
            cx.stroke(p, with: .color(L(0.6)), lineWidth: max(1.2, w * 0.014))
        }
        for u in [0.0, 0.5, 1] { let a = A0 + u * SW; cx.fill(circle(c + cos(a) * w * 0.475, c + sin(a) * w * 0.475, max(1, w * 0.01)), with: .color(Color(190, 230, 245, 0.55))) }
    }

    static func tech(_ cx: GraphicsContext, _ w: Double, _ t: Double, _ col: String) {
        let c = w / 2, va = A0 + t * SW, L = rgb(col), ctr = CGPoint(x: c, y: c)
        func conic(_ stops: [(Double, String)], from: Double) -> GraphicsContext.Shading {
            .conicGradient(Gradient(stops: stops.map { .init(color: Color(hex: $0.1), location: $0.0) }), center: ctr, angle: .radians(from))
        }
        shadowed(cx, w, 0.45) { $0.fill(circle(c, c, w * 0.47), with: conic([(0, "#9aa3ad"), (0.18, "#4a525b"), (0.38, "#aab3bd"), (0.6, "#3c434b"), (0.8, "#9aa3ad"), (1, "#9aa3ad")], from: -Double.pi / 2)) }
        cx.fill(circle(c, c, w * 0.47), with: topLight(c, w * 0.47, 0.45))
        cx.fill(circle(c, c, w * 0.44), with: .color(Color(hex: "#0b1117")))
        cx.stroke(circle(c, c, w * 0.445), with: .color(.black.opacity(0.7)), lineWidth: max(1, w * 0.01))
        for i in 0...50 {
            let u = Double(i) / 50, a = A0 + u * SW, major = i % 5 == 0, r1 = w * 0.44, r2 = w * (major ? 0.375 : 0.405)
            var p = Path(); p.move(to: CGPoint(x: c + cos(a) * r1, y: c + sin(a) * r1)); p.addLine(to: CGPoint(x: c + cos(a) * r2, y: c + sin(a) * r2))
            cx.stroke(p, with: .color(major ? Color(230, 240, 250, 0.9) : Color(180, 200, 215, 0.55)), lineWidth: max(0.8, w * (major ? 0.012 : 0.007)))
        }
        cx.drawLayer { l in l.addFilter(.shadow(color: L(0.9), radius: w * 0.02)); l.stroke(arc(c, w * 0.46, A0, va), with: .color(L(0.95)), style: StrokeStyle(lineWidth: max(1.5, w * 0.018), lineCap: .round)) }
        let Rk = w * 0.30, teeth = 40
        var sk = Path()
        for i in 0..<(teeth * 2) { let a = Double(i) / Double(teeth * 2) * TAU, r = i % 2 == 1 ? Rk * 0.955 : Rk, pt = CGPoint(x: c + cos(a) * r, y: c + sin(a) * r); if i == 0 { sk.move(to: pt) } else { sk.addLine(to: pt) } }
        sk.closeSubpath()
        shadowed(cx, w, 0.55) { $0.fill(sk, with: conic([(0, "#c9d0d8"), (0.12, "#5d656e"), (0.3, "#b9c1c9"), (0.5, "#444b53"), (0.7, "#b9c1c9"), (0.88, "#5d656e"), (1, "#c9d0d8")], from: -Double.pi / 2 - va + A0)) }
        cx.fill(sk, with: topLight(c, Rk, 0.5)); cx.stroke(sk, with: .color(.black.opacity(0.5)), lineWidth: 0.8)
        for (rr, al) in [(0.255, 0.55), (0.225, 0.35)] {
            cx.stroke(circle(c, c, w * rr), with: .color(.black.opacity(al)), lineWidth: max(0.8, w * 0.008))
            cx.stroke(arc(c, w * rr + w * 0.008, Double.pi * 1.05, Double.pi * 1.95), with: .color(.white.opacity(al * 0.35)), lineWidth: max(0.8, w * 0.008))
        }
        let cap = circle(c, c, w * 0.2)
        cx.fill(cap, with: .radialGradient(Gradient(stops: [.init(color: Color(hex: "#f1f5f9"), location: 0), .init(color: Color(hex: "#8e98a2"), location: 0.45), .init(color: Color(hex: "#2d343b"), location: 1)]),
                                           center: CGPoint(x: c, y: c - w * 0.08), startRadius: w * 0.01, endRadius: w * 0.2))
        cx.stroke(cap, with: .color(.black.opacity(0.55)), lineWidth: 1)
        var cross = Path(); cross.move(to: CGPoint(x: c - w * 0.07, y: c)); cross.addLine(to: CGPoint(x: c + w * 0.07, y: c)); cross.move(to: CGPoint(x: c, y: c - w * 0.07)); cross.addLine(to: CGPoint(x: c, y: c + w * 0.07))
        cx.stroke(cross, with: .color(Color(20, 30, 40, 0.55)), lineWidth: 0.8)
        var r = cx; r.translateBy(x: c, y: c); r.rotate(by: .radians(va))
        r.drawLayer { l in
            l.addFilter(.shadow(color: L(0.8), radius: w * 0.0125))
            var p = Path(); p.move(to: CGPoint(x: w * 0.215, y: 0)); p.addLine(to: CGPoint(x: w * 0.285, y: 0))
            l.stroke(p, with: .color(L(1)), style: StrokeStyle(lineWidth: max(1.6, w * 0.022), lineCap: .round))
        }
        var tri = Path(); tri.move(to: CGPoint(x: w * 0.372, y: 0)); tri.addLine(to: CGPoint(x: w * 0.41, y: -w * 0.022)); tri.addLine(to: CGPoint(x: w * 0.41, y: w * 0.022)); tri.closeSubpath()
        r.fill(tri, with: .color(.white))
    }

    static func holo(_ cx: GraphicsContext, _ w: Double, _ t: Double, _ col: String) {
        let c = w / 2, va = A0 + t * SW, L = rgb(col)
        shadowed(cx, w, 0.4) { $0.fill(circle(c, c, w * 0.43), with: .radialGradient(Gradient(colors: [Color(8, 26, 36, 0.9), Color(2, 10, 16, 0.92)]), center: CGPoint(x: c, y: c - w * 0.12), startRadius: w * 0.05, endRadius: w * 0.43)) }
        cx.stroke(circle(c, c, w * 0.43), with: topLight(c, w * 0.43, 0.5), lineWidth: max(1, w * 0.012))
        let bands: [(Double, Double, [CGFloat], Double)] = [(0.40, 0.020, [w * 0.025, w * 0.012], 0.45), (0.355, 0.034, [w * 0.012, w * 0.012], 0.30), (0.305, 0.018, [w * 0.03, w * 0.01], 0.4)]
        for (bi, b) in bands.enumerated() { cx.stroke(circle(c, c, w * b.0), with: .color(L(b.3)), style: StrokeStyle(lineWidth: w * b.1, dash: b.2, dashPhase: CGFloat(bi) * w * 0.01)) }
        for r in [0.42, 0.285, 0.265] { cx.stroke(circle(c, c, w * r), with: .color(L(0.55)), lineWidth: max(0.8, w * 0.007)) }
        cx.drawLayer { l in l.addFilter(.shadow(color: L(0.9), radius: w * 0.025)); l.stroke(arc(c, w * 0.355, A0, va), with: .color(L(0.95)), style: StrokeStyle(lineWidth: w * 0.034, dash: [w * 0.012, w * 0.012])) }
        cx.fill(circle(c, c, w * 0.25), with: .linearGradient(Gradient(colors: [.white.opacity(0.1), .black.opacity(0.3)]), startPoint: CGPoint(x: 0, y: c - w * 0.24), endPoint: CGPoint(x: 0, y: c + w * 0.24)))
        let nD = 15, ringR = w * 0.465
        for i in 0..<nD {
            let u = Double(i) / Double(nD - 1), a = A0 + u * SW, x = c + cos(a) * ringR, y = c + sin(a) * ringR, rr = w * (0.012 + 0.024 * u)
            if u <= t + 0.001 {
                cx.drawLayer { l in l.addFilter(.shadow(color: L(0.95), radius: w * 0.025)); l.fill(circle(x, y, rr), with: .color(L(0.95))) }
                cx.fill(circle(x - rr * 0.2, y - rr * 0.3, rr * 0.4), with: .color(.white.opacity(0.7)))
            } else { cx.fill(circle(x, y, rr * 0.85), with: .color(L(0.22))) }
        }
        cx.fill(Path(CGRect(x: c - w * 0.007, y: c - w * 0.425, width: w * 0.014, height: w * 0.05)), with: .color(.white.opacity(0.9)))
        var r = cx; r.translateBy(x: c, y: c); r.rotate(by: .radians(va))
        r.drawLayer { l in
            l.addFilter(.shadow(color: L(0.95), radius: w * 0.0225))
            let bl = w * 0.17, bw = w * 0.042
            l.fill(Path(roundedRect: CGRect(x: w * 0.2, y: -bw / 2, width: bl, height: bw), cornerRadius: bw / 2), with: .color(Color(hex: "#f5fbff")))
        }
    }
}

// MARK: - step designs (appearance.js STEP_STYLES): Classic, Glass, Neon ring

/// The face of a step key in the chosen design (preview tiles and the sequencer).
struct StepFace: View {
    @Environment(\.panel) private var m
    @Environment(\.theme) private var th
    let design: String
    let on: Bool
    let accent: Bool
    let playhead: Bool
    let muted: Bool
    let radius: CGFloat
    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            switch design {
            case "glass": glass(w, h)
            case "neon": neon(w, h)
            default: classic(w, h)
            }
        }
    }
    private func classic(_ w: CGFloat, _ h: CGFloat) -> some View {
        let bar = RoundedRectangle(cornerRadius: m.r(0.16))
        return ZStack(alignment: .top) {
            RoundedRectangle(cornerRadius: radius).fill(LinearGradient(colors: playhead ? [Color(hex: "#54575d"), Color(hex: "#3a3c41")] : [Color(hex: "#34363b"), Color(hex: "#232528")], startPoint: .top, endPoint: .bottom))
                .overlay(RoundedRectangle(cornerRadius: radius).stroke(Color(hex: "#050506"), lineWidth: 1))
            Group {
                if playhead { bar.fill(Color(hex: "#fff3df")).shadow(color: Color(255, 240, 210, 0.8), radius: 3) }
                else if accent { bar.fill(th.ledHex == "#ffb23d" ? Color(hex: "#ff7a2e") : Color(hex: mixHex(th.ledHex, "#ffffff", 0.35))).shadow(color: th.ledHex == "#ffb23d" ? Color(255, 110, 40, 0.8) : th.led, radius: 3.5) }
                else if on { bar.fill(th.led).shadow(color: th.led.opacity(0.7), radius: 2.5) }
                else { bar.fill(Color(hex: "#1b1611")) }
            }
            .saturation(muted && on ? 0.2 : 1).brightness(muted && on ? -0.25 : 0)
            .frame(width: w * 0.64, height: m.r(0.32)).padding(.top, m.r(0.3))
        }
    }
    /// .steps-glass: lit glass tiles.
    private func glass(_ w: CGFloat, _ h: CGFloat) -> some View {
        let r = m.r(0.45), led = th.ledHex
        let fill: LinearGradient = on
            ? LinearGradient(stops: [.init(color: Color(hex: mixHex(led, "#ffffff", 0.08)).opacity(0.62 + 0.08), location: 0), .init(color: Color(hex: led).opacity(0.22), location: 0.7), .init(color: .black.opacity(0.2), location: 1)], startPoint: .top, endPoint: .bottom)
            : playhead ? LinearGradient(colors: [.white.opacity(0.4), .white.opacity(0.12)], startPoint: .top, endPoint: .bottom)
            : LinearGradient(stops: [.init(color: .white.opacity(0.13), location: 0), .init(color: .white.opacity(0.035), location: 0.55), .init(color: .black.opacity(0.18), location: 1)], startPoint: .top, endPoint: .bottom)
        return ZStack(alignment: .bottom) {
            RoundedRectangle(cornerRadius: r).fill(fill)
                .overlay(RoundedRectangle(cornerRadius: r).stroke(on ? Color(hex: mixHex(led, "#ffffff", 0.1)).opacity(0.7) : .white.opacity(0.13), lineWidth: 1))
                .overlay(alignment: .top) { Color.white.opacity(on ? 0.45 : 0.22).frame(height: 1).padding(.horizontal, r) }
                .overlay { if accent { RoundedRectangle(cornerRadius: r).stroke(Color.white, lineWidth: 1).padding(1) } }
                .shadow(color: on ? Color(hex: led).opacity(accent ? 0.75 : 0.45) : .black.opacity(0.55), radius: on ? (accent ? 8 : 5.5) : 1.5, y: on ? 0 : 1.5)
            RoundedRectangle(cornerRadius: m.r(0.1)).fill(on ? Color.white.opacity(0.75) : Color.white.opacity(0.08)).shadow(color: on ? .white : .clear, radius: 3)
                .frame(width: w * 0.76, height: m.r(0.16)).padding(.bottom, m.r(0.28))
        }
        .saturation(muted && on ? 0.2 : 1)
    }
    /// .steps-neon: glowing rings.
    private func neon(_ w: CGFloat, _ h: CGFloat) -> some View {
        let r = m.r(0.4), led = Color(hex: th.ledHex), d = m.r(1.05)
        return ZStack {
            RoundedRectangle(cornerRadius: r).fill(RadialGradient(colors: playhead ? [Color(hex: "#2c2f37"), Color(hex: "#14151a")] : [Color(hex: "#191b20"), Color(hex: "#0b0c0f")],
                                                                  center: UnitPoint(x: 0.5, y: 0.42), startRadius: 0, endRadius: max(w, h) * 0.75))
                .overlay(RoundedRectangle(cornerRadius: r).stroke(Color(hex: "#1d1f24"), lineWidth: 1))
            Circle()
                .fill(on ? RadialGradient(colors: [led.opacity(0.55), .clear], center: .center, startRadius: 0, endRadius: d * 0.36) : RadialGradient(colors: [.clear, .clear], center: .center, startRadius: 0, endRadius: 1))
                .overlay(Circle().stroke(playhead ? Color.white : accent ? Color.white : on ? led : Color(hex: "#30333a"), lineWidth: accent ? 3 : 2))
                .shadow(color: playhead ? .white : on ? led : .clear, radius: on || playhead ? (accent ? 6 : 4.5) : 0)
                .frame(width: d, height: d)
                .position(x: w / 2, y: h * 0.42)
        }
        .saturation(muted && on ? 0.2 : 1)
    }
}
