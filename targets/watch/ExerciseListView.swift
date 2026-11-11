import SwiftUI

/// The workout's exercises, with how many of their sets are done: the one whose set comes next is
/// marked, and another picked opens on the phone, so that its sets come next (ADR 0117).
struct ExerciseListView: View {
  @EnvironmentObject private var phone: PhoneLink
  let workout: WatchWorkout
  /// Goes back to the set, once an exercise is picked.
  let picked: () -> Void

  var body: some View {
    let sets = workout.exercises.flatMap(\.sets)
    let current = workout.next?.exercise
    ScrollView {
      VStack(alignment: .leading, spacing: 6) {
        Text("\(workout.name ?? "Workout") · \(sets.filter(\.done).count) / \(sets.count)")
          .textCase(.uppercase)
          .font(.rounded(13, .heavy))
          .foregroundStyle(Theme.secondary)
          .lineLimit(1)
          .padding(.leading, 4)
        ForEach(Array(workout.exercises.enumerated()), id: \.offset) { index, exercise in
          let done = exercise.sets.filter(\.done).count
          let isCurrent = index == current
          Button {
            if !isCurrent { phone.send(.open(workoutId: workout.id, exercise: index)) }
            picked()
          } label: {
            ExerciseRow(
              name: exercise.name ?? "Exercise \(index + 1)", done: done,
              count: exercise.sets.count, isCurrent: isCurrent)
          }
          .buttonStyle(.plain)
          // One whose sets are all done has none to come next.
          .disabled(!isCurrent && done == exercise.sets.count)
        }
      }
      .foregroundStyle(Theme.text)
    }
  }
}

/// An exercise in the list: its name and sets done, marked when its set comes next or when all are
/// done.
private struct ExerciseRow: View {
  let name: String
  let done: Int
  let count: Int
  let isCurrent: Bool

  var body: some View {
    HStack(spacing: 4) {
      VStack(alignment: .leading, spacing: 0) {
        Text(name).font(.rounded(15, .heavy)).lineLimit(1)
        Text("\(done) of \(count)")
          .font(.rounded(12))
          .foregroundStyle(Theme.secondary)
      }
      Spacer(minLength: 0)
      if isCurrent {
        Text("NOW").font(.rounded(13, .heavy)).foregroundStyle(Theme.accent)
      } else if done == count {
        Image(systemName: "checkmark")
          .font(.rounded(13, .heavy))
          .foregroundStyle(Theme.success)
          .accessibilityLabel("Done")
      }
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(isCurrent ? Theme.control : Theme.tile, in: RoundedRectangle(cornerRadius: 14))
  }
}
