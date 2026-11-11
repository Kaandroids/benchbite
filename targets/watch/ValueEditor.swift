import SwiftUI

/// Changes a set's values with the Digital Crown: the one tapped, then, with a tap on it, the next.
/// A weight turns by the exercise's step, the reps by one.
struct ValueEditor: View {
  /// The value tapped and those after it.
  let fields: [SetField]
  let exercise: WatchExercise
  /// The values changed so far; a value is changed once the Crown turns it.
  @Binding var values: [SetField: Double]
  let set: WatchSet

  @Environment(\.dismiss) private var dismiss
  @State private var index = 0
  /// The value the Crown started from, and how many steps it has turned since.
  @State private var base: Double?
  @State private var turned = 0.0

  private var field: SetField { fields[index] }
  private var step: Double { field == .weightKg ? exercise.weightStepKg : 1 }
  /// None only for a weight added to the body; the reps are always needed.
  private var range: ClosedRange<Double> {
    field == .weightKg ? (exercise.addedWeight ? 0 : step)...999.75 : 1...999
  }
  private var start: Double { values[field] ?? set.value(field) ?? range.lowerBound }
  private var value: Double { clamped((base ?? start) + turned * step) }

  var body: some View {
    let base = base ?? start
    VStack(spacing: 8) {
      Text(field == .weightKg ? "WEIGHT" : "REPS")
        .font(.system(size: 13, weight: .bold, design: .rounded))
        .foregroundStyle(Theme.secondary)
      Button(action: advance) {
        VStack(spacing: 0) {
          Text(neighbour(value + step)).font(.system(size: 15, weight: .bold, design: .rounded))
            .foregroundStyle(Theme.faint)
          Text(formatted(value))
            .font(.system(size: 40, weight: .heavy, design: .rounded))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
          Text(neighbour(value - step)).font(.system(size: 15, weight: .bold, design: .rounded))
            .foregroundStyle(Theme.faint)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 18)
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Theme.accent, lineWidth: 3))
      }
      .buttonStyle(.plain)
      Text(field == .weightKg ? "Turn the Crown · \(formatted(step)) kg steps" : "Turn the Crown")
        .font(.system(size: 12, weight: .bold, design: .rounded))
        .foregroundStyle(Theme.secondary)
    }
    .foregroundStyle(Theme.text)
    .focusable()
    .digitalCrownRotation(
      $turned, from: (range.lowerBound - base) / step, through: (range.upperBound - base) / step,
      by: 1, sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
    )
    .onChange(of: turned) {
      self.base = base
      values[field] = value
    }
  }

  private func clamped(_ value: Double) -> Double {
    min(max(value, range.lowerBound), range.upperBound)
  }

  /// The value a step away, or nothing past the ends.
  private func neighbour(_ value: Double) -> String {
    range.contains(value) ? formatted(value) : " "
  }

  /// The next value, or back to the set after the last.
  private func advance() {
    guard index + 1 < fields.count else {
      dismiss()
      return
    }
    index += 1
    base = nil
    turned = 0
  }
}
