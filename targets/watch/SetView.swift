import SwiftUI

/// The set to do next: its values, which the Crown changes, and Done, which ticks it with them.
struct SetView: View {
  @EnvironmentObject private var phone: PhoneLink
  let workout: WatchWorkout
  /// The values changed here for the set shown, which go to the phone with its tick.
  @State private var drafts: [SetKey: [SetField: Draft]] = [:]
  @State private var editing: Editing?

  var body: some View {
    if let next = phone.nextSet(of: workout) {
      let set = next.set
      let key = SetKey(workoutId: workout.id, exercise: next.exerciseIndex, set: next.setIndex)
      let draft = values(of: key, set: set)
      let editable = next.exercise.fields.filter { next.exercise.crown[$0] != nil }
      // The watch decides only about its own drafts (ADR 0111): the Crown never turns a needed
      // value to none, so a value changed here is never missing.
      let missing = set.missing.filter { draft[$0] == nil }
      ScrollView {
        VStack(alignment: .leading, spacing: 6) {
          StatusLine(workout: workout)
          Text(workout.name(of: next.exercise))
            .font(.rounded(17, .heavy))
            .lineLimit(2)
          Text(subtitle(next))
            .font(.rounded(13))
            .foregroundStyle(Theme.secondary)
          if editable.isEmpty {
            Text(set.text).font(.rounded(22, .heavy))
          } else {
            HStack(spacing: 6) {
              ForEach(editable, id: \.self) { field in
                Button {
                  let fields = Array(editable.drop { $0 != field })
                  editing = Editing(
                    key: key, fields: fields,
                    starts: Dictionary(
                      uniqueKeysWithValues: fields.map { ($0, draft[$0] ?? set.value($0)) }),
                    phone: Dictionary(uniqueKeysWithValues: fields.map { ($0, set.value($0)) }))
                } label: {
                  ValueTile(value: formatted(draft[field] ?? set.value(field)), unit: field.unit)
                }
                .buttonStyle(.plain)
              }
            }
          }
          if missing.isEmpty || !editable.isEmpty {
            Button {
              phone.send(
                .setDone(
                  workoutId: workout.id, exercise: next.exerciseIndex, set: next.setIndex,
                  done: true, values: draft, rest: restStarted(by: next)))
            } label: {
              Label("Done", systemImage: "checkmark")
            }
            .buttonStyle(PillButtonStyle())
            // Until the tiles fill in what the set needs; and PhoneLink sends no second tick
            // while one waits, which this shows.
            .disabled(
              !missing.isEmpty
                || phone.isTickWaiting(
                  workoutId: workout.id, exercise: next.exerciseIndex, set: next.setIndex))
            .padding(.top, 4)
          } else {
            // A time is measured by the phone's clock.
            Text("Finish this set on your iPhone")
              .font(.rounded(13))
              .foregroundStyle(Theme.secondary)
          }
          // Unless the line at the top says what waits.
          if !phone.waiting.isEmpty, phone.reachable || phone.setsWaiting(of: workout) == 0 {
            Text("Waiting for your iPhone")
              .font(.rounded(12))
              .foregroundStyle(Theme.warning)
          }
        }
        .foregroundStyle(Theme.text)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .sheet(item: $editing) { editing in
        ValueEditor(
          fields: editing.fields, crown: next.exercise.crown, start: { editing.starts[$0] ?? nil }
        ) { field, value in
          drafts[editing.key, default: [:]][field] = Draft(
            value: value, over: editing.phone[field] ?? nil)
        }
      }
      // Once the phone moves on, the drafts and the editor of the set before go: a set ticked
      // or unticked on the phone starts again from the phone's values.
      .onChange(of: key) {
        editing = nil
        drafts = drafts.filter { $0.key == key }
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

  /// The rest a tick of the set starts, as the phone starts it (toggleDoneUnchecked in
  /// src/sessions/session.ts), with the set after it, so that the watch shows and signals it
  /// before the phone says, as with the wrist down at once.
  private func restStarted(by next: NextSet) -> (seconds: Int, next: String?)? {
    let seconds = next.exercise.restSeconds
    guard seconds > 0 else { return nil }
    return (seconds, phone.nextSet(after: next, of: workout)?.label)
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

/// The editor open for a set, with the values it started from, taken when it opened, so that the
/// Crown turns from them however the set changes meanwhile.
private struct Editing: Identifiable, Hashable {
  let key: SetKey
  /// The value tapped and those after it.
  let fields: [SetField]
  let starts: [SetField: Double?]
  /// The phone's values then, which the changes are made over.
  let phone: [SetField: Double?]
  var id: Self { self }
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
