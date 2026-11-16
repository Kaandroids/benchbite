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

  /// What the watch shows of a workout while the commands sent wait for the phone.
  private var shown: WaitingCommands { WaitingCommands(commands: waiting, reachable: reachable) }

  func isTickWaiting(workoutId: String, exercise: Int, set: Int) -> Bool {
    shown.isTickWaiting(workoutId: workoutId, exercise: exercise, set: set)
  }

  func isClockWaiting(workoutId: String, exercise: Int, set: Int) -> Bool {
    shown.isClockWaiting(workoutId: workoutId, exercise: exercise, set: set)
  }

  func clockStart(of workout: WatchWorkout, exercise: Int, set: Int) -> Double? {
    shown.clockStart(of: workout, exercise: exercise, set: set)
  }

  func isRestWaiting(workoutId: String) -> Bool { shown.isRestWaiting(workoutId: workoutId) }

  func isFinishWaiting(workoutId: String) -> Bool { shown.isFinishWaiting(workoutId: workoutId) }

  func setsWaitingOutOfReach(of workout: WatchWorkout) -> Int {
    shown.setsWaitingOutOfReach(of: workout)
  }

  func setsToSave(of workout: WatchWorkout) -> Int { shown.setsToSave(of: workout) }

  func nextSet(of workout: WatchWorkout) -> NextSet? { shown.nextSet(of: workout) }

  func supersetRound(of next: NextSet, in workout: WatchWorkout) -> (round: Int, rounds: Int)? {
    shown.supersetRound(of: next, in: workout)
  }

  func afterTicking(_ next: NextSet, of workout: WatchWorkout) -> (rests: Bool, next: NextSet?) {
    shown.afterTicking(next, of: workout)
  }

  func isJoinWaiting(workoutId: String) -> Bool { shown.isJoinWaiting(workoutId: workoutId) }

  func picked(workoutId: String) -> Int? { shown.picked(workoutId: workoutId) }

  func openExercise(of workout: WatchWorkout) -> Int? { shown.openExercise(of: workout) }

  func rest(of workout: WatchWorkout) -> ShownRest? { shown.rest(of: workout) }

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
