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
  /// The sets a saved workout saved, of all its sets, and the records it set, for the summary
  /// (ADR 0119).
  let setsSaved: Int?
  let setCount: Int?
  let records: Int?
}

/// A workout the watch followed, saved on the phone, as the watch's summary shows it (ADR 0119).
struct FinishedWorkout {
  let id: String
  let title: String
  let startedAt: Double
  let endedAt: Double
  let setsSaved: Int
  let setCount: Int
  let records: Int

  /// The workout shown, if the state says the phone saved it: with the end, the sets and the
  /// records it was saved with, else as it was last sent. Only a workout the watch followed.
  static func saved(_ shown: WatchWorkout?, in state: WatchState) -> FinishedWorkout? {
    guard let shown, shown.follows,
      let end = state.ended.first(where: { $0.id == shown.id }), end.saved,
      let endedAt = end.endedAt
    else { return nil }
    return FinishedWorkout(
      id: shown.id, title: shown.title, startedAt: shown.startedAt, endedAt: endedAt,
      setsSaved: end.setsSaved ?? shown.setsToSave, setCount: end.setCount ?? shown.setsDone.count,
      records: end.records ?? 0)
  }
}

struct WatchWorkout: Decodable {
  let id: String
  let name: String?
  let startedAt: Double
  let current: Int
  /// The set to do next; none when every set is done.
  let next: WatchNext?
  let rest: WatchRest?
  /// How many sets finishing the workout saves: those done, and the one the phone's clock times.
  let setsToSave: Int
  let exercises: [WatchExercise]
  let applied: [String]
  /// The watch follows it, measuring it and signalling its rests while it can; else it offers to
  /// join.
  let follows: Bool
}

struct WatchNext: Decodable {
  let exercise: Int
  let set: Int
}

struct WatchRest: Decodable {
  let endsAt: Double
  let seconds: Int
}

/// The rest as the watch shows it: the phone's, or one a change made here, not applied yet, starts
/// or changes.
struct ShownRest: Equatable {
  let endsAt: Double
  let seconds: Int
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

/// A command for the phone, as JSON, made once with the time the user acted; the watch keeps its
/// workout and what it changes, to show it until the phone has applied it.
struct WatchCommand {
  /// What a command changes, which the watch shows until the phone has applied it.
  enum Change {
    /// With the rest it starts, as the watch reckons it until the phone says.
    case tick(exercise: Int, set: Int, startsRest: ShownRest?)
    /// The rest ending at `endsAt`, or skipped.
    case rest(endsAt: Double?)
    case join
    /// The exercise picked from the list, whose sets come next once the phone opens it.
    case open(exercise: Int)
    /// The workout finished here, which the phone saves (ADR 0118).
    case finish
  }

  let id: String
  let workoutId: String
  let change: Change
  /// When the user did it, in milliseconds since the epoch.
  let at: Double
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
    self.at = at
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
        endsAt: at + Double($0.seconds) * 1000, seconds: $0.seconds, next: $0.next)
    }
    return WatchCommand(
      workoutId: workoutId, change: .tick(exercise: exercise, set: set, startsRest: startsRest),
      body: body, at: at)
  }

  /// Follows the workout from now on.
  static func join(workoutId: String) -> WatchCommand? {
    WatchCommand(workoutId: workoutId, change: .join, body: ["type": "join"])
  }

  /// Opens the exercise on the phone, whose sets then come next (ADR 0117).
  static func open(workoutId: String, exercise: Int) -> WatchCommand? {
    WatchCommand(
      workoutId: workoutId, change: .open(exercise: exercise),
      body: ["type": "open", "exercise": exercise])
  }

  /// Finishes the workout, which the phone then saves and ends (ADR 0118).
  static func finish(workoutId: String) -> WatchCommand? {
    WatchCommand(workoutId: workoutId, change: .finish, body: ["type": "finish"])
  }

  /// Makes the rest that ends at `of` end at `endsAt`, or skips it.
  static func setRest(workoutId: String, of: Double, endsAt: Double?) -> WatchCommand? {
    WatchCommand(
      workoutId: workoutId, change: .rest(endsAt: endsAt),
      body: ["type": "setRest", "of": of, "endsAt": endsAt ?? NSNull()])
  }

  /// The JSON, which the phone's module keeps for JavaScript without reading it.
  var payload: [String: Any] {
    ["command": json]
  }
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

  var isFinish: Bool {
    guard case .finish = self else { return false }
    return true
  }

  /// The exercise a pick opens.
  var opens: Int? {
    guard case .open(let exercise) = self else { return nil }
    return exercise
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

  /// The workout's name, or a plain one where it has none.
  var title: String { name ?? "Workout" }

  /// An exercise's name, or the workout's where the phone's library does not know it.
  func name(of exercise: WatchExercise) -> String {
    exercise.name ?? title
  }

  /// How many of its sets are done, of how many.
  var setsDone: (done: Int, count: Int) {
    let sets = exercises.flatMap(\.sets)
    return (sets.filter(\.done).count, sets.count)
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
