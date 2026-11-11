import Foundation
import HealthKit

/// The watch's workout session for the workout it follows (ADR 0113): it keeps the app running with
/// the wrist down, measures the heart rate and the calories, and, when the phone saves its log,
/// saves the watch's workout to the health store with them, as a watch's workout app does. A
/// workout the phone lets go of is left out.
///
/// What the phone last said decides, whatever order things happen in: `sync` keeps it, and each
/// step that ends, whether taking up a session after a relaunch, asking the user or a session
/// ending, looks at it again.
@MainActor
final class WorkoutSession: NSObject, ObservableObject {
  /// The workout the watch follows, as the phone said.
  struct Followed: Equatable {
    let workoutId: String
    let startedAt: Double
  }

  /// The latest heart rate, in beats a minute, while a session runs.
  @Published private(set) var heartRate: Int?

  private nonisolated static let heartRateType = HKQuantityType(.heartRate)
  private nonisolated static let calories = HKQuantityType(.activeEnergyBurned)
  private static let workoutIdKey = "workoutSession.workoutId"

  private let store = HKHealthStore()
  private var followed: Followed?
  private var ended: [WatchEnded] = []
  /// While a session the system kept running while the app was ended is taken up.
  private var recovering = false
  /// While the user is asked to allow the health store.
  private var asking = false
  /// Workouts whose session ended from outside, as by another workout app, not started again.
  private var stopped: Set<String> = []

  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  /// The phone's workout the session measures, kept so that a session taken up knows it.
  private var workoutId: String? {
    didSet { UserDefaults.standard.set(workoutId, forKey: Self.workoutIdKey) }
  }
  /// While the workout of the session that ended is saved or left out.
  private var ending: (saved: Bool, at: Date)?

  /// Takes up the session the system kept running while the app was ended, which it says by
  /// launching the app to recover it; until then nothing starts or ends.
  func recover() {
    guard HKHealthStore.isHealthDataAvailable(), session == nil else { return }
    recovering = true
    store.recoverActiveWorkoutSession { [weak self] session, error in
      Task { @MainActor in
        guard let self else { return }
        if let error {
          NSLog("[WorkoutSession] Could not recover: %@", error.localizedDescription)
        }
        if let session {
          self.adopt(session, workoutId: UserDefaults.standard.string(forKey: Self.workoutIdKey))
        }
        self.recovering = false
        self.reconcile()
      }
    }
  }

  /// Takes what the phone last said: the workout the watch follows, and how the latest ended.
  func sync(followed: Followed?, ended: [WatchEnded]) {
    self.followed = followed
    self.ended = ended
    reconcile()
  }

  /// Starts, ends or keeps the session as the phone said, once nothing else is under way.
  private func reconcile() {
    guard !recovering, !asking, ending == nil else { return }
    if let session {
      guard let workoutId else { return end(session, saved: false, at: Date()) }
      if let end = ended.first(where: { $0.id == workoutId }) {
        self.end(session, saved: end.saved, at: end.endedAt.map(Self.date) ?? Date())
      } else if followed?.workoutId != workoutId {
        // The phone runs no workout or another, and says nothing of how this one ended.
        self.end(session, saved: false, at: Date())
      }
      return
    }
    guard let followed, !stopped.contains(followed.workoutId),
      !ended.contains(where: { $0.id == followed.workoutId }), HKHealthStore.isHealthDataAvailable()
    else { return }
    if store.authorizationStatus(for: HKObjectType.workoutType()) == .notDetermined {
      asking = true
      store.requestAuthorization(
        toShare: [HKObjectType.workoutType(), Self.calories, Self.heartRateType],
        read: [Self.calories, Self.heartRateType]
      ) { _, _ in
        Task { @MainActor in
          self.asking = false
          self.reconcile()
        }
      }
      return
    }
    begin(followed)
  }

  /// Measures the phone's workout, from when it started there, so that the saved workout covers
  /// the log's time and the phone takes it for the same workout (ADR 0105, ADR 0106).
  private func begin(_ followed: Followed) {
    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .traditionalStrengthTraining
    configuration.locationType = .indoor
    let session: HKWorkoutSession
    do {
      session = try HKWorkoutSession(healthStore: store, configuration: configuration)
    } catch {
      NSLog("[WorkoutSession] Could not start: %@", error.localizedDescription)
      stopped.insert(followed.workoutId)
      return
    }
    let builder = session.associatedWorkoutBuilder()
    builder.dataSource = HKLiveWorkoutDataSource(
      healthStore: store, workoutConfiguration: configuration)
    adopt(session, workoutId: followed.workoutId)
    let start = Self.date(followed.startedAt)
    session.startActivity(with: start)
    builder.beginCollection(withStart: start) { _, error in
      if let error { NSLog("[WorkoutSession] Could not collect: %@", error.localizedDescription) }
    }
  }

  /// Ends the session, then its workout: saved to the health store, to the time the log ends, or
  /// left out. The workout is closed at once, as the session's own news of its end can wait while
  /// the app is in the background, and the workout closes only once the session has ended.
  private func end(_ session: HKWorkoutSession, saved: Bool, at end: Date) {
    guard let builder else { return }
    self.session = nil
    self.builder = nil
    workoutId = nil
    heartRate = nil
    ending = (saved, end)
    if session.state != .ended { session.end() }
    builder.endCollection(withEnd: max(end, builder.startDate ?? end)) { _, error in
      if let error {
        NSLog("[WorkoutSession] Could not end: %@", error.localizedDescription)
        builder.discardWorkout()
      } else if saved {
        builder.finishWorkout { _, error in
          if let error {
            NSLog("[WorkoutSession] Could not save: %@", error.localizedDescription)
          }
        }
      } else {
        builder.discardWorkout()
      }
      Task { @MainActor in
        self.ending = nil
        self.reconcile()
      }
    }
  }

  /// A session that ended from outside, as by another workout app, is left out, and not started
  /// again.
  private func sessionEnded(_ session: HKWorkoutSession) {
    guard session === self.session else { return }
    if let workoutId { stopped.insert(workoutId) }
    end(session, saved: false, at: Date())
  }

  /// A session that failed is left out, and not started again.
  private func failed(_ session: HKWorkoutSession) {
    sessionEnded(session)
  }

  private func adopt(_ session: HKWorkoutSession, workoutId: String?) {
    self.session = session
    session.delegate = self
    builder = session.associatedWorkoutBuilder()
    builder?.delegate = self
    self.workoutId = workoutId
  }

  private func measured(_ beats: Int?, by builder: HKLiveWorkoutBuilder) {
    // A reading the ending session's builder still sends is not the next workout's.
    guard builder === self.builder, ending == nil else { return }
    heartRate = beats
  }

  private static func date(_ milliseconds: Double) -> Date {
    Date(timeIntervalSince1970: milliseconds / 1000)
  }
}

extension WorkoutSession: HKWorkoutSessionDelegate {
  nonisolated func workoutSession(
    _ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState, date: Date
  ) {
    guard toState == .ended else { return }
    Task { @MainActor in self.sessionEnded(workoutSession) }
  }

  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error)
  {
    NSLog("[WorkoutSession] Failed: %@", error.localizedDescription)
    Task { @MainActor in self.failed(workoutSession) }
  }
}

extension WorkoutSession: HKLiveWorkoutBuilderDelegate {
  nonisolated func workoutBuilder(
    _ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>
  ) {
    guard collectedTypes.contains(Self.heartRateType) else { return }
    let perMinute = HKUnit.count().unitDivided(by: .minute())
    let beats = workoutBuilder.statistics(for: Self.heartRateType)?.mostRecentQuantity()
      .map { Int($0.doubleValue(for: perMinute).rounded()) }
    Task { @MainActor in self.measured(beats, by: workoutBuilder) }
  }

  nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
