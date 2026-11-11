import SwiftUI

/// Asks to finish the workout, which the phone then saves (ADR 0118), and waits for it: the workout
/// ends on both once it is saved, or goes on, saying so, when the phone could not save it.
struct FinishView: View {
  @EnvironmentObject private var phone: PhoneLink
  @Environment(\.dismiss) private var dismiss
  let workout: WatchWorkout

  var body: some View {
    let saved = phone.setsToSave(of: workout)
    ScrollView {
      VStack(spacing: 8) {
        if phone.isFinishWaiting(workoutId: workout.id) {
          ProgressView()
            .padding(.top, 10)
          Text(L10n.t("finish.saving")).font(.rounded(17, .heavy))
          // Its app saves it only while it runs, which the watch cannot tell.
          Text(L10n.t("finish.savingHint"))
            .font(.rounded(13))
            .foregroundStyle(Theme.secondary)
        } else {
          Text(L10n.t("finish.title"))
            .font(.rounded(18, .heavy))
            .padding(.top, 10)
          Text(
            saved == 0
              ? L10n.t("finish.noSets")
              : L10n.t("finish.sets", ["done": saved, "count": workout.setsDone.count]))
            .font(.rounded(14))
            .foregroundStyle(Theme.secondary)
          if phone.unsaved == workout.id {
            Text(L10n.t("finish.unsaved"))
              .font(.rounded(12))
              .foregroundStyle(Theme.warning)
          }
          Button(L10n.t("finish.finish")) {
            phone.send(.finish(workoutId: workout.id))
          }
          .buttonStyle(PillButtonStyle())
          // The phone saves no workout without a set done, or one its clock times.
          .disabled(saved == 0)
          .padding(.top, 6)
          Button(L10n.t("finish.keepGoing")) { dismiss() }
            .buttonStyle(PillButtonStyle(prominent: false))
        }
      }
      .multilineTextAlignment(.center)
      .foregroundStyle(Theme.text)
    }
  }
}
