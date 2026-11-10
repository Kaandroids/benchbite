import Foundation

// The messages of the protocol between the phone and the watch, as src/watch/protocol.ts defines
// them (ADR 0109). The phone keeps the workout and sends its state; the watch sends commands, each
// saying what a set should be, never what to toggle.

/// Raised with the phone's PROTOCOL_VERSION; a message of another version is dropped.
let protocolVersion = 1

struct WatchState: Decodable {
  let v: Int
  let seq: Double
  let workout: WatchWorkout?
}

struct WatchWorkout: Decodable {
  let id: String
  let name: String?
  let startedAt: Double
  let current: Int
  let rest: WatchRest?
  let exercises: [WatchExercise]
  let applied: [String]
}

struct WatchRest: Decodable {
  let endsAt: Double
  let seconds: Int
}

struct WatchExercise: Decodable {
  let exerciseId: String
  let name: String
  let restSeconds: Int
  let sets: [WatchSet]
}

/// A value a set records, as SetField in src/sets/fields.ts.
enum SetField: String, Decodable {
  case weightKg, reps, seconds, meters
}

struct WatchSet: Decodable {
  let weightKg: Double?
  let reps: Double?
  let seconds: Double?
  let meters: Double?
  let done: Bool
  /// What it still needs before the phone takes a tick; none when it can be ticked.
  let missing: [SetField]
  /// As the phone describes it: "80 kg × 8", "0:50" or "2000 m · 8:12".
  let text: String
}

/// A command for the phone, as JSON beside its workout's id, which the phone reads without
/// reading the JSON. The JSON is made once, with the time the user acted.
struct WatchCommand {
  let id: String
  let workoutId: String
  /// The set it is for.
  let exercise: Int
  let set: Int
  let json: String

  private init?(workoutId: String, exercise: Int, set: Int, body: [String: Any]) {
    let id = UUID().uuidString
    var message = body
    message["v"] = protocolVersion
    message["id"] = id
    message["at"] = (Date().timeIntervalSince1970 * 1000).rounded()
    message["workoutId"] = workoutId
    guard let data = try? JSONSerialization.data(withJSONObject: message),
      let json = String(data: data, encoding: .utf8)
    else { return nil }
    self.id = id
    self.workoutId = workoutId
    self.exercise = exercise
    self.set = set
    self.json = json
  }

  /// Sets a set done or not done, as of now.
  static func setDone(workoutId: String, exercise: Int, set: Int, done: Bool) -> WatchCommand? {
    WatchCommand(
      workoutId: workoutId, exercise: exercise, set: set,
      body: ["type": "setDone", "exercise": exercise, "set": set, "done": done])
  }

  var payload: [String: Any] {
    ["command": json, "workoutId": workoutId]
  }
}

extension WatchState {
  static func decode(_ json: String) -> WatchState? {
    guard let state = try? JSONDecoder().decode(WatchState.self, from: Data(json.utf8)),
      state.v == protocolVersion
    else { return nil }
    return state
  }
}
