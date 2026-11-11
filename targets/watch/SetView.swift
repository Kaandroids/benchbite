import SwiftUI

/// The set to do next: its values, which the Crown changes, and Done, which ticks it with them; for
/// a timed set its clock, with Start and Stop.
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
          // A timed set's time is its clock's, started and stopped here or on the phone, while its
          // clock runs or it has no time yet; one with a time is ticked as it is, as on the phone
          // (set-row.tsx, ADR 0124).
          let started =
            next.exercise.fields.contains(.seconds)
            ? phone.clockStart(of: workout, exercise: next.exerciseIndex, set: next.setIndex) : nil
          let timed =
            next.exercise.fields.contains(.seconds) && (started != nil || set.seconds == nil)
          let tickWaiting = phone.isTickWaiting(
            workoutId: workout.id, exercise: next.exerciseIndex, set: next.setIndex)
          if editable.isEmpty && !timed {
            Text(set.text).font(.rounded(22, .heavy))
          } else {
            HStack(spacing: 6) {
              if timed {
                ClockTile(startedAt: started, target: next.exercise.target.seconds)
              }
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
          if timed && started == nil {
            Button {
              phone.send(
                .startClock(workoutId: workout.id, exercise: next.exerciseIndex, set: next.setIndex))
            } label: {
              Label(L10n.t("start"), systemImage: "play.fill")
            }
            .buttonStyle(PillButtonStyle())
            .padding(.top, 4)
          } else {
            // Done, or Stop for a timed set: its tick stops the clock with the time it ran, as on
            // the phone.
            Button {
              phone.send(
                .setDone(
                  workoutId: workout.id, exercise: next.exerciseIndex, set: next.setIndex,
                  done: true, values: draft, rest: restStarted(by: next)))
            } label: {
              Label(
                L10n.t(timed ? "stop" : "done"), systemImage: timed ? "stop.fill" : "checkmark")
            }
            .buttonStyle(PillButtonStyle())
            // Until the tiles fill in what the set needs; and PhoneLink sends no second tick
            // while one waits, which this shows.
            .disabled((!timed && !missing.isEmpty) || tickWaiting)
            .padding(.top, 4)
          }
          // Unless the line at the top says what waits.
          if !phone.waiting.isEmpty, phone.setsWaitingOutOfReach(of: workout) == 0 {
            Text(L10n.t("waiting"))
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
      Text(L10n.t("allDone"))
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
    return (seconds, phone.nextSet(afterTicking: next, of: workout)?.label)
  }

  private func subtitle(_ next: NextSet) -> String {
    let position = L10n.t(
      "position", ["number": next.setIndex + 1, "total": next.exercise.sets.count])
    return next.set.lastText.map { L10n.t("lastTime", ["position": position, "values": $0]) }
      ?? position
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
    .tile()
  }
}

/// The clock of a timed set: 0:00 until it starts, then the time it runs, counted from its start,
/// with the plan's target beside it (ADR 0124).
private struct ClockTile: View {
  let startedAt: Double?
  let target: Double?

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Group {
        if let startedAt {
          Text(Date(timeIntervalSince1970: startedAt / 1000), style: .timer)
            .foregroundStyle(Theme.accent)
        } else {
          Text(Duration.seconds(0).formatted(.time(pattern: .minuteSecond)))
        }
      }
      .font(.rounded(26, .heavy))
      .monospacedDigit()
      .lineLimit(1)
      .minimumScaleFactor(0.6)
      Text(label)
        .font(.rounded(12))
        .foregroundStyle(Theme.secondary)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
    .tile()
  }

  /// "TIME", or "TIME · TARGET 0:40" when the plan has a target time.
  private var label: String {
    guard let target, target > 0 else { return SetField.seconds.unit }
    let time = Duration.seconds(target).formatted(.time(pattern: .minuteSecond))
    return L10n.t("target", ["unit": SetField.seconds.unit, "time": time])
  }
}

extension View {
  /// The frame of a value's tile on the set: the value over what it is, on the tile's colour.
  fileprivate func tile() -> some View {
    padding(.horizontal, 8)
      .padding(.vertical, 6)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Theme.tile, in: RoundedRectangle(cornerRadius: 14))
  }
}
