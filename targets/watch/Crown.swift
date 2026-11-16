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
