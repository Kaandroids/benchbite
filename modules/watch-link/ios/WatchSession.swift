import Foundation
import UserNotifications
import WatchConnectivity

/// The phone's side of the connection to Benchbite on the Apple Watch (ADR 0109). It carries the
/// protocol's messages as JSON, and takes the phone's rest notification away when the watch takes
/// over the workout, as JavaScript may not be running then. It is activated when the app launches,
/// also in the background, so that commands the watch sends while JavaScript is not running are
/// kept until it reads them.
final class WatchSession: NSObject, WCSessionDelegate {
  static let shared = WatchSession()

  /// The notification of the end of the rest: REST_NOTIFICATION_ID in src/sessions/rest-alarm.tsx.
  private static let restNotificationId = "rest-end"
  private static let commandsKey = "watchLink.commands"
  /// The workout of the last state sent, kept for a launch in the background without JavaScript.
  private static let workoutIdKey = "watchLink.workoutId"
  /// The most commands kept for JavaScript: far more than wait at once.
  private static let maxCommands = 200

  /// Guards the kept commands and the listeners.
  private let lock = NSLock()
  /// Guards the last state across its delivery, so that an older state never replaces a newer one.
  private let delivery = NSLock()
  /// The last state JavaScript sent, sent again once the watch can take it.
  private var lastState: String?
  /// Told when commands are waiting, and when the watch's status changes.
  private var onCommands: (() -> Void)?
  private var onStatus: (() -> Void)?

  /// Listens for waiting commands and status changes, or stops with nil. Commands already waiting,
  /// which arrived while nothing listened, are announced at once.
  func observe(commands: (() -> Void)?, status: (() -> Void)?) {
    lock.lock()
    onCommands = commands
    onStatus = status
    let waiting = !(UserDefaults.standard.stringArray(forKey: Self.commandsKey) ?? []).isEmpty
    lock.unlock()
    if waiting {
      commands?()
    }
  }

  private func commandsWaiting() {
    lock.lock()
    let listener = onCommands
    lock.unlock()
    listener?()
  }

  private func statusChanged() {
    lock.lock()
    let listener = onStatus
    lock.unlock()
    listener?()
  }

  func activate() {
    guard WCSession.isSupported(), WCSession.default.activationState == .notActivated else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  /// Whether a watch is paired, has Benchbite, and can be talked to now.
  var status: [String: Bool] {
    guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
      return ["paired": false, "installed": false, "reachable": false]
    }
    let session = WCSession.default
    return [
      "paired": session.isPaired,
      "installed": session.isWatchAppInstalled,
      "reachable": session.isReachable,
    ]
  }

  /// Sends the latest state, and keeps it to send again when the session or the watch is not ready
  /// yet: the session starts after the app does, and the watch app may be installed later.
  /// The workout's id comes with it, as only JavaScript reads the state.
  func sendState(_ json: String, workoutId: String?) {
    delivery.lock()
    defer { delivery.unlock() }
    lastState = json
    lock.lock()
    UserDefaults.standard.set(workoutId, forKey: Self.workoutIdKey)
    lock.unlock()
    deliver(json)
  }

  /// Sends the last state again, as when the session became active or the watch app was installed.
  private func deliverLastState() {
    delivery.lock()
    defer { delivery.unlock() }
    if let lastState {
      deliver(lastState)
    }
  }

  /// As the application context, which replaces one not delivered yet and arrives in the
  /// background, and as a message too when the watch can take it now.
  private func deliver(_ json: String) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else {
      return
    }
    let message = ["state": json]
    do {
      try session.updateApplicationContext(message)
    } catch {
      NSLog("[WatchLink] Could not update the application context: %@", error.localizedDescription)
    }
    if session.isReachable {
      session.sendMessage(message, replyHandler: nil) { error in
        NSLog("[WatchLink] Could not send the state: %@", error.localizedDescription)
      }
    }
  }

  /// The commands kept so far, oldest first, which are then no longer kept.
  func takeCommands() -> [String] {
    lock.lock()
    defer { lock.unlock() }
    let commands = UserDefaults.standard.stringArray(forKey: Self.commandsKey) ?? []
    UserDefaults.standard.removeObject(forKey: Self.commandsKey)
    return commands
  }

  /// Keeps a command for JavaScript, which checks it before using it. The watch sends it as
  /// `["command": json, "workoutId": id]`, the workout's id beside it as in sendState(), so that
  /// nothing here reads the protocol's messages.
  private func keep(_ payload: [String: Any]) {
    guard let command = payload["command"] as? String else { return }
    lock.lock()
    let commands = (UserDefaults.standard.stringArray(forKey: Self.commandsKey) ?? []) + [command]
    UserDefaults.standard.set(Array(commands.suffix(Self.maxCommands)), forKey: Self.commandsKey)
    let workoutId = UserDefaults.standard.string(forKey: Self.workoutIdKey)
    lock.unlock()
    if let workoutId, payload["workoutId"] as? String == workoutId {
      silenceRestOnPhone()
    }
    commandsWaiting()
  }

  /// A command for the workout the phone runs shows that the watch follows it and signals the end of
  /// the rest itself, so the phone's notification would be a second alert (ADR 0109). Removed here,
  /// as JavaScript may be asleep. A command of an earlier workout, arriving late, leaves it.
  private func silenceRestOnPhone() {
    UNUserNotificationCenter.current().removePendingNotificationRequests(
      withIdentifiers: [Self.restNotificationId])
  }

  // MARK: - WCSessionDelegate

  func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    if let error {
      NSLog("[WatchLink] Could not activate the session: %@", error.localizedDescription)
    }
    deliverLastState()
    statusChanged()
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  /// Another watch was chosen: the session starts again for it.
  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  func sessionWatchStateDidChange(_ session: WCSession) {
    deliverLastState()
    statusChanged()
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    statusChanged()
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    keep(message)
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    keep(userInfo)
  }
}
