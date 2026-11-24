import Foundation

// How the Crown turns a value (ADR 0125), plain logic kept apart from the view, so that it is
// tested on a Mac (targets/watch-tests, #540).
extension CrownRange {
  /// A value turned by `detents`: by the fine step turned slowly, and turned fast by the coarse one,
  /// onto its grid, so that 61.5 goes on to 62.5 and 65; without a fine step always by the coarse
  /// one from where it is, so that 81 turns to 83.5. Within the range, to the hundredth.
  func turned(_ value: Double, by detents: Double, fast: Bool) -> Double {
    var next = value
    let steps = Int(detents.magnitude.rounded())
    let up = detents > 0
    for _ in 0..<steps {
      guard let fine else {
        // A single step, from wherever the value is.
        next += up ? step : -step
        continue
      }
      if fast {
        // Onto the coarse grid, a whole step on from where it is.
        let place = next / step
        next = (up ? (place + 1e-9).rounded(.down) + 1 : (place - 1e-9).rounded(.up) - 1)
          * step
      } else {
        next += up ? fine : -fine
      }
    }
    return (Swift.min(Swift.max(next, min), max) * 100).rounded() / 100
  }
}

/// What a position the Crown reports turns, from the last whole detent counted (#718): whole
/// detents only, whatever it reports in between; and back to the middle of its span once it nears
/// an end, as the span is kept small. A jump larger than a turn makes is taken as the Crown
/// reporting a position it was not brought back from, and turns nothing.
struct CrownDetents: Equatable {
  /// The detents turned, signed; none when the position stays at the last whole detent.
  let turned: Double
  /// The whole detent to count the next position from.
  let detent: Double
  /// Whether to bring the Crown back to the middle of its span, at 0.
  let recentre: Bool

  /// The most detents a single report moves by; more is the Crown starting over.
  static let largestTurn = 50.0

  static func at(_ position: Double, from detent: Double, span: Double) -> CrownDetents {
    let whole = position.rounded()
    let moved = whole - detent
    // Counted from where it is, and not brought back again, so that a Crown the system did not
    // move back is not sent back over and over.
    if moved.magnitude > largestTurn {
      return CrownDetents(turned: 0, detent: whole, recentre: false)
    }
    let recentre = whole.magnitude > span / 2
    return CrownDetents(turned: moved, detent: recentre ? 0 : whole, recentre: recentre)
  }
}
