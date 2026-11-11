import SwiftUI

/// The set to do next: its values, which the Crown changes, and Done, which ticks it with them.
struct SetView: View {
  @EnvironmentObject private var phone: PhoneLink
  let workout: WatchWorkout
  /// The values changed here, by set, which go to the phone with its tick.
  @State private var drafts: [SetKey: [SetField: Double]] = [:]
  @State private var editing: Editing?

  var body: some View {
    if let next = workout.next, workout.exercises.indices.contains(next.exercise),
      workout.exercises[next.exercise].sets.indices.contains(next.set)
    {
      let exercise = workout.exercises[next.exercise]
      let set = exercise.sets[next.set]
      let key = SetKey(workoutId: workout.id, exercise: next.exercise, set: next.set)
      let draft = drafts[key] ?? [:]
      // The Crown never turns a needed value to none, so a value changed here is never missing.
      let missing = set.missing.filter { draft[$0] == nil }
      ScrollView {
        VStack(alignment: .leading, spacing: 6) {
          Text(exercise.name ?? workout.name ?? "Workout")
            .font(.system(size: 17, weight: .heavy, design: .rounded))
            .lineLimit(2)
          Text(subtitle(set: next.set, of: exercise.sets.count, last: set.lastText))
            .font(.system(size: 13, weight: .bold, design: .rounded))
            .foregroundStyle(Theme.secondary)
          if exercise.fields.contains(.reps) {
            HStack(spacing: 6) {
              ForEach(exercise.fields, id: \.self) { field in
                Button {
                  editing = Editing(key: key, field: field)
                } label: {
                  ValueTile(value: formatted(draft[field] ?? set.value(field)), unit: field.unit)
                }
                .buttonStyle(.plain)
              }
            }
          } else {
            Text(set.text).font(.system(size: 22, weight: .heavy, design: .rounded))
          }
          if missing.isEmpty {
            Button {
              phone.send(
                .setDone(
                  workoutId: workout.id, exercise: next.exercise, set: next.set, done: true,
                  values: draft))
            } label: {
              Label("Done", systemImage: "checkmark")
            }
            .buttonStyle(PillButtonStyle())
            // PhoneLink sends no second tick while one waits; this shows that it would not.
            .disabled(
              phone.isWaiting(workoutId: workout.id, exercise: next.exercise, set: next.set))
            .padding(.top, 4)
          } else {
            // A time is measured by the phone's clock.
            Text("Finish this set on your iPhone")
              .font(.system(size: 13, weight: .bold, design: .rounded))
              .foregroundStyle(Theme.secondary)
          }
          if !phone.waiting.isEmpty {
            Text("Waiting for your iPhone")
              .font(.system(size: 12, weight: .bold, design: .rounded))
              .foregroundStyle(Theme.warning)
          }
        }
        .foregroundStyle(Theme.text)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .sheet(item: $editing) { editing in
        let fields = exercise.fields.drop { $0 != editing.field }
        ValueEditor(
          fields: Array(fields), exercise: exercise,
          values: Binding(
            get: { drafts[editing.key] ?? [:] }, set: { drafts[editing.key] = $0 }),
          set: set)
      }
    } else {
      Text("All sets done")
        .font(.system(size: 17, weight: .heavy, design: .rounded))
        .foregroundStyle(Theme.secondary)
    }
  }

  private func subtitle(set: Int, of count: Int, last: String?) -> String {
    let position = "Set \(set + 1) of \(count)"
    return last.map { "\(position) · last \($0)" } ?? position
  }
}

/// A set of the workout the watch follows.
struct SetKey: Hashable {
  let workoutId: String
  let exercise: Int
  let set: Int
}

private struct Editing: Identifiable {
  let key: SetKey
  let field: SetField
  var id: String { "\(key.workoutId)/\(key.exercise)/\(key.set)/\(field.rawValue)" }
}

private struct ValueTile: View {
  let value: String
  let unit: String

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(value)
        .font(.system(size: 26, weight: .heavy, design: .rounded))
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      Text(unit).font(.system(size: 12, weight: .bold, design: .rounded))
        .foregroundStyle(Theme.secondary)
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 6)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Theme.tile, in: RoundedRectangle(cornerRadius: 14))
  }
}

extension SetField {
  var unit: String {
    switch self {
    case .weightKg: "KG"
    case .reps: "REPS"
    case .seconds: "TIME"
    case .meters: "M"
    }
  }
}
