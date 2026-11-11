import SwiftUI

/// The line at the top of the set and the rest: the sets that wait for the phone while it is out
/// of reach (ADR 0121), else the heart rate.
struct StatusLine: View {
  @EnvironmentObject private var phone: PhoneLink
  let workout: WatchWorkout

  var body: some View {
    let waiting = phone.setsWaitingOutOfReach(of: workout)
    if waiting > 0 {
      Label(
        L10n.t("setsWaiting", count: waiting),
        systemImage: "iphone.slash"
      )
      .font(.rounded(12, .heavy))
      .lineLimit(1)
      .minimumScaleFactor(0.8)
      .foregroundStyle(Theme.warning)
      .padding(.horizontal, 10)
      .padding(.vertical, 3)
      .background(Theme.warningBackground, in: Capsule())
      .frame(maxWidth: .infinity)
    } else {
      HeartRateLabel()
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}
