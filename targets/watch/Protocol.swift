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
  /// How the latest workouts ended, latest first.
  let ended: [WatchEnded]
}

/// How a workout ended: saved as a log, at the time it ended, or let go.
struct WatchEnded: Decodable, Equatable {
  let id: String
  let saved: Bool
  let endedAt: Double?
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
  /// The watch follows it and signals the end of a rest; else it offers to join.
  let follows: Bool
}

struct WatchNext: Decodable {
  let exercise: Int
  let set: Int
}

struct WatchRest: Decodable {
  let endsAt: Double
  let seconds: Int
  /// The watch started or last changed it, and so signals its end.
  let byWatch: Bool
}

/// The rest as the watch shows it: the phone's, or one a change made here, not applied yet, starts
/// or changes.
struct ShownRest: Equatable {
  let endsAt: Double
  let seconds: Int
  let byWatch: Bool
  /// The set after it, as "Set 4 · 80 kg × 8".
  let next: String?
}

struct WatchExercise: Decodable {
  let exerciseId: String
  /// None when the phone's library does not know it.
  let name: String?
  /// What its sets record: the weight and the reps, or a time with or without a distance.
  let fields: [SetField]
  /// The values the Crown changes, and how; none for sets measured by time.
  let crown: [SetField: CrownRange]
  let restSeconds: Int
  let sets: [WatchSet]
}

/// How the Crown turns a value: from `min` to `max`, by `step`.
struct CrownRange: Decodable {
  let min: Double
  let max: Double
  let step: Double
}

/// A value a set records, as SetField in src/sets/fields.ts.
enum SetField: String, Decodable, CodingKeyRepresentable {
  case weightKg, reps, seconds, meters

  /// Under a value, as "80 KG".
  var unit: String {
    switch self {
    case .weightKg: "KG"
    case .reps: "REPS"
    case .seconds: "TIME"
    case .meters: "M"
    }
  }

  /// Over a value the Crown turns.
  var label: String {
    switch self {
    case .weightKg: "WEIGHT"
    case .reps: "REPS"
    case .seconds: "TIME"
    case .meters: "DISTANCE"
    }
  }
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
    /// With the rest it starts, as the watch reckons it until the phone says.
    case tick(exercise: Int, set: Int, startsRest: ShownRest?)
    /// The rest ending at `endsAt`, or skipped.
    case rest(endsAt: Double?)
    case join
  }

  let id: String
  let workoutId: String
  let change: Change
  let json: String

  /// Now, as a command's time, in whole milliseconds since the epoch.
  static func now() -> Double { (Date().timeIntervalSince1970 * 1000).rounded() }

  private init?(workoutId: String, change: Change, body: [String: Any], at: Double = now()) {
    let id = UUID().uuidString
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
    self.change = change
    self.json = json
  }

  /// Sets a set done or not done, as of now, with the values edited on the watch set first. A tick
  /// that starts a rest of `rest` seconds reckons its end from the command's own time, as the
  /// phone does (toggleDoneUnchecked in src/sessions/session.ts), so that a change of it made
  /// before the phone answers is of the rest the phone then has.
  static func setDone(
    workoutId: String, exercise: Int, set: Int, done: Bool, values: [SetField: Double],
    rest: (seconds: Int, next: String?)?
  ) -> WatchCommand? {
    var body: [String: Any] = ["type": "setDone", "exercise": exercise, "set": set, "done": done]
    if !values.isEmpty {
      body["values"] = Dictionary(uniqueKeysWithValues: values.map { ($0.key.rawValue, $0.value) })
    }
    let at = now()
    let startsRest = rest.map {
      ShownRest(
        endsAt: at + Double($0.seconds) * 1000, seconds: $0.seconds, byWatch: true, next: $0.next)
    }
    return WatchCommand(
      workoutId: workoutId, change: .tick(exercise: exercise, set: set, startsRest: startsRest),
      body: body, at: at)
  }

  /// Follows the workout from now on.
  static func join(workoutId: String) -> WatchCommand? {
    WatchCommand(workoutId: workoutId, change: .join, body: ["type": "join"])
  }

  /// Makes the rest that ends at `of` end at `endsAt`, or skips it.
  static func setRest(workoutId: String, of: Double, endsAt: Double?) -> WatchCommand? {
    WatchCommand(
      workoutId: workoutId, change: .rest(endsAt: endsAt),
      body: ["type": "setRest", "of": of, "endsAt": endsAt ?? NSNull()])
  }

  /// The JSON with what the phone's module reads without reading it: the workout it is for, and
  /// whether it makes the rest the watch's to signal, so that the phone's notification goes.
  var payload: [String: Any] {
    ["command": json, "workoutId": workoutId, "takesRest": takesRest]
  }

  private var takesRest: Bool { change.startsRest != nil || change.isRest }
}

extension WatchCommand.Change {
  func isTick(exercise: Int, set: Int) -> Bool {
    guard case .tick(exercise, set, _) = self else { return false }
    return true
  }

  var isRest: Bool {
    guard case .rest = self else { return false }
    return true
  }

  var isJoin: Bool {
    guard case .join = self else { return false }
    return true
  }

  /// The rest a tick starts, as the watch reckons it.
  var startsRest: ShownRest? {
    guard case .tick(_, _, let startsRest) = self else { return nil }
    return startsRest
  }
}

/// A value as the watch shows it: a weight to its quarter kilogram, without trailing zeros.
func formatted(_ value: Double?) -> String {
  guard let value else { return "—" }
  return value.formatted(.number.precision(.fractionLength(0...2)))
}

/// The set to do next, as the phone found it.
struct NextSet {
  let exerciseIndex: Int
  let setIndex: Int
  let exercise: WatchExercise
  var set: WatchSet { exercise.sets[setIndex] }
  /// As "Set 4 · 80 kg × 8".
  var label: String { "Set \(setIndex + 1) · \(set.text)" }
}

extension WatchWorkout {
  /// The set to do after a tick of this one, before the phone says: the first not done after it,
  /// then in the exercises after it, then in those before it, as nextSetOf() goes on.
  func nextSet(after exercise: Int, set: Int) -> NextSet? {
    let count = exercises.count
    for step in 0..<count {
      let index = (exercise + step) % count
      let first = step == 0 ? set + 1 : 0
      let sets = exercises[index].sets
      if let next = sets.indices.first(where: { $0 >= first && !sets[$0].done }) {
        return NextSet(exerciseIndex: index, setIndex: next, exercise: exercises[index])
      }
    }
    return nil
  }

  var nextSet: NextSet? {
    guard let next, exercises.indices.contains(next.exercise),
      exercises[next.exercise].sets.indices.contains(next.set)
    else { return nil }
    return NextSet(
      exerciseIndex: next.exercise, setIndex: next.set, exercise: exercises[next.exercise])
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
