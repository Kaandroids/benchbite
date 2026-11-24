#if DEBUG
  import Foundation

  /// What the app shows without a phone, for the README's screenshots (docs/media/README.md). The
  /// simulators pass the phone's states to the watch but not the watch's commands to the phone, so
  /// a watch there never follows a workout. A debug build takes this at launch instead, as JSON in
  /// the environment variable `BENCHBITE_SAMPLE`, and then leaves the phone and the health store
  /// alone.
  struct Sample: Decodable {
    /// The states the phone would send, in order: a workout the watch follows, or that workout and
    /// then its end, for its summary.
    let states: [WatchState]
    /// The heart rate to show while a workout runs.
    let bpm: Int?
    /// What a session would have measured over the workout saved, for its summary.
    let averageBpm: Int?
    let kcal: Int?

    /// The sample the app was launched with, if any.
    static let launched: Sample? = {
      guard let json = ProcessInfo.processInfo.environment["BENCHBITE_SAMPLE"] else { return nil }
      do {
        return try JSONDecoder().decode(Sample.self, from: Data(json.utf8))
      } catch {
        Log.link.error("Could not read BENCHBITE_SAMPLE: \(String(describing: error), privacy: .public)")
        return nil
      }
    }()
  }
#endif
