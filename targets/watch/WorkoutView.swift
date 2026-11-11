import SwiftUI

/// The workout the phone runs: an offer to join it, until the watch follows it; then its rest while
/// one runs, the end of the rest, or else the set to do next, which the wrist edits and ticks.
struct WorkoutView: View {
  @EnvironmentObject private var phone: PhoneLink
  @EnvironmentObject private var restAlert: RestAlert
  @EnvironmentObject private var workoutSession: WorkoutSession

  var body: some View {
    Group {
      if let workout = phone.workout {
        if !workout.follows {
          JoinView(workout: workout)
        } else if let over = restAlert.over, over.workoutId == workout.id {
          RestOverView(next: over.next) { restAlert.over = nil }
        } else {
          // Each second, so that the rest counts down and gives way to the set when it is over.
          TimelineView(.periodic(from: .now, by: 1)) { context in
            let now = context.date.timeIntervalSince1970 * 1000
            if let rest = phone.rest(of: workout), rest.endsAt > now {
              RestView(workout: workout, rest: rest, now: now)
            } else {
              SetView(workout: workout)
            }
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
    // Only the rests the watch started or last changed, of a workout it follows, are signalled
    // here; the phone signals the others.
    .onChange(of: signalled, initial: true) { restAlert.signal(signalled) }
    // The session measures the workout the watch follows, and ends as the phone ended it.
    .onChange(of: followed, initial: true) {
      workoutSession.sync(followed: followed, ended: phone.ended)
    }
    .onChange(of: phone.ended) { workoutSession.sync(followed: followed, ended: phone.ended) }
  }

  /// The workout the watch follows.
  private var followed: WorkoutSession.Followed? {
    phone.workout.flatMap {
      $0.follows ? WorkoutSession.Followed(workoutId: $0.id, startedAt: $0.startedAt) : nil
    }
  }

  /// The rest whose end the watch signals, one it started or last changed, and the set after it.
  private var signalled: RestAlert.Rest? {
    guard let workout = phone.workout, workout.follows, let rest = phone.rest(of: workout),
      rest.byWatch
    else { return nil }
    return RestAlert.Rest(workoutId: workout.id, endsAt: rest.endsAt, next: rest.next)
  }
}

/// A workout that runs on the phone alone, which the watch can join.
private struct JoinView: View {
  @EnvironmentObject private var phone: PhoneLink
  @EnvironmentObject private var restAlert: RestAlert
  let workout: WatchWorkout
  /// Notifications were refused, without which the watch cannot signal a rest.
  @State private var refused = false

  var body: some View {
    let sets = workout.exercises.flatMap(\.sets)
    VStack(spacing: 6) {
      Text("ON YOUR IPHONE")
        .font(.rounded(13, .heavy))
        .foregroundStyle(Theme.secondary)
      Text(workout.name ?? "Workout")
        .font(.rounded(19, .heavy))
        .lineLimit(2)
      HStack(spacing: 0) {
        Text(Date(timeIntervalSince1970: workout.startedAt / 1000), style: .timer)
          .monospacedDigit()
        Text(" · \(sets.filter(\.done).count) of \(sets.count) sets")
      }
      .font(.rounded(14))
      .foregroundStyle(Theme.secondary)
      Button("Join") {
        restAlert.requestPermission { granted in
          refused = !granted
          // The workout session then asks for the health store, which joining goes on without.
          if granted { phone.send(.join(workoutId: workout.id)) }
        }
      }
      .buttonStyle(PillButtonStyle())
      .disabled(phone.isJoinWaiting(workoutId: workout.id))
      .padding(.top, 8)
      if refused {
        // Joined without them, the phone would leave rests to a watch that cannot signal them.
        Text("Allow notifications for Benchbite in the Watch app on your iPhone to join.")
          .font(.rounded(12))
          .foregroundStyle(Theme.warning)
      }
    }
    .multilineTextAlignment(.center)
    .foregroundStyle(Theme.text)
  }
}

/// The end of a rest, signalled while the app was open.
private struct RestOverView: View {
  let next: String?
  let go: () -> Void

  var body: some View {
    VStack(spacing: 8) {
      Image(systemName: "timer")
        .font(.system(size: 36, weight: .semibold))
        .foregroundStyle(Theme.accent)
      Text(RestAlert.title).font(.rounded(20, .heavy))
      if let next {
        Text(next)
          .font(.rounded(14))
          .foregroundStyle(Theme.secondary)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      Button("Go", action: go)
        .buttonStyle(PillButtonStyle())
        .padding(.top, 8)
    }
    .multilineTextAlignment(.center)
    .foregroundStyle(Theme.text)
  }
}
