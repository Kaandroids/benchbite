import XCTest

@testable import WatchLogic

final class StateTests: XCTestCase {
  /// The phone's state with no workout under way, `ended` its ended workouts, in `version`.
  func state(ended: [[String: Any]], version: Int = protocolVersion) -> String {
    let json: [String: Any] = ["v": version, "seq": 3, "workout": NSNull(), "ended": ended]
    return String(data: try! JSONSerialization.data(withJSONObject: json), encoding: .utf8)!
  }

  let saved: [String: Any] = [
    "id": "workout-1", "saved": true, "endedAt": 1_800_003_600_000, "setsSaved": 7,
    "setCount": 8, "records": 2,
  ]

  func testDropsAStateOfAnotherVersion() {
    XCTAssertNotNil(WatchState.decode(state(ended: [])))
    XCTAssertNil(WatchState.decode(state(ended: [], version: protocolVersion + 1)))
  }

  func testSumsUpAFollowedWorkoutThePhoneSaved() {
    let decoded = WatchState.decode(state(ended: [saved]))!
    let finished = FinishedWorkout.saved(workout([exercise("a", sets(2))]), in: decoded)
    XCTAssertEqual(finished?.setsSaved, 7)
    XCTAssertEqual(finished?.setCount, 8)
    XCTAssertEqual(finished?.records, 2)
    XCTAssertEqual(finished?.endedAt, 1_800_003_600_000)
  }

  func testSumsUpNoWorkoutTheWatchDidNotFollow() {
    let decoded = WatchState.decode(state(ended: [saved]))!
    XCTAssertNil(
      FinishedWorkout.saved(workout([exercise("a", sets(2))], follows: false), in: decoded))
  }

  func testCountsTheSetsDone() {
    let shown = workout([exercise("a", sets(3, done: 2)), exercise("b", sets(1))])
    XCTAssertEqual(shown.setsDone.done, 2)
    XCTAssertEqual(shown.setsDone.count, 4)
  }
}
