import Combine
import SwiftUI
import WatchKit

@main
struct BenchbiteWatchApp: App {
  @WKApplicationDelegateAdaptor private var delegate: AppDelegate
  @StateObject private var restAlert = RestAlert()

  var body: some Scene {
    WindowGroup {
      WorkoutView()
        .environmentObject(delegate.phone)
        .environmentObject(restAlert)
        .environmentObject(delegate.workoutSession)
    }
  }
}

/// Holds the link to the phone and the workout session, which take the phone's states and may be
/// asked to recover a session before any view shows.
final class AppDelegate: NSObject, WKApplicationDelegate {
  @MainActor let phone = PhoneLink()
  @MainActor let workoutSession = WorkoutSession()
  private var measured: AnyCancellable?

  @MainActor override init() {
    super.init()
    phone.onState = { [workoutSession] state in workoutSession.sync(state) }
    // The watch says it is there while it measures a workout.
    measured = workoutSession.$measuring.removeDuplicates().sink { [phone] workoutId in
      phone.sayHere(while: workoutId)
    }
  }

  @MainActor func handleActiveWorkoutRecovery() {
    workoutSession.recover()
  }
}
