import XCTest

@testable import WatchLogic

final class NextSetTests: XCTestCase {
  func testFindsTheFirstSetNotDoneFromAnExerciseOn() {
    let shown = workout([exercise("a", sets(2, done: 2)), exercise("b", sets(3, done: 1))])
    let next = shown.firstOpenSet(from: 0)
    XCTAssertEqual(next?.exerciseIndex, 1)
    XCTAssertEqual(next?.setIndex, 1)
  }

  func testGoesRoundToTheExercisesBefore() {
    let shown = workout([exercise("a", sets(2, done: 1)), exercise("b", sets(1, done: 1))])
    XCTAssertEqual(shown.firstOpenSet(from: 1)?.exerciseIndex, 0)
  }

  func testSkipsSetsTickedHereThatThePhoneHasNotTaken() {
    let shown = workout([exercise("a", sets(3))])
    let ticked: Set = [SetIndex(exercise: 0, set: 0), SetIndex(exercise: 0, set: 1)]
    XCTAssertEqual(shown.firstOpenSet(from: 0, skipping: ticked)?.setIndex, 2)
  }

  func testFindsNoneWhenEverySetIsDone() {
    XCTAssertNil(workout([exercise("a", sets(2, done: 2))]).firstOpenSet(from: 0))
  }

  func testLabelsASetByItsNumberAndValues() {
    L10n.language = "en"
    let shown = workout([exercise("a", [set(), set(text: "")])])
    XCTAssertEqual(NextSet(exerciseIndex: 0, setIndex: 0, exercise: shown.exercises[0]).label,
      "Set 1 · 80 kg × 8")
    // A set without values yet, as a timed one before its clock, by its number alone.
    XCTAssertEqual(
      NextSet(exerciseIndex: 0, setIndex: 1, exercise: shown.exercises[0]).label, "Set 2")
  }
}
