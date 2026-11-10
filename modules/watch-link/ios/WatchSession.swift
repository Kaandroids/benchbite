import Foundation
import UserNotifications
import WatchConnectivity

/// The phone's side of the connection to Benchbite on the Apple Watch (ADR 0109). It carries the
/// protocol's messages as JSON and nothing else. It is activated when the app launches, also in the
/// background, so that commands the watch sends while JavaScript is not running are kept until it
/// reads them.
final class WatchSession: NSObject, WCSessionDelegate {
  static let shared = WatchSession()

  /// The notification of the end of the rest, as rest-alarm.tsx schedules it.
  private static let restNotificationId = "rest-end"
  private static let commandsKey = "watchLink.commands"
  /// The most commands kept for JavaScript: far more than wait at once.
  private static let maxCommands = 200

  private let lock = NSLock()
  /// Told when commands are waiting, and when the watch's status changes.
  var onCommands: (() -> Void)?
  var onStatus: (() -> Void)?

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

  /// Sends the latest state: as the application context, which replaces one not delivered yet and
  /// arrives in the background, and as a message too when the watch can take it now.
  func sendState(_ json: String) {
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

  /// Keeps a command for JavaScript, which checks it before using it.
  private func keep(_ payload: [String: Any]) {
    guard let command = payload["command"] as? String else { return }
    lock.lock()
    let commands = (UserDefaults.standard.stringArray(forKey: Self.commandsKey) ?? []) + [command]
    UserDefaults.standard.set(Array(commands.suffix(Self.maxCommands)), forKey: Self.commandsKey)
    lock.unlock()
    // The watch follows the workout and signals the end of the rest itself, so the phone's
    // notification would be a second alert (ADR 0109). Removed here, as JavaScript may be asleep.
    UNUserNotificationCenter.current().removePendingNotificationRequests(
      withIdentifiers: [Self.restNotificationId])
    onCommands?()
  }

  // MARK: - WCSessionDelegate

  func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    if let error {
      NSLog("[WatchLink] Could not activate the session: %@", error.localizedDescription)
    }
    onStatus?()
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  /// Another watch was chosen: the session starts again for it.
  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  func sessionWatchStateDidChange(_ session: WCSession) {
    onStatus?()
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    onStatus?()
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    keep(message)
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    keep(userInfo)
  }
}
