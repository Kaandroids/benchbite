import SwiftUI

/// The heart rate the workout session measures, as "♥︎ 132"; nothing before it measures one.
struct HeartRateLabel: View {
  @EnvironmentObject private var workoutSession: WorkoutSession

  var body: some View {
    if let heartRate = workoutSession.heartRate {
      Text("♥︎ \(heartRate)")
        .font(.rounded(13))
        .monospacedDigit()
        .foregroundStyle(Theme.heart)
        .accessibilityLabel(L10n.t("heartRate", ["bpm": heartRate]))
    }
  }
}
