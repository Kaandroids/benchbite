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
          Text("Saving on your iPhone").font(.rounded(17, .heavy))
          // Its app saves it only while it runs, which the watch cannot tell.
          Text("If it takes long, open Benchbite on your iPhone.")
            .font(.rounded(13))
            .foregroundStyle(Theme.secondary)
        } else {
          Text("Finish workout?")
            .font(.rounded(18, .heavy))
            .padding(.top, 10)
          Text(saved == 0 ? "No sets done yet" : "\(saved) of \(workout.setsDone.count) sets done")
            .font(.rounded(14))
            .foregroundStyle(Theme.secondary)
          if phone.unsaved == workout.id {
            Text("Your iPhone could not save it. Try again, or finish it there.")
              .font(.rounded(12))
              .foregroundStyle(Theme.warning)
          }
          Button("Finish") {
            phone.send(.finish(workoutId: workout.id))
          }
          .buttonStyle(PillButtonStyle())
          // The phone saves no workout without a set done, or one its clock times.
          .disabled(saved == 0)
          .padding(.top, 6)
          Button("Keep going") { dismiss() }
            .buttonStyle(PillButtonStyle(prominent: false))
        }
      }
      .multilineTextAlignment(.center)
      .foregroundStyle(Theme.text)
    }
  }
}
