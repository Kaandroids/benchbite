import Foundation
import WatchConnectivity
import WatchKit

/// The watch's side of the connection to Benchbite on the iPhone (ADR 0109). It shows the latest
/// state the phone sent, and sends commands: as a message while the phone is reachable, else as a
/// transfer that waits and arrives in order.
final class PhoneLink: NSObject, ObservableObject, WCSessionDelegate {
  /// The workout the phone runs, or none.
  @Published private(set) var workout: WatchWorkout?
  /// How the latest workouts ended, which the workout session ends by.
  @Published private(set) var ended: [WatchEnded] = []
  /// Told each state the phone sends, as the workout session follows it whether a view shows.
  var onState: (@MainActor (WatchState) -> Void)?
  /// The commands sent that the phone has not applied yet, by their id.
  @Published private(set) var waiting: [String: WatchCommand] = [:]
  /// The workout whose finish the phone took without ending it, as it could not save it
  /// (ADR 0118); none once it is finished again. The phone applies a finish only then: one it
  /// saves ends the workout instead.
  @Published private(set) var unsaved: String?
  /// The phone can be reached now, so that a command goes at once; else commands wait for it, and
  /// the sets ticked here say so (ADR 0121).
  @Published private(set) var reachable = false
  /// The language the watch shows its texts in, as the phone last said (ADR 0123): the views
  /// that observe the link are drawn again in it.
  @Published private(set) var language = L10n.language {
    didSet { L10n.language = language }
  }
  /// The workout the watch followed that the phone saved last, for its summary (ADR 0119); none
  /// once another workout runs, or once the summary is closed (ADR 0120).
  @Published private(set) var finished: FinishedWorkout? {
    didSet { summarySeen = finished != nil && WKApplication.shared().applicationState == .active }
  }
  /// The summary showed with the app active, so that the app going to the background closes it;
  /// one that came while the app was not active waits to be seen (ADR 0120).
  private var summarySeen = false

  private var lastSeq: Double = 0
  private var here: Timer?
  /// The workout the watch measures, which its sign is about.
  private var measuring: String?
  /// The end of the rest the watch signals, which its sign tells, and which it tells at once when
  /// it changes, so that the phone puts its own notification off for it in time.
  var signalling: Double? {
    didSet {
      if signalling != oldValue, let measuring { sendHere(measuring) }
    }
  }
  /// The heart rate the watch measures, which its sign tells, and which it tells when it changes,
  /// so that the phone shows it while the workout runs there (ADR 0116).
  var heartRate: Int? {
    didSet {
      if heartRate != oldValue, let measuring { sendHere(measuring) }
    }
  }
  /// Less than half the time the phone takes the watch to be there after its sign: `heardFor` in
  /// modules/watch-link/ios/RestSignal.swift (ADR 0114).
  private static let hereEvery: TimeInterval = 30

  override init() {
    super.init()
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  /// Closes the summary of the workout saved last, which then shows "No workout yet".
  func closeSummary() {
    finished = nil
  }

  /// The app is active: a summary shows, and is seen.
  func becameActive() {
    if finished != nil { summarySeen = true }
  }

  /// The app went to the background, as when the watch returns to its face: a summary seen closes.
  func wentToBackground() {
    if summarySeen { closeSummary() }
  }

  /// Whether a tick of this set waits for the phone, which a second one would only repeat.
  func isTickWaiting(workoutId: String, exercise: Int, set: Int) -> Bool {
    firstWaiting(workoutId) { $0.isTick(exercise: exercise, set: set) } != nil
  }

  /// Whether a start of the set's clock waits for the phone.
  func isClockWaiting(workoutId: String, exercise: Int, set: Int) -> Bool {
    startWaiting(workoutId, exercise: exercise, set: set) != nil
  }

  private func startWaiting(_ workoutId: String, exercise: Int, set: Int) -> WatchCommand? {
    firstWaiting(workoutId) { $0.startsClock(exercise: exercise, set: set) }
  }

  /// When the clock of a set started, as the watch shows it: a start made here the phone has not
  /// taken, else the phone's clock; none once a tick of the set waits, which stops it (ADR 0124).
  func clockStart(of workout: WatchWorkout, exercise: Int, set: Int) -> Double? {
    if isTickWaiting(workoutId: workout.id, exercise: exercise, set: set) { return nil }
    if let started = startWaiting(workout.id, exercise: exercise, set: set) {
      return started.at
    }
    guard let clock = workout.clock, clock.exercise == exercise, clock.set == set else { return nil }
    return clock.startedAt
  }

  /// Whether a change of the workout's rest waits for the phone. Another waits until it is
  /// applied, as the phone takes a change only of the rest it has, and the two could arrive in
  /// either order.
  func isRestWaiting(workoutId: String) -> Bool {
    firstWaiting(workoutId) { $0.isRest } != nil
  }

  /// Whether finishing the workout waits for the phone, which saves it.
  func isFinishWaiting(workoutId: String) -> Bool {
    firstWaiting(workoutId) { $0.isFinish } != nil
  }

  /// The sets ticked done here that the phone has not taken yet.
  private func waitingTicks(of workout: WatchWorkout) -> Set<SetIndex> {
    Set(
      waiting.values.compactMap { command -> SetIndex? in
        guard command.workoutId == workout.id,
          case .tick(let exercise, let set, _) = command.change,
          workout.exercises.indices.contains(exercise),
          workout.exercises[exercise].sets.indices.contains(set),
          !workout.exercises[exercise].sets[set].done
        else { return nil }
        return SetIndex(exercise: exercise, set: set)
      })
  }

  /// How many sets ticked here wait for the phone while it is out of reach, which the top line then
  /// says in place of the heart rate (ADR 0121); none while it can be reached.
  func setsWaitingOutOfReach(of workout: WatchWorkout) -> Int {
    reachable ? 0 : waitingTicks(of: workout).count
  }

  /// How many sets finishing the workout saves, as the watch shows it: the phone's count, and the
  /// sets ticked done here that the phone has not applied yet, as it applies them before the
  /// finish (ADR 0118).
  func setsToSave(of workout: WatchWorkout) -> Int {
    let ticked = waitingTicks(of: workout)
    // A set whose clock's start waits, which finishing logs once the phone has started it, unless
    // its tick waits too or the phone's clock already times it.
    let timed = Set(
      waiting.values.compactMap { command -> SetIndex? in
        guard command.workoutId == workout.id, case .clock(let exercise, let set) = command.change,
          workout.exercises.indices.contains(exercise),
          workout.exercises[exercise].sets.indices.contains(set),
          !workout.exercises[exercise].sets[set].done,
          workout.clock.map({ $0.exercise != exercise || $0.set != set }) ?? true
        else { return nil }
        return SetIndex(exercise: exercise, set: set)
      }
    ).subtracting(ticked)
    return workout.setsToSave + ticked.count + timed.count
  }

  /// The set to do next as the watch shows it: the phone's, or, while a pick or ticks here wait
  /// for the phone, the set the phone finds once it takes them: the first not done nor ticked here
  /// from the exercise of the latest of them, as a pick opens its exercise and a tick stays on its
  /// own until it is done (markDone, nextSetOf); so logging goes on with the phone out of reach
  /// (ADR 0121).
  func nextSet(of workout: WatchWorkout) -> NextSet? {
    let latest = waiting.values.filter { $0.workoutId == workout.id && $0.change.leads != nil }
      .max { $0.at < $1.at }
    guard let from = latest?.change.leads, workout.exercises.indices.contains(from) else {
      return workout.phoneNextSet
    }
    return workout.firstOpenSet(from: from, skipping: waitingTicks(of: workout))
  }

  /// The set to do after a tick of `next`, for its rest: the next set the watch shows once the
  /// tick is sent.
  func nextSet(afterTicking next: NextSet, of workout: WatchWorkout) -> NextSet? {
    workout.firstOpenSet(
      from: next.exerciseIndex,
      skipping: waitingTicks(of: workout).union([
        SetIndex(exercise: next.exerciseIndex, set: next.setIndex)
      ]))
  }

  /// Whether joining the workout waits for the phone.
  func isJoinWaiting(workoutId: String) -> Bool {
    firstWaiting(workoutId) { $0.isJoin } != nil
  }

  /// The exercise picked last for the workout, while the phone has not applied the pick: its sets
  /// come next once it has (ADR 0117).
  func picked(workoutId: String) -> Int? {
    waiting.values.filter { $0.workoutId == workoutId && $0.change.opens != nil }
      .max { $0.at < $1.at }?.change.opens
  }

  /// The exercise whose sets come next as the watch shows it: that of the set it shows, else the
  /// one picked last while the phone has not applied the pick.
  func openExercise(of workout: WatchWorkout) -> Int? {
    nextSet(of: workout)?.exerciseIndex ?? picked(workoutId: workout.id)
  }

  /// The workout's rest as the watch shows it: the phone's, or one a tick here starts, as changed
  /// by a change made here that the phone has not applied yet.
  func rest(of workout: WatchWorkout) -> ShownRest? {
    let ticked = waiting.values.lazy.filter { $0.workoutId == workout.id }
      .compactMap(\.change.startsRest)
      .max { $0.endsAt < $1.endsAt }
    let rest =
      ticked
      ?? workout.rest.map {
        ShownRest(endsAt: $0.endsAt, seconds: $0.seconds, next: nextSet(of: workout)?.label)
      }
    guard let change = firstWaiting(workout.id, where: \.isRest)?.change,
      case .rest(let endsAt) = change
    else { return rest }
    return endsAt.map {
      ShownRest(
        endsAt: $0, seconds: rest?.seconds ?? 0, next: rest?.next ?? nextSet(of: workout)?.label)
    }
  }

  private func firstWaiting(
    _ workoutId: String, where matches: (WatchCommand.Change) -> Bool
  ) -> WatchCommand? {
    waiting.values.first { $0.workoutId == workoutId && matches($0.change) }
  }

  func send(_ command: WatchCommand?) {
    guard let command else { return }
    switch command.change {
    case .tick(let exercise, let set, _):
      if isTickWaiting(workoutId: command.workoutId, exercise: exercise, set: set) { return }
    case .rest:
      if isRestWaiting(workoutId: command.workoutId) { return }
    case .join:
      if isJoinWaiting(workoutId: command.workoutId) { return }
    case .clock(let exercise, let set):
      if isClockWaiting(workoutId: command.workoutId, exercise: exercise, set: set) { return }
    case .finish:
      if isFinishWaiting(workoutId: command.workoutId) { return }
      unsaved = nil
    case .open(let exercise):
      // Only a pick of another exercise than the one shown: picking the phone's again undoes a
      // pick that waits, as the phone applies picks in the order made (ADR 0117).
      if let workout, workout.id == command.workoutId, exercise == openExercise(of: workout) {
        return
      }
    }
    let payload = command.payload
    waiting[command.id] = command
    let session = WCSession.default
    // Without a reply handler, as the phone takes messages without replying. Behind a transfer
    // still on its way, a command goes as a transfer too, as transfers arrive in order and a
    // message could overtake them: a tick before the pick it follows (ADR 0121). A clock's start
    // always goes as a transfer, as its time is its own, so that its tick, its Stop, cannot
    // overtake it (ADR 0124).
    if session.isReachable, session.outstandingUserInfoTransfers.isEmpty,
      !command.change.startsAClock
    {
      session.sendMessage(payload, replyHandler: nil) { _ in
        session.transferUserInfo(payload)
      }
    } else {
      session.transferUserInfo(payload)
    }
  }

  /// Tells the phone the watch is there to signal the workout's rests, now and every half a minute
  /// while it measures `workoutId`, or stops with nil; the phone then puts its own notification off
  /// (ADR 0114).
  func sayHere(while workoutId: String?) {
    here?.invalidate()
    here = nil
    measuring = workoutId
    guard let workoutId else { return }
    sendHere(workoutId)
    here = Timer.scheduledTimer(withTimeInterval: Self.hereEvery, repeats: true) {
      [weak self] _ in
      self?.sendHere(workoutId)
    }
  }

  /// One sign, with the rest the watch signals and its heart rate; only while the phone can be
  /// reached, as a sign that waited would say nothing of now.
  private func sendHere(_ workoutId: String) {
    let session = WCSession.default
    guard session.activationState == .activated, session.isReachable else { return }
    var sign: [String: Any] = ["here": workoutId]
    if let signalling { sign["rest"] = signalling }
    if let heartRate { sign["bpm"] = heartRate }
    session.sendMessage(sign, replyHandler: nil) { error in
      NSLog("[PhoneLink] Could not say the watch is there: %@", error.localizedDescription)
    }
  }

  /// Takes a state from the phone, unless an older one than what is shown.
  private func receive(_ payload: [String: Any]) {
    guard let json = payload["state"] as? String, let state = WatchState.decode(json) else {
      return
    }
    DispatchQueue.main.async {
      guard state.seq > self.lastSeq else { return }
      self.lastSeq = state.seq
      if let language = state.language, language != self.language {
        self.language = language
      }
      // The workout shown is saved: its summary shows until the next runs or it is closed.
      if state.workout != nil {
        self.finished = nil
      } else if let finished = FinishedWorkout.saved(self.workout, in: state) {
        self.finished = finished
      }
      self.workout = state.workout
      self.ended = state.ended
      MainActor.assumeIsolated { self.onState?(state) }
      // Applied, or for a workout the phone no longer runs, which it drops without saying so.
      let applied = Set(state.workout?.applied ?? [])
      // A finish the phone took while the workout goes on: it could not save it.
      if let workout = state.workout,
        self.waiting.values.contains(where: {
          $0.workoutId == workout.id && $0.change.isFinish && applied.contains($0.id)
        })
      {
        self.unsaved = workout.id
      }
      self.waiting = self.waiting.filter { id, command in
        !applied.contains(id) && command.workoutId == state.workout?.id
      }
    }
  }

  // MARK: - WCSessionDelegate

  func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    receive(session.receivedApplicationContext)
    reachabilityChanged(session)
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    reachabilityChanged(session)
  }

  private func reachabilityChanged(_ session: WCSession) {
    let reachable = session.isReachable
    DispatchQueue.main.async { self.reachable = reachable }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    receive(applicationContext)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    receive(message)
  }

  /// A transfer that failed never reaches the phone: its command waits no more, and can be sent
  /// again.
  func session(
    _ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: Error?
  ) {
    guard error != nil, let json = userInfoTransfer.userInfo["command"] as? String else { return }
    DispatchQueue.main.async {
      self.waiting = self.waiting.filter { _, command in command.json != json }
    }
  }
}
