import SwiftUI

/// The set to do next: its values, which the Crown changes, and Done, which ticks it with them.
struct SetView: View {
  @EnvironmentObject private var phone: PhoneLink
  let workout: WatchWorkout
  /// The values changed here, by set, which go to the phone with its tick.
  @State private var drafts: [SetKey: [SetField: Draft]] = [:]
  @State private var editing: Editing?

  var body: some View {
    if let next = workout.nextSet {
      let set = next.set
      let key = SetKey(workoutId: workout.id, exercise: next.exerciseIndex, set: next.setIndex)
      let draft = values(of: key, set: set)
      // The Crown never turns a needed value to none, so a value changed here is never missing.
      let missing = set.missing.filter { draft[$0] == nil }
      ScrollView {
        VStack(alignment: .leading, spacing: 6) {
          Text(next.exercise.name ?? workout.name ?? "Workout")
            .font(.rounded(17, .heavy))
            .lineLimit(2)
          Text(subtitle(next))
            .font(.rounded(13))
            .foregroundStyle(Theme.secondary)
          let editable = next.exercise.fields.filter { next.exercise.crown[$0] != nil }
          if editable.isEmpty {
            Text(set.text).font(.rounded(22, .heavy))
          } else {
            HStack(spacing: 6) {
              ForEach(editable, id: \.self) { field in
                Button {
                  editing = Editing(key: key, fields: Array(editable.drop { $0 != field }))
                } label: {
                  ValueTile(value: formatted(draft[field] ?? set.value(field)), unit: field.unit)
                }
                .buttonStyle(.plain)
              }
            }
          }
          if missing.isEmpty {
            Button {
              phone.send(
                .setDone(
                  workoutId: workout.id, exercise: next.exerciseIndex, set: next.setIndex,
                  done: true, values: draft))
            } label: {
              Label("Done", systemImage: "checkmark")
            }
            .buttonStyle(PillButtonStyle())
            // PhoneLink sends no second tick while one waits; this shows that it would not.
            .disabled(
              phone.isWaiting(
                workoutId: workout.id, exercise: next.exerciseIndex, set: next.setIndex))
            .padding(.top, 4)
          } else {
            // A time is measured by the phone's clock.
            Text("Finish this set on your iPhone")
              .font(.rounded(13))
              .foregroundStyle(Theme.secondary)
          }
          if !phone.waiting.isEmpty {
            Text("Waiting for your iPhone")
              .font(.rounded(12))
              .foregroundStyle(Theme.warning)
          }
        }
        .foregroundStyle(Theme.text)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .sheet(item: $editing) { editing in
        let draft = values(of: editing.key, set: set)
        ValueEditor(
          fields: editing.fields, crown: next.exercise.crown,
          start: { draft[$0] ?? set.value($0) }
        ) { field, value in
          drafts[editing.key, default: [:]][field] = Draft(value: value, over: set.value(field))
        }
      }
    } else {
      Text("All sets done")
        .font(.rounded(17, .heavy))
        .foregroundStyle(Theme.secondary)
    }
  }

  /// The values changed here for a set, but none the phone has changed since.
  private func values(of key: SetKey, set: WatchSet) -> [SetField: Double] {
    (drafts[key] ?? [:]).filter { $0.value.over == set.value($0.key) }.mapValues(\.value)
  }

  private func subtitle(_ next: NextSet) -> String {
    let position = "Set \(next.setIndex + 1) of \(next.exercise.sets.count)"
    return next.set.lastText.map { "\(position) · last \($0)" } ?? position
  }
}

/// A set of the workout the watch follows.
struct SetKey: Hashable {
  let workoutId: String
  let exercise: Int
  let set: Int
}

/// A value changed here, and the phone's value it was changed over: one the phone changes after
/// it wins, as the latest change.
private struct Draft {
  let value: Double
  let over: Double?
}

private struct Editing: Identifiable {
  let key: SetKey
  /// The value tapped and those after it.
  let fields: [SetField]
  var id: String {
    "\(key.workoutId)/\(key.exercise)/\(key.set)/\(fields.first?.rawValue ?? "")"
  }
}

private struct ValueTile: View {
  let value: String
  let unit: String

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(value)
        .font(.rounded(26, .heavy))
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      Text(unit).font(.rounded(12))
        .foregroundStyle(Theme.secondary)
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 6)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Theme.tile, in: RoundedRectangle(cornerRadius: 14))
  }
}
