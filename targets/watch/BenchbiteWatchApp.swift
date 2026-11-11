import SwiftUI

@main
struct BenchbiteWatchApp: App {
  @StateObject private var phone = PhoneLink()
  @StateObject private var restAlert = RestAlert()
  @StateObject private var workoutSession = WorkoutSession()

  var body: some Scene {
    WindowGroup {
      WorkoutView()
        .environmentObject(phone)
        .environmentObject(restAlert)
        .environmentObject(workoutSession)
    }
  }
}
