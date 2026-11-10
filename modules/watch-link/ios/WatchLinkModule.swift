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
      WatchSession.shared.onCommands = { self?.sendEvent("onCommands") }
      WatchSession.shared.onStatus = { self?.sendEvent("onStatus") }
    }

    OnStopObserving {
      WatchSession.shared.onCommands = nil
      WatchSession.shared.onStatus = nil
    }

    Function("status") {
      WatchSession.shared.status
    }

    Function("sendState") { (json: String) in
      WatchSession.shared.sendState(json)
    }

    Function("takeCommands") {
      WatchSession.shared.takeCommands()
    }
  }
}
