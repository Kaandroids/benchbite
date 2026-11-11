import SwiftUI

@main
struct BenchbiteWatchApp: App {
  @StateObject private var phone = PhoneLink()
  @StateObject private var restAlert = RestAlert()

  var body: some Scene {
    WindowGroup {
      WorkoutView()
        .environmentObject(phone)
        .environmentObject(restAlert)
    }
  }
}
