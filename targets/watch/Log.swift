import os

/// The watch app's log, which Console shows with the watch connected to a Mac, under the subsystem
/// com.benchbite.watch (#718). It names workouts by their ids and says what was decided, never a
/// set's values or the heart rate.
enum Log {
  private static let subsystem = "com.benchbite.watch"
  /// The connection to the phone: what arrives, what is sent, and whether the phone is reachable.
  static let link = Logger(subsystem: subsystem, category: "link")
  /// The workout session: when it starts, is taken up, ends, and why.
  static let session = Logger(subsystem: subsystem, category: "session")
  /// The Digital Crown in the value editor: its focus and its turns.
  static let crown = Logger(subsystem: subsystem, category: "crown")
}
