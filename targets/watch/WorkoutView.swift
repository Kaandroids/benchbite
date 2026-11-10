import SwiftUI

/// The workout the phone runs: the open exercise's next set, ticked from the wrist. The screens of
/// the approved design follow; this one shows that the two talk to each other.
struct WorkoutView: View {
  @EnvironmentObject private var phone: PhoneLink

  var body: some View {
    if let workout = phone.workout {
      WorkoutSetView(workout: workout, waiting: !phone.waiting.isEmpty) { exercise, set in
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
  let done: (_ exercise: Int, _ set: Int) -> Void

  var body: some View {
    let exercise = workout.exercises.indices.contains(workout.current)
      ? workout.exercises[workout.current] : nil
    let next = exercise?.sets.firstIndex { !$0.done }
    VStack(alignment: .leading, spacing: 6) {
      Text(exercise?.name ?? workout.name ?? "Workout").font(.headline)
      if let exercise, let next {
        Text("Set \(next + 1) of \(exercise.sets.count)").foregroundStyle(.secondary)
        Text(describe(exercise.sets[next])).font(.title3.bold())
        Button("Done") { done(workout.current, next) }
          .tint(.orange)
      } else {
        Text("All sets done").foregroundStyle(.secondary)
      }
      if waiting {
        Text("Waiting for your iPhone").font(.footnote).foregroundStyle(.yellow)
      }
    }
  }

  /// "80 kg × 8" for a set of reps, else its time.
  private func describe(_ set: WatchSet) -> String {
    if set.reps != nil || set.weightKg != nil {
      let weight = set.weightKg.map { "\($0.formatted()) kg" } ?? "—"
      return "\(weight) × \(set.reps.map { "\(Int($0))" } ?? "—")"
    }
    return set.seconds.map { "\(Int($0)) s" } ?? "—"
  }
}
