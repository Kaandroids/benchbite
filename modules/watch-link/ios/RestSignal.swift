import Foundation
import UserNotifications

/// The phone's notification of the end of the rest on iOS, which only this schedules, as it puts it
/// off while the watch signals the rest itself (ADR 0114), also with JavaScript not running.
/// JavaScript says which rest to signal, and the watch's sign which rest it signals; both, and the
/// notification, change on one queue, one after the other.
final class RestSignal {
  static let shared = RestSignal()

  /// The notification of the end of the rest: REST_NOTIFICATION_ID in src/sessions/rest-alarm.tsx.
  private static let notificationId = "rest-end"
  /// The rest JavaScript last asked to signal: its end, in milliseconds, and its texts.
  private static let restKey = "watchLink.rest"
  /// When the watch was last heard from about the workout the phone runs, in milliseconds, and the
  /// end of the rest it then signalled, if any.
  private static let heardAtKey = "watchLink.heardAt"
  private static let heardRestKey = "watchLink.heardRest"
  /// How long the watch is taken to be there after it was heard: over twice the time between its
  /// signs, `hereEvery` in targets/watch/PhoneLink.swift.
  private static let heardFor: TimeInterval = 75

  private let queue = DispatchQueue(label: "watchLink.restSignal")

  /// Until when the watch is taken to be there, and the end of the rest it signals, in
  /// milliseconds, for the status JavaScript reads.
  var heard: (until: Double, rest: Double?)? {
    queue.sync {
      guard let heardAt = UserDefaults.standard.object(forKey: Self.heardAtKey) as? Double else {
        return nil
      }
      return (heardAt + Self.heardFor * 1000, Self.heardRest)
    }
  }

  /// Signals the end of this rest, or of none, in place of the one before.
  func signal(endsAt: Double?, title: String, body: String) {
    queue.async {
      if let endsAt {
        UserDefaults.standard.set(
          ["endsAt": endsAt, "title": title, "body": body], forKey: Self.restKey)
      } else {
        UserDefaults.standard.removeObject(forKey: Self.restKey)
      }
      self.schedule()
    }
  }

  /// The watch said it is there, signalling the rest that ends at `restEndsAt`, if any; `then`
  /// once that is kept.
  func heard(restEndsAt: Double?, then done: @escaping () -> Void) {
    queue.async {
      UserDefaults.standard.set(Date().timeIntervalSince1970 * 1000, forKey: Self.heardAtKey)
      UserDefaults.standard.set(restEndsAt, forKey: Self.heardRestKey)
      self.schedule()
      done()
    }
  }

  /// The watch was heard of another workout, which says nothing of this one.
  func forgetHeard() {
    queue.async {
      UserDefaults.standard.removeObject(forKey: Self.heardAtKey)
      UserDefaults.standard.removeObject(forKey: Self.heardRestKey)
      self.schedule()
    }
  }

  private static var heardRest: Double? {
    UserDefaults.standard.object(forKey: heardRestKey) as? Double
  }

  /// Schedules the notification of the rest JavaScript asked for, when it ends; or, while the
  /// watch signals that same rest, once the time it is heard for is up at the earliest, so that it
  /// comes only should the watch stop being heard. A rest the watch was heard signalling past its
  /// end, it signalled, and the notification goes.
  private func schedule() {
    let center = UNUserNotificationCenter.current()
    guard let rest = UserDefaults.standard.dictionary(forKey: Self.restKey),
      let endsAt = rest["endsAt"] as? Double
    else {
      center.removePendingNotificationRequests(withIdentifiers: [Self.notificationId])
      return
    }
    let now = Date().timeIntervalSince1970 * 1000
    var firesAt = endsAt
    if let heardAt = UserDefaults.standard.object(forKey: Self.heardAtKey) as? Double,
      Self.heardRest == endsAt
    {
      if heardAt >= endsAt {
        center.removePendingNotificationRequests(withIdentifiers: [Self.notificationId])
        return
      }
      firesAt = max(endsAt, heardAt + Self.heardFor * 1000)
    }
    guard firesAt > now else {
      center.removePendingNotificationRequests(withIdentifiers: [Self.notificationId])
      return
    }
    let content = UNMutableNotificationContent()
    content.title = rest["title"] as? String ?? ""
    content.body = rest["body"] as? String ?? ""
    content.sound = .default
    center.add(
      UNNotificationRequest(
        identifier: Self.notificationId, content: content,
        trigger: UNTimeIntervalNotificationTrigger(
          timeInterval: (firesAt - now) / 1000, repeats: false)))
  }
}
