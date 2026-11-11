import SwiftUI
import WatchKit

/// The workout the phone runs: an offer to join it, until the watch follows it; then its rest while
/// one runs, the end of the rest, or else the set to do next, which the wrist edits and ticks, with
/// the list of its exercises beside them, and a long press to finish it. Once the phone saves it,
/// its summary, until the next.
struct WorkoutView: View {
  @EnvironmentObject private var phone: PhoneLink
  @EnvironmentObject private var restAlert: RestAlert
  /// The finish question, asked from the list's end or a long press on the set or the rest
  /// (ADR 0118, ADR 0122): above the workout's screens, so that the end of a rest does not close
  /// it, and closed when the workout ends or another runs.
  @State private var finishing = false

  var body: some View {
    Group {
      if let workout = phone.workout {
        if !workout.follows {
          JoinView(workout: workout)
        } else if let over = restAlert.over, over.workoutId == workout.id {
          RestOverView(next: over.next) { restAlert.over = nil }
        } else {
          PagesView(workout: workout) { finishing = true }
            // Its pages start again with each workout.
            .id(workout.id)
        }
      } else if let finished = phone.finished {
        SummaryView(workout: finished)
      } else {
        VStack(spacing: 10) {
          Image(systemName: "dumbbell")
            .font(.system(size: 32, weight: .semibold))
            .foregroundStyle(Theme.secondary)
          Text(L10n.t("noWorkout")).font(.rounded(17, .heavy))
          Text(L10n.t("startOnPhone"))
            .font(.rounded(14))
            .foregroundStyle(Theme.secondary)
            .multilineTextAlignment(.center)
        }
        .foregroundStyle(Theme.text)
      }
    }
    // Drawn again in another language, once the phone says.
    .id(phone.language)
    .sheet(isPresented: $finishing) {
      if let workout = phone.workout {
        FinishView(workout: workout)
      }
    }
    .onChange(of: phone.workout?.id) { finishing = false }
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
    let total = workout.setsDone
    VStack(spacing: 6) {
      Text(L10n.t("onPhone"))
        .font(.rounded(13, .heavy))
        .foregroundStyle(Theme.secondary)
      Text(workout.title)
        .font(.rounded(19, .heavy))
        .lineLimit(2)
      HStack(spacing: 0) {
        Text(Date(timeIntervalSince1970: workout.startedAt / 1000), style: .timer)
          .monospacedDigit()
        Text(" · " + L10n.t("progress", ["done": total.done, "total": total.count]))
      }
      .font(.rounded(14))
      .foregroundStyle(Theme.secondary)
      Button(L10n.t("join")) {
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
        Text(L10n.t("allowNotifications"))
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
      Button(L10n.t("go"), action: go)
        .buttonStyle(PillButtonStyle())
        .padding(.top, 8)
    }
    .multilineTextAlignment(.center)
    .foregroundStyle(Theme.text)
  }
}

/// The pages of a workout the watch follows: the list beside the set, a swipe away (ADR 0117),
/// both of which ask to finish it, from the list's end or a long press on the set or the rest
/// (ADR 0118, ADR 0122).
private struct PagesView: View {
  @EnvironmentObject private var phone: PhoneLink
  let workout: WatchWorkout
  /// Asks to finish the workout.
  let finish: () -> Void
  @State private var page = Page.set

  private enum Page {
    case list, set
  }

  var body: some View {
    TabView(selection: $page) {
      ExerciseListView(workout: workout, picked: { page = .set }, finish: finish)
        .tag(Page.list)
      // Each second, so that the rest counts down and gives way to the set when it is over.
      TimelineView(.periodic(from: .now, by: 1)) { context in
        let now = context.date.timeIntervalSince1970 * 1000
        if let rest = phone.rest(of: workout), rest.endsAt > now {
          RestView(workout: workout, rest: rest, now: now)
        } else {
          SetView(workout: workout)
        }
      }
      // A long press anywhere on the page but on a button asks to finish.
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .contentShape(Rectangle())
      .onLongPressGesture(minimumDuration: 0.6) {
        WKInterfaceDevice.current().play(.click)
        finish()
      }
      .tag(Page.set)
    }
    .tabViewStyle(.page(indexDisplayMode: .never))
  }
}
