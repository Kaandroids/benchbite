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
  /// Observed so that its texts follow the language (ADR 0123).
  @EnvironmentObject private var phone: PhoneLink
  let field: SetField
  let range: CrownRange
  let next: () -> Void
  let change: (Double) -> Void

  /// The value shown, from the one it started from, kept however often the view is made again.
  @State private var value: Double
  /// The field had no value, so the one shown is taken as soon as it shows.
  private let empty: Bool
  /// The Crown's turn in detents, of which only the change counts, and when it last turned.
  @State private var turned = 0.0
  /// The last whole detent the value was turned to, as the Crown may report a turn in between.
  @State private var detent = 0.0
  @State private var lastTurn: Date?
  @FocusState private var focused: Bool

  /// Detents closer than this are a fast turn, which goes by the coarse step (ADR 0125).
  private static let fastWithin: TimeInterval = 0.09

  init(
    field: SetField, range: CrownRange, start: Double?, next: @escaping () -> Void,
    change: @escaping (Double) -> Void
  ) {
    self.field = field
    self.range = range
    self.next = next
    self.change = change
    _value = State(initialValue: min(max(start ?? range.min, range.min), range.max))
    empty = start == nil
  }

  /// The step a value is shown a step away by: the fine one where there is one.
  private var shownStep: Double { range.fine ?? range.step }

  var body: some View {
    VStack(spacing: 8) {
      Text(field.label)
        .font(.rounded(13))
        .foregroundStyle(Theme.secondary)
      Button(action: next) {
        VStack(spacing: 0) {
          Text(neighbour(value + shownStep)).font(.rounded(15))
            .foregroundStyle(Theme.faint)
          Text(formatted(value))
            .font(.rounded(40, .heavy))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
          Text(neighbour(value - shownStep)).font(.rounded(15))
            .foregroundStyle(Theme.faint)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 18)
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Theme.accent, lineWidth: 3))
      }
      .buttonStyle(.plain)
      Text(hint)
        .font(.rounded(12))
        .foregroundStyle(Theme.secondary)
        .multilineTextAlignment(.center)
    }
    .foregroundStyle(Theme.text)
    .focusable()
    .focused($focused)
    // Unbounded detents: the value keeps to its range itself, by steps that differ with speed.
    .digitalCrownRotation(
      $turned, from: -1_000_000, through: 1_000_000, by: 1, sensitivity: .medium,
      isContinuous: false, isHapticFeedbackEnabled: true
    )
    // Only a turn changes a value there was: opening it, or moving on from it, changes none.
    // Whole detents only, timed from one to the next, whatever the Crown reports in between.
    .onChange(of: turned) {
      let whole = turned.rounded()
      guard whole != detent else { return }
      let detents = whole - detent
      detent = whole
      let now = Date()
      let fast = lastTurn.map { now.timeIntervalSince($0) < Self.fastWithin } ?? false
      lastTurn = now
      let previous = value
      value = Self.turn(value, by: detents, fast: fast, range: range)
      if value != previous { change(value) }
    }
    .onAppear {
      focused = true
      if empty { change(value) }
    }
  }

  /// "Turn the Crown", with the steps it turns by.
  private var hint: String {
    let unit = field.unit.lowercased()
    if let fine = range.fine {
      return L10n.t(
        "turnCrownSpeed",
        ["fine": formatted(fine), "step": formatted(range.step), "unit": unit])
    }
    return range.step == 1
      ? L10n.t("turnCrown")
      : L10n.t("turnCrownSteps", ["step": formatted(range.step), "unit": unit])
  }

  /// A value turned by `detents`: by the fine step turned slowly, and turned fast by the coarse one,
  /// onto its grid, so that 61.5 goes on to 62.5 and 65; without a fine step always by the coarse
  /// one from where it is, so that 81 turns to 83.5. Within the range, to the hundredth.
  static func turn(_ value: Double, by detents: Double, fast: Bool, range: CrownRange) -> Double {
    var next = value
    let steps = Int(detents.magnitude.rounded())
    let up = detents > 0
    for _ in 0..<steps {
      guard let fine = range.fine else {
        // A single step, from wherever the value is.
        next += up ? range.step : -range.step
        continue
      }
      if fast {
        // Onto the coarse grid, a whole step on from where it is.
        let place = next / range.step
        next = (up ? (place + 1e-9).rounded(.down) + 1 : (place - 1e-9).rounded(.up) - 1)
          * range.step
      } else {
        next += up ? fine : -fine
      }
    }
    return (min(max(next, range.min), range.max) * 100).rounded() / 100
  }

  /// The value a step away, or nothing past the ends.
  private func neighbour(_ value: Double) -> String {
    value >= range.min && value <= range.max ? formatted(value) : " "
  }
}
