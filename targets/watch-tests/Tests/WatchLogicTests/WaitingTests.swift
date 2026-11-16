import XCTest

@testable import WatchLogic

/// What the watch shows while the commands it sent wait for the phone (ADR 0121).
final class WaitingTests: XCTestCase {
  let twoExercises = workout([exercise("a", sets(3), rest: 90), exercise("b", sets(2))])

  func waiting(_ commands: WatchCommand?..., reachable: Bool = false) -> WaitingCommands {
    WaitingCommands(
      commands: Dictionary(uniqueKeysWithValues: commands.compactMap { $0 }.map { ($0.id, $0) }),
      reachable: reachable)
  }

  func tick(_ exercise: Int, _ set: Int, rest: Int? = nil) -> WatchCommand? {
    .setDone(
      workoutId: "workout-1", exercise: exercise, set: set, done: true, values: [:],
      rest: rest.map { (seconds: $0, next: nil) })
  }

  func testGoesOnPastTicksThePhoneHasNotTaken() {
    let shown = waiting(tick(0, 0), tick(0, 1))
    XCTAssertTrue(shown.isTickWaiting(workoutId: "workout-1", exercise: 0, set: 0))
    XCTAssertEqual(shown.nextSet(of: twoExercises)?.exerciseIndex, 0)
    XCTAssertEqual(shown.nextSet(of: twoExercises)?.setIndex, 2)
  }

  func testOpensThePickedExercise() {
    let shown = waiting(.open(workoutId: "workout-1", exercise: 1))
    XCTAssertEqual(shown.picked(workoutId: "workout-1"), 1)
    XCTAssertEqual(shown.nextSet(of: twoExercises)?.exerciseIndex, 1)
    XCTAssertEqual(shown.openExercise(of: twoExercises), 1)
  }

  func testShowsThePhonesNextSetWithNothingWaiting() {
    XCTAssertNil(waiting().nextSet(of: twoExercises))
  }

  func testCountsTicksWaitingOnlyOutOfReach() {
    XCTAssertEqual(waiting(tick(0, 0), tick(1, 0)).setsWaitingOutOfReach(of: twoExercises), 2)
    XCTAssertEqual(
      waiting(tick(0, 0), reachable: true).setsWaitingOutOfReach(of: twoExercises), 0)
  }

  func testSavesTheSetsTickedAndTimedHereOnAFinish() {
    let start = WatchCommand.startClock(workoutId: "workout-1", exercise: 1, set: 0)
    XCTAssertEqual(waiting(tick(0, 0), start).setsToSave(of: twoExercises), 2)
    // A set both timed and ticked here is one set.
    XCTAssertEqual(waiting(tick(1, 0), start).setsToSave(of: twoExercises), 1)
  }

  func testShowsTheClockAStartHereStartedUntilATickStopsIt() {
    let start = WatchCommand.startClock(workoutId: "workout-1", exercise: 1, set: 0)
    XCTAssertEqual(waiting(start).clockStart(of: twoExercises, exercise: 1, set: 0), start?.at)
    XCTAssertNil(waiting(start, tick(1, 0)).clockStart(of: twoExercises, exercise: 1, set: 0))
    XCTAssertNil(waiting().clockStart(of: twoExercises, exercise: 1, set: 0))
  }

  func testShowsTheRestATickHereStartsAndOneSkipped() {
    let ticked = tick(0, 0, rest: 90)
    let rest = waiting(ticked).rest(of: twoExercises)
    XCTAssertEqual(rest?.seconds, 90)
    XCTAssertEqual(rest?.endsAt, ticked.map { $0.at + 90_000 })
    let skip = WatchCommand.setRest(workoutId: "workout-1", of: rest!.endsAt, endsAt: nil)
    XCTAssertNil(waiting(ticked, skip).rest(of: twoExercises))
    XCTAssertTrue(waiting(skip).isRestWaiting(workoutId: "workout-1"))
  }

  func testKnowsAJoinAndAFinishWaiting() {
    XCTAssertTrue(
      waiting(.join(workoutId: "workout-1")).isJoinWaiting(workoutId: "workout-1"))
    XCTAssertTrue(
      waiting(.finish(workoutId: "workout-1")).isFinishWaiting(workoutId: "workout-1"))
    XCTAssertFalse(waiting().isFinishWaiting(workoutId: "workout-1"))
  }

  func testLeavesOutCommandsOfAnotherWorkout() {
    let other = WatchCommand.setDone(
      workoutId: "workout-0", exercise: 0, set: 0, done: true, values: [:], rest: nil)
    XCTAssertEqual(waiting(other).setsWaitingOutOfReach(of: twoExercises), 0)
    XCTAssertFalse(waiting(other).isTickWaiting(workoutId: "workout-1", exercise: 0, set: 0))
  }

  func testRepeatsNothingButWhatWaits() {
    let ticked = tick(0, 0)
    let shown = waiting(ticked, .join(workoutId: "workout-1"))
    XCTAssertTrue(shown.repeats(tick(0, 0)!, of: twoExercises))
    XCTAssertFalse(shown.repeats(tick(0, 1)!, of: twoExercises))
    XCTAssertTrue(shown.repeats(.join(workoutId: "workout-1")!, of: twoExercises))
    XCTAssertFalse(waiting().repeats(.finish(workoutId: "workout-1")!, of: twoExercises))
    let rest = WatchCommand.setRest(workoutId: "workout-1", of: 1_000, endsAt: nil)!
    XCTAssertTrue(waiting(rest).repeats(rest, of: twoExercises))
    let start = WatchCommand.startClock(workoutId: "workout-1", exercise: 1, set: 0)!
    XCTAssertTrue(waiting(start).repeats(start, of: twoExercises))
    XCTAssertFalse(
      waiting(start).repeats(
        .startClock(workoutId: "workout-1", exercise: 1, set: 1)!, of: twoExercises))
    let finish = WatchCommand.finish(workoutId: "workout-1")!
    XCTAssertTrue(waiting(finish).repeats(finish, of: twoExercises))
  }

  func testRepeatsAPickOfTheExerciseShownOnly() {
    // The tick waiting leads on in exercise a, which is then shown.
    let shown = waiting(tick(0, 0))
    XCTAssertTrue(shown.repeats(.open(workoutId: "workout-1", exercise: 0)!, of: twoExercises))
    XCTAssertFalse(shown.repeats(.open(workoutId: "workout-1", exercise: 1)!, of: twoExercises))
    // Without the workout shown, a pick goes.
    XCTAssertFalse(shown.repeats(.open(workoutId: "workout-1", exercise: 0)!, of: nil))
  }
}
