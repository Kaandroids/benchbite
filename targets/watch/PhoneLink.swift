import Foundation
import WatchConnectivity

/// The watch's side of the connection to Benchbite on the iPhone (ADR 0109). It shows the latest
/// state the phone sent, and sends commands: as a message while the phone is reachable, else as a
/// transfer that waits and arrives in order.
final class PhoneLink: NSObject, ObservableObject, WCSessionDelegate {
  /// The workout the phone runs, or none.
  @Published private(set) var workout: WatchWorkout?
  /// The commands sent that the phone has not applied yet, by their id.
  @Published private(set) var waiting: [String: WatchCommand] = [:]

  private var lastSeq: Double = 0

  override init() {
    super.init()
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  /// Whether a command for this set waits for the phone, which a second one would only repeat.
  func isWaiting(workoutId: String, exercise: Int, set: Int) -> Bool {
    waiting.values.contains {
      $0.workoutId == workoutId && $0.exercise == exercise && $0.set == set
    }
  }

  func send(_ command: WatchCommand?) {
    guard let command,
      !isWaiting(workoutId: command.workoutId, exercise: command.exercise, set: command.set)
    else { return }
    let payload = command.payload
    waiting[command.id] = command
    let session = WCSession.default
    // Without a reply handler, as the phone takes messages without replying.
    if session.isReachable {
      session.sendMessage(payload, replyHandler: nil) { _ in
        session.transferUserInfo(payload)
      }
    } else {
      session.transferUserInfo(payload)
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
      self.workout = state.workout
      // Applied, or for a workout the phone no longer runs, which it drops without saying so.
      let applied = Set(state.workout?.applied ?? [])
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
