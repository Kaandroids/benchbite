import Combine
import SwiftUI
import WatchKit

@main
struct BenchbiteWatchApp: App {
  @WKApplicationDelegateAdaptor private var delegate: AppDelegate

  var body: some Scene {
    WindowGroup {
      WorkoutView()
        .environmentObject(delegate.phone)
        .environmentObject(delegate.restAlert)
        .environmentObject(delegate.workoutSession)
    }
  }
}

/// Holds the link to the phone, the workout session and the rest's signal, which follow the
/// phone's states whether a view shows, as when the system launches the app in the background to
/// recover a session.
final class AppDelegate: NSObject, WKApplicationDelegate {
  @MainActor let phone = PhoneLink()
  @MainActor let workoutSession = WorkoutSession()
  @MainActor let restAlert = RestAlert()
  private var subscriptions: Set<AnyCancellable> = []

  @MainActor override init() {
    super.init()
    phone.onState = { [workoutSession] state in workoutSession.sync(state) }
    // The watch says it is there while it measures a workout.
    workoutSession.$measuring.removeDuplicates()
      .sink { [phone] workoutId in phone.sayHere(while: workoutId) }
      .store(in: &subscriptions)
    // It signals the rests of the workout it measures, as the phone puts its own notification off
    // while the watch says it is there (ADR 0114). After the change, which the publishers announce
    // before it is made.
    Publishers.CombineLatest3(phone.$workout, phone.$waiting, workoutSession.$measuring)
      .receive(on: RunLoop.main)
      .sink { [weak self] _ in
        MainActor.assumeIsolated { self?.signalRest() }
      }
      .store(in: &subscriptions)
  }

  /// Signals the rest of the workout the watch measures, with the set after it, or none.
  @MainActor private func signalRest() {
    guard let workout = phone.workout, workoutSession.measuring == workout.id,
      let rest = phone.rest(of: workout)
    else { return restAlert.signal(nil) }
    restAlert.signal(RestAlert.Rest(workoutId: workout.id, endsAt: rest.endsAt, next: rest.next))
  }

  @MainActor func handleActiveWorkoutRecovery() {
    workoutSession.recover()
  }
}
