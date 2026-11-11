import Foundation
import HealthKit

/// The watch's workout session for the workout it follows (ADR 0113): it keeps the app running with
/// the wrist down, measures the heart rate and the calories, and, when the phone saves its log,
/// saves the watch's workout to the health store with them, as a watch's workout app does. A
/// workout the phone lets go of is left out.
@MainActor
final class WorkoutSession: NSObject, ObservableObject {
  /// The latest heart rate, in beats a minute, while a session runs.
  @Published private(set) var heartRate: Int?

  /// The phone's workout it measures, kept so that a session recovered after the app was ended
  /// knows it.
  private(set) var workoutId: String? {
    didSet { UserDefaults.standard.set(workoutId, forKey: Self.workoutIdKey) }
  }

  private static let workoutIdKey = "workoutSession.workoutId"
  private let store = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  /// How the session ends, once it has: saved to the health store, to that time, or left out.
  private var ending: (saved: Bool, at: Date)?
  /// A workout to measure once the session before has ended, as only one runs at a time.
  private var next: (workoutId: String, startedAt: Double)?

  override init() {
    super.init()
    guard HKHealthStore.isHealthDataAvailable() else { return }
    // A session the system kept running while the app was ended goes on.
    store.recoverActiveWorkoutSession { [weak self] session, _ in
      Task { @MainActor in
        guard let self, let session, self.session == nil else { return }
        self.adopt(session, workoutId: UserDefaults.standard.string(forKey: Self.workoutIdKey))
      }
    }
  }

  private static let calories = HKQuantityType(.activeEnergyBurned)
  private static let heartRateType = HKQuantityType(.heartRate)

  /// Asks to save workouts with their calories and to read the heart rate, once the user joins;
  /// the system asks only once.
  func requestPermission(_ answer: @escaping @MainActor (Bool) -> Void) {
    guard HKHealthStore.isHealthDataAvailable() else { return answer(false) }
    store.requestAuthorization(
      toShare: [HKObjectType.workoutType(), Self.calories, Self.heartRateType],
      read: [Self.calories, Self.heartRateType]
    ) { granted, _ in
      Task { @MainActor in answer(granted) }
    }
  }

  /// Measures the phone's workout, from when it started there, once the user was asked to allow
  /// it; a session of another one ends, left out.
  func start(workoutId: String, startedAt: Double) {
    guard self.workoutId != workoutId, HKHealthStore.isHealthDataAvailable() else { return }
    end(saved: false, at: Date())
    if store.authorizationStatus(for: HKObjectType.workoutType()) == .notDetermined {
      // As for a workout joined before the watch measured one.
      requestPermission { [weak self] _ in self?.begin(workoutId: workoutId, startedAt: startedAt) }
    } else {
      begin(workoutId: workoutId, startedAt: startedAt)
    }
  }

  private func begin(workoutId: String, startedAt: Double) {
    guard session == nil else {
      next = (workoutId, startedAt)
      return
    }
    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .traditionalStrengthTraining
    configuration.locationType = .indoor
    let session: HKWorkoutSession
    do {
      session = try HKWorkoutSession(healthStore: store, configuration: configuration)
    } catch {
      NSLog("[WorkoutSession] Could not start: %@", error.localizedDescription)
      return
    }
    let builder = session.associatedWorkoutBuilder()
    builder.dataSource = HKLiveWorkoutDataSource(
      healthStore: store, workoutConfiguration: configuration)
    adopt(session, workoutId: workoutId)
    // From the phone's start, so that the saved workout covers the log's time and the phone takes
    // it for the same workout (ADR 0105, ADR 0106).
    let start = Date(timeIntervalSince1970: startedAt / 1000)
    session.startActivity(with: start)
    builder.beginCollection(withStart: start) { _, error in
      if let error { NSLog("[WorkoutSession] Could not collect: %@", error.localizedDescription) }
    }
  }

  /// Ends the session as the phone ended its workout: saved to the health store, to the time the
  /// log ends, or left out. The workout is saved once the session has ended.
  func end(saved: Bool, at end: Date) {
    guard let session, workoutId != nil else { return }
    ending = (saved, end)
    workoutId = nil
    heartRate = nil
    session.end()
  }

  private func ended(_ session: HKWorkoutSession) {
    guard session === self.session, let builder, let ending else { return }
    self.session = nil
    self.builder = nil
    self.ending = nil
    if let next {
      self.next = nil
      begin(workoutId: next.workoutId, startedAt: next.startedAt)
    }
    builder.endCollection(withEnd: max(ending.at, builder.startDate ?? ending.at)) { _, error in
      if let error {
        NSLog("[WorkoutSession] Could not end: %@", error.localizedDescription)
        builder.discardWorkout()
      } else if ending.saved {
        builder.finishWorkout { _, error in
          if let error {
            NSLog("[WorkoutSession] Could not save: %@", error.localizedDescription)
          }
        }
      } else {
        builder.discardWorkout()
      }
    }
  }

  private func adopt(_ session: HKWorkoutSession, workoutId: String?) {
    self.session = session
    session.delegate = self
    builder = session.associatedWorkoutBuilder()
    builder?.delegate = self
    self.workoutId = workoutId
  }

  private func measured(_ beats: Int?) {
    heartRate = beats
  }
}

extension WorkoutSession: HKWorkoutSessionDelegate {
  nonisolated func workoutSession(
    _ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState, date: Date
  ) {
    guard toState == .ended else { return }
    Task { @MainActor in self.ended(workoutSession) }
  }

  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error)
  {
    NSLog("[WorkoutSession] Failed: %@", error.localizedDescription)
  }
}

extension WorkoutSession: HKLiveWorkoutBuilderDelegate {
  nonisolated func workoutBuilder(
    _ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>
  ) {
    let heartRate = HKQuantityType(.heartRate)
    guard collectedTypes.contains(heartRate) else { return }
    let perMinute = HKUnit.count().unitDivided(by: .minute())
    let beats = workoutBuilder.statistics(for: heartRate)?.mostRecentQuantity()
      .map { Int($0.doubleValue(for: perMinute).rounded()) }
    Task { @MainActor in self.measured(beats) }
  }

  nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
