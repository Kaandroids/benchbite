import XCTest

@testable import WatchLogic

/// How the Crown turns a value (ADR 0125).
final class CrownTests: XCTestCase {
  /// A barbell's weight: by half a kilogram turned slowly, by 2.5 kg turned fast.
  let weight = CrownRange(min: 2.5, max: 999.75, step: 2.5, fine: 0.5)
  let reps = CrownRange(min: 1, max: 999, step: 1, fine: nil)

  func testTurnsSlowlyByTheFineStep() {
    XCTAssertEqual(weight.turned(61.5, by: 1, fast: false), 62)
    XCTAssertEqual(weight.turned(61.5, by: -2, fast: false), 60.5)
  }

  func testTurnsFastOntoTheCoarseGrid() {
    XCTAssertEqual(weight.turned(61.5, by: 1, fast: true), 62.5)
    XCTAssertEqual(weight.turned(61.5, by: 2, fast: true), 65)
    XCTAssertEqual(weight.turned(61.5, by: -1, fast: true), 60)
    // From a value on the grid, a whole step on.
    XCTAssertEqual(weight.turned(60, by: 1, fast: true), 62.5)
  }

  func testTurnsWithoutAFineStepFromWhereTheValueIs() {
    let plates = CrownRange(min: 2.5, max: 999.75, step: 2.5, fine: nil)
    XCTAssertEqual(plates.turned(81, by: 1, fast: false), 83.5)
    XCTAssertEqual(reps.turned(8, by: 3, fast: true), 11)
  }

  func testStaysWithinTheRange() {
    XCTAssertEqual(reps.turned(1, by: -1, fast: false), 1)
    XCTAssertEqual(weight.turned(999, by: 5, fast: true), 999.75)
  }

  func testRoundsToTheHundredth() {
    let dumbbell = CrownRange(min: 2, max: 999.75, step: 2, fine: 0.25)
    XCTAssertEqual(dumbbell.turned(10.1, by: 1, fast: false), 10.35)
  }

  func testCountsWholeDetentsOnly() {
    XCTAssertEqual(
      CrownDetents.at(2.4, from: 0, span: 1000),
      CrownDetents(turned: 2, detent: 2, recentre: false))
    XCTAssertEqual(CrownDetents.at(2.3, from: 2, span: 1000).turned, 0)
    XCTAssertEqual(CrownDetents.at(-1, from: 2, span: 1000).turned, -3)
  }

  func testComesBackToTheMiddleNearAnEnd() {
    XCTAssertEqual(
      CrownDetents.at(501, from: 500, span: 1000),
      CrownDetents(turned: 1, detent: 0, recentre: true))
    XCTAssertEqual(CrownDetents.at(-501, from: -500, span: 1000).recentre, true)
    XCTAssertEqual(CrownDetents.at(500, from: 499, span: 1000).recentre, false)
  }

  func testTakesAJumpForTheCrownStartingOver() {
    // Not moved back to the middle, the Crown reports where it was: counted from there on.
    XCTAssertEqual(
      CrownDetents.at(502, from: 0, span: 1000),
      CrownDetents(turned: 0, detent: 502, recentre: false))
    XCTAssertEqual(
      CrownDetents.at(80, from: 0, span: 1000),
      CrownDetents(turned: 0, detent: 80, recentre: false))
  }
}
