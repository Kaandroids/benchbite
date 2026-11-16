// The watch's side of the protocol's fixtures (#541), run by `pnpm check:watch` with the watch's
// Protocol.swift: reads each state the phone sends and writes back what it read, and makes each
// command the watch sends, with a fixed id and time. Prints both as JSON.
import Foundation

let fixtures = URL(fileURLWithPath: CommandLine.arguments[1])
let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]

var states: [String: Any] = [:]
let files = try FileManager.default.contentsOfDirectory(atPath: fixtures.path)
for file in files.sorted() where file.hasPrefix("state-") && file.hasSuffix(".json") {
  let data = try Data(contentsOf: fixtures.appendingPathComponent(file))
  let state = try JSONDecoder().decode(WatchState.self, from: data)
  states[file] = try JSONSerialization.jsonObject(with: encoder.encode(state))
}

let workoutId = "workout-1"
let made: [(String, WatchCommand?)] = [
  ("setDone", .setDone(workoutId: workoutId, exercise: 0, set: 1, done: true, values: [:], rest: nil)),
  (
    "setDoneWithValues",
    .setDone(
      workoutId: workoutId, exercise: 0, set: 1, done: true,
      values: [.weightKg: 82.5, .reps: 8], rest: (seconds: 90, next: nil))
  ),
  ("join", .join(workoutId: workoutId)),
  ("open", .open(workoutId: workoutId, exercise: 2)),
  ("startClock", .startClock(workoutId: workoutId, exercise: 2, set: 0)),
  ("finish", .finish(workoutId: workoutId)),
  ("setRest", .setRest(workoutId: workoutId, of: 1_800_000_150_000, endsAt: 1_800_000_165_000)),
  ("skipRest", .setRest(workoutId: workoutId, of: 1_800_000_150_000, endsAt: nil)),
]
var commands: [[String: Any]] = []
for (name, command) in made {
  guard let command,
    var body = try JSONSerialization.jsonObject(with: Data(command.json.utf8)) as? [String: Any]
  else { fatalError("The watch made no \(name) command") }
  body["id"] = "command-\(name)"
  body["at"] = 1_800_000_100_000
  commands.append(["name": name, "command": body])
}

let output = try JSONSerialization.data(
  withJSONObject: ["states": states, "commands": commands], options: [.sortedKeys])
print(String(data: output, encoding: .utf8)!)
