import Foundation

@testable import WatchLogic

/// A set as the phone sends it, done or not, with its text.
func set(done: Bool = false, text: String = "80 kg × 8") -> [String: Any] {
  [
    "weightKg": 80, "reps": 8, "seconds": NSNull(), "meters": NSNull(), "done": done,
    "missing": [String](), "text": text, "lastText": NSNull(), "timedByClock": false,
    "targetSeconds": NSNull(),
  ]
}

/// An exercise of `sets`, resting `rest` seconds, in the superset `superset` or none.
func exercise(_ id: String, _ sets: [[String: Any]], rest: Int = 90, superset: Int? = nil)
  -> [String: Any]
{
  [
    "exerciseId": id, "name": id, "fields": ["weightKg", "reps"], "target": [String: Any](),
    "crown": [String: Any](), "restSeconds": rest, "superset": superset ?? NSNull(), "sets": sets,
  ]
}

/// A workout of `exercises` as the phone's state holds it, decoded as the watch decodes it.
func workout(_ exercises: [[String: Any]], follows: Bool = true) -> WatchWorkout {
  let json: [String: Any] = [
    "id": "workout-1", "name": "Full body", "startedAt": 1_800_000_000_000, "current": 0,
    "next": NSNull(), "rest": NSNull(), "clock": NSNull(), "setsToSave": 0,
    "exercises": exercises, "applied": [String](), "follows": follows,
  ]
  let data = try! JSONSerialization.data(withJSONObject: json)
  return try! JSONDecoder().decode(WatchWorkout.self, from: data)
}

/// `count` sets, the first `done` of them done.
func sets(_ count: Int, done: Int = 0) -> [[String: Any]] {
  (0..<count).map { set(done: $0 < done) }
}
