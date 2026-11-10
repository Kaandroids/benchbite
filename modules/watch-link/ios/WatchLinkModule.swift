import ExpoModulesCore

/// Benchbite's link to the Apple Watch for JavaScript (src/watch/link.ios.ts, ADR 0109).
public class WatchLinkModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchLink")

    Events("onCommands", "onStatus")

    OnCreate {
      // Activated at launch already; this covers a launch the subscriber did not see.
      WatchSession.shared.activate()
    }

    OnStartObserving { [weak self] in
      WatchSession.shared.observe(
        commands: { self?.sendEvent("onCommands") },
        status: { self?.sendEvent("onStatus") })
    }

    OnStopObserving {
      WatchSession.shared.observe(commands: nil, status: nil)
    }

    Function("status") {
      WatchSession.shared.status
    }

    Function("sendState") { (json: String, workoutId: String?) in
      WatchSession.shared.sendState(json, workoutId: workoutId)
    }

    Function("takeCommands") {
      WatchSession.shared.takeCommands()
    }
  }
}
