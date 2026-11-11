import SwiftUI

/// The colours of the approved watch design: the app's dark theme on a black face.
enum Theme {
  static let text = Color(hex: 0xF2F3F5)
  static let secondary = Color(hex: 0x9A9DA5)
  /// The neighbours of the value the Crown turns.
  static let faint = Color(hex: 0x5C5F66)
  static let tile = Color(hex: 0x1B1C1F)
  static let control = Color(hex: 0x2A2C31)
  static let accent = Color(hex: 0xFF7F26)
  /// Text on the accent.
  static let onAccent = Color(hex: 0x1C0C00)
  static let warning = Color(hex: 0xF5B54A)
}

extension Color {
  init(hex: UInt32) {
    self.init(
      red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255)
  }
}

/// A full-width button in the accent, or in the control colour for a lesser one.
struct PillButtonStyle: ButtonStyle {
  var prominent = true
  var height: CGFloat = 44
  var fontSize: CGFloat = 16

  func makeBody(configuration: Configuration) -> some View {
    PillLabel(configuration: configuration, style: self)
  }

  private struct PillLabel: View {
    let configuration: ButtonStyleConfiguration
    let style: PillButtonStyle
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
      let prominent = style.prominent
      configuration.label
        .font(.system(size: style.fontSize, weight: .heavy, design: .rounded))
        .frame(maxWidth: .infinity, minHeight: style.height)
        .foregroundStyle(prominent ? Theme.onAccent : Theme.text)
        .background(prominent ? Theme.accent : Theme.control, in: Capsule())
        .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.4)
    }
  }
}

/// A value as the watch shows it: a weight to its quarter kilogram, without trailing zeros.
func formatted(_ value: Double?) -> String {
  guard let value else { return "—" }
  return value.formatted(.number.precision(.fractionLength(0...2)))
}
