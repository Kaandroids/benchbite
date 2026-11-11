import HealthKit

/// Opens Benchbite on the Apple Watch for a workout the phone starts there too (ADR 0115). The
/// watch starts its workout session once the phone's state says it follows the workout.
enum WatchApp {
  private static let store = HKHealthStore()

  static func start() {
    guard HKHealthStore.isHealthDataAvailable() else { return }
    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .traditionalStrengthTraining
    configuration.locationType = .indoor
    store.startWatchApp(with: configuration) { _, error in
      if let error { NSLog("[WatchLink] Could not open the watch app: %@", error.localizedDescription) }
    }
  }
}
