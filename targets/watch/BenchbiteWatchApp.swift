import Combine
import HealthKit
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
    // With its heart rate, at most every few seconds, as each change is sent at once.
    workoutSession.$heartRate.removeDuplicates()
      .throttle(for: .seconds(5), scheduler: RunLoop.main, latest: true)
      .sink { [phone] beats in phone.heartRate = beats }
      .store(in: &subscriptions)
    // It signals the rests of the workout it measures, as the phone puts its own notification off
    // while the watch says it is there (ADR 0114). After the change, which the publishers announce
    // before it is made.
    Publishers.CombineLatest4(
      phone.$workout, phone.$waiting, workoutSession.$measuring, restAlert.$allowed
    )
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
    else {
      restAlert.signal(nil)
      phone.signalling = nil
      return
    }
    restAlert.signal(RestAlert.Rest(workoutId: workout.id, endsAt: rest.endsAt, next: rest.next))
    // The phone puts its own notification off only for the rest the watch says it signals, which
    // it cannot with the app closed unless the user lets it notify.
    phone.signalling = restAlert.allowed ? rest.endsAt : nil
  }

  @MainActor func handleActiveWorkoutRecovery() {
    workoutSession.recover()
  }

  /// The phone started a workout on the watch too (ADR 0115), which launches the app: the session
  /// starts now, as the system allows it only here with the app in the background, and takes the
  /// workout once the phone's state says the watch follows it; the app asks to signal its rests,
  /// as joining does.
  @MainActor func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
    workoutSession.startForPhone()
    restAlert.requestPermission()
  }

  /// With the wrist down the summary of the workout saved last closes, so that the app opens on
  /// what comes next (ADR 0120).
  @MainActor func applicationDidEnterBackground() {
    phone.closeSummary()
  }

  /// The app may have been launched in the background, where the user could not be asked to let
  /// it signal the rests of the workout it measures: it asks once it is open.
  @MainActor func applicationDidBecomeActive() {
    workoutSession.becameActive()
    restAlert.readPermission(asking: workoutSession.measuring != nil)
  }
}
