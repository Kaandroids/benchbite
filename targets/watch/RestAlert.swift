import SwiftUI
import UserNotifications
import WatchKit

/// Signals the end of the rest while the watch follows the workout, and the phone does not (ADR
/// 0112): a local notification, which taps the wrist with the app closed or the wrist down, and,
/// with the app open, a tap and the rest-over screen instead.
@MainActor
final class RestAlert: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
  /// A rest that ended while the app was open, until Go.
  struct Over: Equatable {
    let endsAt: Double
    /// The set after it, as "Set 4 · 80 kg × 8".
    let next: String?
  }

  /// The rest a signal is set for: when it ends, and the set after it.
  struct Rest: Equatable {
    let endsAt: Double
    let next: String?
  }

  @Published var over: Over?

  private static let id = "rest-end"
  /// A rest that ended longer ago than this, when the app comes back, is not signalled again.
  private static let late: TimeInterval = 2
  private var rest: Rest?
  private var timer: Timer?

  override init() {
    super.init()
    UNUserNotificationCenter.current().delegate = self
  }

  /// Asks to signal rests, once the user joins a workout.
  func requestPermission() {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
  }

  /// Signals the end of this rest, or of none, in place of the one before.
  func follow(_ rest: Rest?) {
    guard rest != self.rest else { return }
    self.rest = rest
    timer?.invalidate()
    timer = nil
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: [Self.id])
    guard let rest else { return }
    over = nil
    let seconds = rest.endsAt / 1000 - Date().timeIntervalSince1970
    guard seconds > 0 else { return }
    let content = UNMutableNotificationContent()
    content.title = "Rest is over"
    content.body = rest.next ?? ""
    content.sound = .default
    center.add(
      UNNotificationRequest(
        identifier: Self.id, content: content,
        trigger: UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)))
    // Fires only while the app runs; with it closed, the notification signals the rest.
    timer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
      Task { @MainActor in self?.ring(rest) }
    }
  }

  private func ring(_ rest: Rest) {
    guard rest == self.rest, Date().timeIntervalSince1970 - rest.endsAt / 1000 < Self.late else {
      return
    }
    WKInterfaceDevice.current().play(.notification)
    over = Over(endsAt: rest.endsAt, next: rest.next)
  }

  /// With the app open, the rest-over screen shows instead of the notification.
  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([])
  }
}
