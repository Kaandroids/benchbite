import SwiftUI

/// The workout the phone runs: its rest while one runs, else the set to do next, which the wrist
/// edits and ticks.
struct WorkoutView: View {
  @EnvironmentObject private var phone: PhoneLink

  var body: some View {
    if let workout = phone.workout {
      // Each second, so that the rest counts down and gives way to the set when it is over.
      TimelineView(.periodic(from: .now, by: 1)) { context in
        let now = context.date.timeIntervalSince1970 * 1000
        if let endsAt = phone.restEndsAt(workout), endsAt > now, let rest = workout.rest {
          RestView(workout: workout, seconds: rest.seconds, endsAt: endsAt, now: now)
        } else {
          SetView(workout: workout)
        }
      }
    } else {
      VStack(spacing: 10) {
        Image(systemName: "dumbbell")
          .font(.system(size: 32, weight: .semibold))
          .foregroundStyle(Theme.secondary)
        Text("No workout yet").font(.rounded(17, .heavy))
        Text("Start one on your iPhone and it shows here.")
          .font(.rounded(14))
          .foregroundStyle(Theme.secondary)
          .multilineTextAlignment(.center)
      }
      .foregroundStyle(Theme.text)
    }
  }
}
