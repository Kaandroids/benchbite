import XCTest

@testable import WatchLogic

final class CommandTests: XCTestCase {
  func body(_ command: WatchCommand?) -> [String: Any] {
    let data = Data(command!.json.utf8)
    return try! JSONSerialization.jsonObject(with: data) as! [String: Any]
  }

  func testSendsATickWithTheValuesEditedHere() {
    let command = WatchCommand.setDone(
      workoutId: "workout-1", exercise: 0, set: 1, done: true, values: [.weightKg: 82.5],
      rest: (seconds: 90, next: nil))
    let sent = body(command)
    XCTAssertEqual(sent["type"] as? String, "setDone")
    XCTAssertEqual(sent["v"] as? Int, protocolVersion)
    XCTAssertEqual((sent["values"] as? [String: Double])?["weightKg"], 82.5)
    // The rest it starts is reckoned from the command's own time.
    XCTAssertEqual(command?.change.startsRest?.endsAt, (sent["at"] as? Double).map { $0 + 90_000 })
  }

  func testSendsATickWithoutValuesWhenNoneWereEdited() {
    let sent = body(
      .setDone(workoutId: "workout-1", exercise: 0, set: 0, done: true, values: [:], rest: nil))
    XCTAssertNil(sent["values"])
  }

  func testSkipsARestWithNoEnd() {
    let sent = body(.setRest(workoutId: "workout-1", of: 1_000, endsAt: nil))
    XCTAssertTrue(sent["endsAt"] is NSNull)
    XCTAssertEqual(sent["of"] as? Double, 1_000)
  }

  func testGivesEachCommandAnIdOfItsOwn() {
    XCTAssertNotEqual(
      WatchCommand.join(workoutId: "workout-1")?.id, WatchCommand.join(workoutId: "workout-1")?.id)
  }
}
