import Foundation
import HealthKit
import WatchKit

/// The watch's workout session for the workout it follows (ADR 0113): it keeps the app running with
/// the wrist down, measures the heart rate and the calories, and, when the phone saves its log,
/// saves the watch's workout to the health store with them, as a watch's workout app does. A
/// workout the phone lets go of is left out.
///
/// What the phone last said decides, whatever order things happen in: `sync` keeps each state it
/// sends, and each step that ends, whether taking up a session after a relaunch, asking the user
/// or a session ending, looks at it again. Before the phone has said anything since launch, nothing
/// starts or ends.
@MainActor
final class WorkoutSession: NSObject, ObservableObject {
  /// The latest heart rate, in beats a minute, while a session runs.
  @Published private(set) var heartRate: Int?

  private nonisolated static let heartRateType = HKQuantityType(.heartRate)
  private nonisolated static let calories = HKQuantityType(.activeEnergyBurned)
  private static let workoutIdKey = "workoutSession.workoutId"

  /// As long as a workout can be on the phone: one older is let go of, as left open there.
  private static let longest: TimeInterval = 12 * 3600

  private let store = HKHealthStore()
  /// The phone's latest state, none until it has sent one since launch.
  private var said: WatchState?
  /// While a session the system kept running while the app was ended is taken up.
  private var recovering = false
  /// While the user is asked to allow the health store.
  private var asking = false
  /// Workouts whose session ended from outside, as by another workout app, not started again.
  private var stopped: Set<String> = []

  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  /// The phone's workout the session measures, whose rests the watch signals while it runs
  /// (ADR 0114); kept so that a session taken up knows it.
  @Published private(set) var measuring: String? {
    didSet { UserDefaults.standard.set(measuring, forKey: Self.workoutIdKey) }
  }
  /// While the workout of the session that ended is saved or left out.
  private var ending = false
  /// Ends a session that has run as long as a workout can.
  private var cap: Timer?
  /// Since when a session started for the phone waits for the workout it follows (ADR 0115).
  private var waitingSince: Date?
  /// As long as it waits, after which it ends.
  private static let wait: TimeInterval = 60

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

  /// Starts a session at once for the workout the phone starts on the watch too, which opened the
  /// app for it (ADR 0115): the one time a session may start with the app in the background, as
  /// the system launches it there. It takes the workout once the phone's state says the watch
  /// follows it, and ends when none comes.
  func startForPhone() {
    guard HKHealthStore.isHealthDataAvailable(), session == nil, !ending,
      store.authorizationStatus(for: HKObjectType.workoutType()) != .notDetermined,
      let session = makeSession()
    else { return }
    adopt(session, workoutId: nil)
    waitingSince = Date()
    session.startActivity(with: Date())
    Timer.scheduledTimer(withTimeInterval: Self.wait + 1, repeats: false) { [weak self] _ in
      Task { @MainActor in self?.reconcile() }
    }
    reconcile()
  }

  /// Looks again once the app is active, when a session can start.
  func becameActive() {
    reconcile()
  }

  /// Takes a state the phone sent: the workout it runs, whether the watch follows it, and how the
  /// latest ended.
  func sync(_ state: WatchState) {
    said = state
    reconcile()
  }

  /// Starts, ends or keeps the session as the phone said, once nothing else is under way.
  private func reconcile() {
    guard !recovering, !asking, !ending else { return }
    if let session, measuring == nil, let since = waitingSince {
      if let workout = followed() {
        waitingSince = nil
        measuring = workout.workoutId
        collect(from: Self.date(workout.startedAt))
        return
      }
      guard Date().timeIntervalSince(since) > Self.wait else { return }
      waitingSince = nil
      return end(session, saved: false, at: Date())
    }
    guard let said else { return }
    if let session {
      guard let measuring else { return end(session, saved: false, at: Date()) }
      if let end = said.ended.first(where: { $0.id == measuring }) {
        self.end(session, saved: end.saved, at: end.endedAt.map(Self.date) ?? Date())
      } else if let running = said.workout?.id, running != measuring {
        // The phone runs another workout, and says nothing of how this one ended. Running none,
        // as while it starts or signs in again, it may still run this one.
        self.end(session, saved: false, at: Date())
      } else if let start = builder?.startDate, Date().timeIntervalSince(start) > Self.longest {
        self.end(session, saved: false, at: Date())
      }
      return
    }
    // A session cannot start with the app in the background, save for the phone's (`startForPhone`);
    // it starts once the app is active.
    guard let followed = followed(), HKHealthStore.isHealthDataAvailable(),
      WKApplication.shared().applicationState != .background
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

  /// The phone's workout the watch is to follow, if any: one it follows that has not ended, nor
  /// been stopped here.
  private func followed() -> (workoutId: String, startedAt: Double)? {
    guard let said, let workout = said.workout, workout.follows, !stopped.contains(workout.id),
      !said.ended.contains(where: { $0.id == workout.id })
    else { return nil }
    return (workoutId: workout.id, startedAt: workout.startedAt)
  }

  /// Measures the phone's workout, from when it started there, so that the saved workout covers
  /// the log's time and the phone takes it for the same workout (ADR 0105, ADR 0106).
  private func begin(_ followed: (workoutId: String, startedAt: Double)) {
    guard let session = makeSession() else {
      stopped.insert(followed.workoutId)
      return
    }
    adopt(session, workoutId: followed.workoutId)
    let start = Self.date(followed.startedAt)
    session.startActivity(with: start)
    collect(from: start)
  }

  /// A session for a strength workout, with a builder that measures it; none when it cannot be.
  private func makeSession() -> HKWorkoutSession? {
    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .traditionalStrengthTraining
    configuration.locationType = .indoor
    do {
      let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
      session.associatedWorkoutBuilder().dataSource = HKLiveWorkoutDataSource(
        healthStore: store, workoutConfiguration: configuration)
      return session
    } catch {
      NSLog("[WorkoutSession] Could not start: %@", error.localizedDescription)
      return nil
    }
  }

  /// Collects the session's measurements from `start`, and ends it once it has run too long.
  private func collect(from start: Date) {
    builder?.beginCollection(withStart: start) { _, error in
      if let error { NSLog("[WorkoutSession] Could not collect: %@", error.localizedDescription) }
    }
    limit(from: start)
  }

  /// Looks again once the session has run as long as a workout can, as the phone, not opened,
  /// may never say it ended.
  private func limit(from start: Date) {
    cap?.invalidate()
    let left = max(1, start.addingTimeInterval(Self.longest + 1).timeIntervalSinceNow)
    cap = Timer.scheduledTimer(withTimeInterval: left, repeats: false) { [weak self] _ in
      Task { @MainActor in self?.reconcile() }
    }
  }

  /// Ends the session, then its workout: saved to the health store, to the time the log ends, or
  /// left out. The workout is closed at once, as the session's own news of its end can wait while
  /// the app is in the background, and the workout closes only once the session has ended.
  private func end(_ session: HKWorkoutSession, saved: Bool, at end: Date) {
    guard let builder else { return }
    self.session = nil
    self.builder = nil
    measuring = nil
    heartRate = nil
    cap?.invalidate()
    cap = nil
    waitingSince = nil
    ending = true
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
        self.ending = false
        self.reconcile()
      }
    }
  }

  /// A session that ended from outside, as by another workout app, or failed, is left out, and not
  /// started again.
  private func sessionEnded(_ session: HKWorkoutSession) {
    guard session === self.session else { return }
    if let measuring { stopped.insert(measuring) }
    end(session, saved: false, at: Date())
  }

  private func adopt(_ session: HKWorkoutSession, workoutId: String?) {
    self.session = session
    session.delegate = self
    builder = session.associatedWorkoutBuilder()
    builder?.delegate = self
    measuring = workoutId
    if let start = builder?.startDate { limit(from: start) }
  }

  private func measured(_ beats: Int?, by builder: HKLiveWorkoutBuilder) {
    // A reading the ending session's builder still sends is not the next workout's.
    guard builder === self.builder, !ending else { return }
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
    Task { @MainActor in self.sessionEnded(workoutSession) }
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
