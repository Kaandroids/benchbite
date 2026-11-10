import ExpoModulesCore

/// Starts the connection to the watch when the app launches, also when the system launches it in
/// the background to deliver what the watch sent (ADR 0109).
public class WatchLinkAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    WatchSession.shared.activate()
    return true
  }
}
