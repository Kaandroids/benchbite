import XCTest

@testable import WatchLogic

/// A superset of `a` and `b` resting 90 seconds after each round, then `c` on its own, as
/// supersetRound() and toggleDoneUnchecked() in src/sessions/session.ts do them (ADR 0137).
final class SupersetTests: XCTestCase {
  let shown = workout([
    exercise("a", sets(3), superset: 1),
    exercise("b", sets(2), superset: 1),
    exercise("c", sets(2)),
  ])

  func tick(_ exercise: Int, _ set: Int) -> SetIndex { SetIndex(exercise: exercise, set: set) }

  func testFindsTheExercisesOfASuperset() {
    XCTAssertEqual(shown.supersetMembers(of: 1), [0, 1])
    XCTAssertEqual(shown.supersetMembers(of: 2), [])
  }

  func testCountsRoundsByTheExerciseWithTheMostSets() {
    XCTAssertEqual(shown.supersetRound(of: 0, ticked: [])?.round, 1)
    XCTAssertEqual(shown.supersetRound(of: 0, ticked: [])?.rounds, 3)
    XCTAssertEqual(shown.supersetRound(of: 0, ticked: [tick(0, 0)])?.round, 1)
    XCTAssertEqual(shown.supersetRound(of: 0, ticked: [tick(0, 0), tick(1, 0)])?.round, 2)
    XCTAssertNil(shown.supersetRound(of: 2, ticked: []))
  }

  func testMovesOnInTheRoundWithoutARest() {
    let after = shown.afterTick(of: 0, ticked: [tick(0, 0)])
    XCTAssertFalse(after.rests)
    XCTAssertEqual(after.next?.exerciseIndex, 1)
    XCTAssertEqual(after.next?.setIndex, 0)
  }

  func testRestsAfterTheRoundAndGoesBackToTheExerciseFurthestBehind() {
    let after = shown.afterTick(of: 1, ticked: [tick(0, 0), tick(1, 0)])
    XCTAssertTrue(after.rests)
    XCTAssertEqual(after.next?.exerciseIndex, 0)
    XCTAssertEqual(after.next?.setIndex, 1)
  }

  func testLeavesAnExerciseOutOfSetsOutOfTheLaterRounds() {
    // b has two sets: the third round is a's alone, which rests after its set.
    let ticked: Set = [tick(0, 0), tick(1, 0), tick(0, 1), tick(1, 1), tick(0, 2)]
    let after = shown.afterTick(of: 0, ticked: ticked)
    XCTAssertTrue(after.rests)
    // The superset is done: on to c.
    XCTAssertEqual(after.next?.exerciseIndex, 2)
  }

  func testAnExerciseOnItsOwnRestsAndGoesOnToItsNextSet() {
    let after = shown.afterTick(of: 2, ticked: [tick(2, 0)])
    XCTAssertTrue(after.rests)
    XCTAssertEqual(after.next?.exerciseIndex, 2)
    XCTAssertEqual(after.next?.setIndex, 1)
  }
}
