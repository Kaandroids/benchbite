import SwiftUI

/// The workout the phone runs: the set to do next, ticked from the wrist. The screens of
/// the approved design follow; this one shows that the two talk to each other.
struct WorkoutView: View {
  @EnvironmentObject private var phone: PhoneLink

  var body: some View {
    if let workout = phone.workout {
      WorkoutSetView(workout: workout)
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
  @EnvironmentObject private var phone: PhoneLink
  let workout: WatchWorkout

  var body: some View {
    // The set the phone says comes next, as one exercise can be left open while another is done.
    let next = workout.next.flatMap { next in
      workout.exercises.indices.contains(next.exercise)
        && workout.exercises[next.exercise].sets.indices.contains(next.set) ? next : nil
    }
    let exercise = next.map { workout.exercises[$0.exercise] }
    VStack(alignment: .leading, spacing: 6) {
      Text(exercise?.name ?? workout.name ?? "Workout").font(.headline)
      if let exercise, let next {
        let set = exercise.sets[next.set]
        Text("Set \(next.set + 1) of \(exercise.sets.count)").foregroundStyle(.secondary)
        Text(set.text).font(.title3.bold())
        // Only a set the phone takes a tick for: one without a weight or a time it needs is
        // finished on the phone, which fills it in or runs its clock.
        if set.missing.isEmpty {
          Button("Done") {
            phone.send(
              .setDone(workoutId: workout.id, exercise: next.exercise, set: next.set, done: true))
          }
          .tint(.orange)
          // PhoneLink sends no second tick while one waits; this shows that it would not.
          .disabled(phone.isWaiting(workoutId: workout.id, exercise: next.exercise, set: next.set))
        } else {
          Text("Finish this set on your iPhone").font(.footnote).foregroundStyle(.secondary)
        }
      } else {
        Text("All sets done").foregroundStyle(.secondary)
      }
      if !phone.waiting.isEmpty {
        Text("Waiting for your iPhone").font(.footnote).foregroundStyle(.yellow)
      }
    }
  }
}
