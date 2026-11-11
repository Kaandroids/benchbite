import SwiftUI

/// The rest between sets: a ring that runs down to the same end as the phone's, the set that comes
/// next, and the rest made shorter, skipped or longer.
struct RestView: View {
  @EnvironmentObject private var phone: PhoneLink
  let workout: WatchWorkout
  /// How long the rest is, which the ring is the whole of.
  let seconds: Int
  /// When it ends, as the watch shows it, and now, in milliseconds since the epoch.
  let endsAt: Double
  let now: Double

  var body: some View {
    let left = max(0, Int(((endsAt - now) / 1000).rounded(.up)))
    VStack(spacing: 6) {
      ZStack {
        Circle().stroke(Theme.control, lineWidth: 9)
        Circle()
          .trim(from: 0, to: seconds > 0 ? min(1, Double(left) / Double(seconds)) : 0)
          .stroke(Theme.accent, style: StrokeStyle(lineWidth: 9, lineCap: .round))
          .rotationEffect(.degrees(-90))
          .animation(.linear(duration: 1), value: left)
        VStack(spacing: 0) {
          Text("REST").font(.rounded(12, .heavy))
            .foregroundStyle(Theme.secondary)
          Text(Duration.seconds(left).formatted(.time(pattern: .minuteSecond)))
            .font(.rounded(30, .heavy))
            .monospacedDigit()
        }
      }
      .frame(width: 110, height: 110)
      if let next {
        Text(next)
          .font(.rounded(13))
          .foregroundStyle(Theme.secondary)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      HStack(spacing: 6) {
        change("−15", to: endsAt - 15_000)
        change("Skip", to: nil)
        change("+15", to: endsAt + 15_000)
      }
    }
    .foregroundStyle(Theme.text)
  }

  /// The set after the rest, as "Next: set 4 · 80 kg × 8".
  private var next: String? {
    workout.nextSet.map { "Next: set \($0.setIndex + 1) · \($0.set.text)" }
  }

  private func change(_ title: String, to newEnd: Double?) -> some View {
    Button(title) {
      phone.send(.setRest(workoutId: workout.id, of: endsAt, endsAt: newEnd))
    }
    .buttonStyle(PillButtonStyle(prominent: false, height: 38, fontSize: 14))
    // The phone takes a change only of the rest it has, so one waits for the one before.
    .disabled(phone.isRestWaiting(workoutId: workout.id))
  }
}
