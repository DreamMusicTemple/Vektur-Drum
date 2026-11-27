// Vektur Drum — CSS "display:flex; flex-wrap:wrap" for the panel rows: items left to right with a gap, wrapping onto
// new lines (row gap), and items marked .flexGrow(n) sharing the space left on their line (flex:1 / .sp spacers).
import SwiftUI

private struct FlexGrowKey: LayoutValueKey { static let defaultValue: CGFloat = 0 }
extension View {
    /// CSS flex-grow inside a FlowRow.
    func flexGrow(_ g: CGFloat = 1) -> some View { layoutValue(key: FlexGrowKey.self, value: g) }
}

struct FlowRow: Layout {
    var gap: CGFloat
    var rowGap: CGFloat
    var alignment: VerticalAlignment = .center   // align-items: center (top for .stretch rows of sections)

    private struct Line { var items: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func lines(_ sub: Subviews, width: CGFloat) -> [Line] {
        var out: [Line] = [], cur = Line()
        for i in sub.indices {
            let w = sub[i].sizeThatFits(.unspecified).width
            let add = (cur.items.isEmpty ? 0 : gap) + w
            if !cur.items.isEmpty && cur.width + add > width + 0.5 { out.append(cur); cur = Line() }
            cur.width += (cur.items.isEmpty ? 0 : gap) + w; cur.items.append(i)
        }
        if !cur.items.isEmpty { out.append(cur) }
        return out
    }
    private func widths(_ sub: Subviews, _ line: Line, available: CGFloat) -> [CGFloat] {
        let base = line.items.map { sub[$0].sizeThatFits(.unspecified).width }
        let grow = line.items.map { sub[$0][FlexGrowKey.self] }, total = grow.reduce(0, +)
        let extra = max(0, available - line.width)
        return zip(base, grow).map { b, g in total > 0 ? b + extra * g / total : b }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        let ls = lines(subviews, width: width)
        var h: CGFloat = 0, maxW: CGFloat = 0
        for (n, l) in ls.enumerated() {
            let ws = widths(subviews, l, available: width.isFinite ? width : l.width)
            let lh = zip(l.items, ws).map { subviews[$0].sizeThatFits(ProposedViewSize(width: $1, height: nil)).height }.max() ?? 0
            h += lh + (n > 0 ? rowGap : 0); maxW = max(maxW, l.width)
        }
        return CGSize(width: width.isFinite ? width : maxW, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for l in lines(subviews, width: bounds.width) {
            let ws = widths(subviews, l, available: bounds.width)
            let hs = zip(l.items, ws).map { subviews[$0].sizeThatFits(ProposedViewSize(width: $1, height: nil)).height }
            let lh = hs.max() ?? 0
            var x = bounds.minX
            for (k, i) in l.items.enumerated() {
                let dy: CGFloat = alignment == .top ? 0 : (lh - hs[k]) / 2
                subviews[i].place(at: CGPoint(x: x, y: y + dy), anchor: .topLeading,
                                  proposal: ProposedViewSize(width: ws[k], height: alignment == .top ? lh : hs[k]))
                x += ws[k] + gap
            }
            y += lh + rowGap
        }
    }
}
