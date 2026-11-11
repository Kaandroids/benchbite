import SwiftUI
import WatchKit

@main
struct BenchbiteWatchApp: App {
  @WKApplicationDelegateAdaptor private var delegate: AppDelegate
  @StateObject private var phone = PhoneLink()
  @StateObject private var restAlert = RestAlert()

  var body: some Scene {
    WindowGroup {
      WorkoutView()
        .environmentObject(phone)
        .environmentObject(restAlert)
        .environmentObject(delegate.workoutSession)
    }
  }
}

/// Holds the workout session, which the system may ask to recover before any view shows.
final class AppDelegate: NSObject, WKApplicationDelegate {
  @MainActor let workoutSession = WorkoutSession()

  @MainActor func handleActiveWorkoutRecovery() {
    workoutSession.recover()
  }
}
