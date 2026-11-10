import SwiftUI

@main
struct BenchbiteWatchApp: App {
  @StateObject private var phone = PhoneLink()

  var body: some Scene {
    WindowGroup {
      WorkoutView()
        .environmentObject(phone)
    }
  }
}
