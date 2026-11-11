import SwiftUI

/// Changes a set's values with the Digital Crown: the one tapped, then, with a tap on it, the next,
/// each as the phone says the Crown turns it.
struct ValueEditor: View {
  /// The value tapped and those after it.
  let fields: [SetField]
  let crown: [SetField: CrownRange]
  /// The value a field starts from: as changed so far, else the phone's; none when it has none.
  let start: (SetField) -> Double?
  /// A value the Crown turned.
  let change: (SetField, Double) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var index = 0

  var body: some View {
    let field = fields[index]
    if let range = crown[field] {
      // A view of its own for each value, so that moving on starts the Crown afresh.
      FieldEditor(field: field, range: range, start: start(field), next: advance) {
        change(field, $0)
      }
      .id(field)
    }
  }

  /// The next value, or back to the set after the last.
  private func advance() {
    if index + 1 < fields.count {
      index += 1
    } else {
      dismiss()
    }
  }
}

private struct FieldEditor: View {
  let field: SetField
  let range: CrownRange
  let next: () -> Void
  let change: (Double) -> Void

  /// The value the Crown started from, kept however often the view is made again, and how many
  /// steps it has turned since.
  @State private var base: Double
  /// The field had no value, so the one shown is taken as soon as it shows.
  private let empty: Bool
  @State private var turned = 0.0
  @FocusState private var focused: Bool

  init(
    field: SetField, range: CrownRange, start: Double?, next: @escaping () -> Void,
    change: @escaping (Double) -> Void
  ) {
    self.field = field
    self.range = range
    self.next = next
    self.change = change
    _base = State(initialValue: min(max(start ?? range.min, range.min), range.max))
    empty = start == nil
  }

  private var value: Double { min(max(base + turned * range.step, range.min), range.max) }

  var body: some View {
    VStack(spacing: 8) {
      Text(field.label)
        .font(.rounded(13))
        .foregroundStyle(Theme.secondary)
      Button(action: next) {
        VStack(spacing: 0) {
          Text(neighbour(value + range.step)).font(.rounded(15))
            .foregroundStyle(Theme.faint)
          Text(formatted(value))
            .font(.rounded(40, .heavy))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
          Text(neighbour(value - range.step)).font(.rounded(15))
            .foregroundStyle(Theme.faint)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 18)
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Theme.accent, lineWidth: 3))
      }
      .buttonStyle(.plain)
      Text(
        field == .weightKg ? "Turn the Crown · \(formatted(range.step)) kg steps" : "Turn the Crown"
      )
      .font(.rounded(12))
      .foregroundStyle(Theme.secondary)
    }
    .foregroundStyle(Theme.text)
    .focusable()
    .focused($focused)
    .digitalCrownRotation(
      $turned, from: (range.min - base) / range.step, through: (range.max - base) / range.step,
      by: 1, sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
    )
    // Only a turn changes a value there was: opening it, or moving on from it, changes none.
    .onChange(of: turned) { change(value) }
    .onAppear {
      focused = true
      if empty { change(value) }
    }
  }

  /// The value a step away, or nothing past the ends.
  private func neighbour(_ value: Double) -> String {
    value >= range.min && value <= range.max ? formatted(value) : " "
  }
}
