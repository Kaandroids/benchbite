import SwiftUI

/// The short summary of a workout the watch followed, once the phone saved it (ADR 0119): its time,
/// the sets saved, what the watch measured and the records, which the phone's finish screen lists.
struct SummaryView: View {
  @EnvironmentObject private var workoutSession: WorkoutSession
  let workout: FinishedWorkout

  var body: some View {
    // What the watch measured, once its workout is saved, which takes a moment.
    let totals = workoutSession.totals.flatMap { $0.workoutId == workout.id ? $0 : nil }
    ScrollView {
      VStack(spacing: 8) {
        Text("\(workout.title) done")
          .font(.rounded(17, .heavy))
          .multilineTextAlignment(.center)
          .lineLimit(2)
        Grid(horizontalSpacing: 6, verticalSpacing: 6) {
          GridRow {
            Tile(value: duration, label: "TIME")
            Tile(value: "\(workout.setsSaved)/\(workout.setCount)", label: "SETS")
          }
          GridRow {
            Tile(
              value: totals?.averageBpm.map(String.init) ?? "–", label: "AVG BPM",
              tint: Theme.heart)
            Tile(value: totals?.kcal.map(String.init) ?? "–", label: "KCAL")
          }
        }
        if workout.records > 0 {
          let records = workout.records == 1 ? "record" : "records"
          Text("\(workout.records) new \(records) · see your iPhone")
          .font(.rounded(13, .heavy))
          .foregroundStyle(Theme.success)
          .multilineTextAlignment(.center)
          .padding(.top, 4)
        }
      }
      .foregroundStyle(Theme.text)
    }
  }

  /// From its start to its end on the phone, as "52:10", or "1:02:10" from an hour.
  private var duration: String {
    let seconds = max(0, Int((workout.endedAt - workout.startedAt) / 1000))
    let time = Duration.seconds(seconds)
    return seconds < 3600
      ? time.formatted(.time(pattern: .minuteSecond))
      : time.formatted(.time(pattern: .hourMinuteSecond))
  }
}

/// A value and what it is, as "52:10" over "TIME".
private struct Tile: View {
  let value: String
  let label: String
  var tint: Color = Theme.text

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(value)
        .font(.rounded(20, .heavy))
        .monospacedDigit()
        .foregroundStyle(tint)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      Text(label)
        .font(.rounded(11, .heavy))
        .foregroundStyle(Theme.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 8)
    .padding(.vertical, 6)
    .background(Theme.tile, in: RoundedRectangle(cornerRadius: 14))
    .accessibilityElement(children: .combine)
  }
}
