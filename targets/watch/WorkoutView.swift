import SwiftUI

/// The workout the phone runs: the open exercise's next set, ticked from the wrist. The screens of
/// the approved design follow; this one shows that the two talk to each other.
struct WorkoutView: View {
  @EnvironmentObject private var phone: PhoneLink

  var body: some View {
    if let workout = phone.workout {
      WorkoutSetView(
        workout: workout, waiting: !phone.waiting.isEmpty,
        setWaits: { phone.isWaiting(workoutId: workout.id, exercise: $0, set: $1) }
      ) { exercise, set in
        phone.send(.setDone(workoutId: workout.id, exercise: exercise, set: set, done: true))
      }
    } else {
      VStack(spacing: 8) {
        Text("No workout yet").font(.headline)
        Text("Start one on your iPhone and it shows here.")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }
    }
  }
}

private struct WorkoutSetView: View {
  let workout: WatchWorkout
  let waiting: Bool
  /// Whether a tick of this set waits for the phone, so that Done is not sent twice.
  let setWaits: (_ exercise: Int, _ set: Int) -> Bool
  let done: (_ exercise: Int, _ set: Int) -> Void

  var body: some View {
    let exercise = workout.exercises.indices.contains(workout.current)
      ? workout.exercises[workout.current] : nil
    let next = exercise?.sets.firstIndex { !$0.done }
    VStack(alignment: .leading, spacing: 6) {
      Text(exercise?.name ?? workout.name ?? "Workout").font(.headline)
      if let exercise, let next {
        Text("Set \(next + 1) of \(exercise.sets.count)").foregroundStyle(.secondary)
        Text(exercise.sets[next].text).font(.title3.bold())
        // Only a set the phone takes a tick for: one without a weight or a time it needs is
        // finished on the phone, which fills it in or runs its clock.
        if exercise.sets[next].missing.isEmpty {
          Button("Done") { done(workout.current, next) }
            .tint(.orange)
            .disabled(setWaits(workout.current, next))
        } else {
          Text("Finish this set on your iPhone").font(.footnote).foregroundStyle(.secondary)
        }
      } else {
        Text("All sets done").foregroundStyle(.secondary)
      }
      if waiting {
        Text("Waiting for your iPhone").font(.footnote).foregroundStyle(.yellow)
      }
    }
  }
}
