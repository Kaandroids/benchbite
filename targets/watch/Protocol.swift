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
  /// The set to do next; none when every set is done.
  let next: WatchNext?
  let rest: WatchRest?
  let exercises: [WatchExercise]
  let applied: [String]
}

struct WatchNext: Decodable {
  let exercise: Int
  let set: Int
}

struct WatchRest: Decodable {
  let endsAt: Double
  let seconds: Int
}

struct WatchExercise: Decodable {
  let exerciseId: String
  /// None when the phone's library does not know it.
  let name: String?
  /// What its sets record: the weight and the reps, or a time with or without a distance.
  let fields: [SetField]
  /// What the Crown turns a weight by.
  let weightStepKg: Double
  /// The weight is added to the body, and none is a value it can have.
  let addedWeight: Bool
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
  /// Last time's set of the same number, described the same way.
  let lastText: String?

  func value(_ field: SetField) -> Double? {
    switch field {
    case .weightKg: weightKg
    case .reps: reps
    case .seconds: seconds
    case .meters: meters
    }
  }
}

/// A command for the phone, as JSON beside its workout's id, which the phone reads without
/// reading the JSON. The JSON is made once, with the time the user acted.
struct WatchCommand {
  /// What a command changes, which the watch shows until the phone has applied it.
  enum Change {
    case tick(exercise: Int, set: Int)
    /// The rest the watch showed, ending at `endsAt`, or skipped.
    case rest(of: Double, endsAt: Double?)
  }

  let id: String
  let workoutId: String
  /// When the user did it, in milliseconds since the epoch.
  let at: Double
  let change: Change
  let json: String

  private init?(workoutId: String, change: Change, body: [String: Any]) {
    let id = UUID().uuidString
    let at = (Date().timeIntervalSince1970 * 1000).rounded()
    var message = body
    message["v"] = protocolVersion
    message["id"] = id
    message["at"] = at
    message["workoutId"] = workoutId
    guard let data = try? JSONSerialization.data(withJSONObject: message),
      let json = String(data: data, encoding: .utf8)
    else { return nil }
    self.id = id
    self.workoutId = workoutId
    self.at = at
    self.change = change
    self.json = json
  }

  /// Sets a set done or not done, as of now, with the values edited on the watch set first.
  static func setDone(
    workoutId: String, exercise: Int, set: Int, done: Bool, values: [SetField: Double] = [:]
  ) -> WatchCommand? {
    var body: [String: Any] = ["type": "setDone", "exercise": exercise, "set": set, "done": done]
    if !values.isEmpty {
      body["values"] = Dictionary(uniqueKeysWithValues: values.map { ($0.key.rawValue, $0.value) })
    }
    return WatchCommand(
      workoutId: workoutId, change: .tick(exercise: exercise, set: set), body: body)
  }

  /// Makes the rest that ends at `of` end at `endsAt`, or skips it.
  static func setRest(workoutId: String, of: Double, endsAt: Double?) -> WatchCommand? {
    WatchCommand(
      workoutId: workoutId, change: .rest(of: of, endsAt: endsAt),
      body: ["type": "setRest", "of": of, "endsAt": endsAt ?? NSNull()])
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
