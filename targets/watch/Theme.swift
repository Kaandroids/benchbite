import SwiftUI

/// The colours of the approved watch design: the app's dark theme (src/theme/colors.ts) on a
/// black face, each named after its token there.
enum Theme {
  /// text
  static let text = Color(hex: 0xF2F3F5)
  /// textMuted
  static let secondary = Color(hex: 0x9A9DA5)
  /// placeholder: the neighbours of the value the Crown turns.
  static let faint = Color(hex: 0x5C5F66)
  /// surface
  static let tile = Color(hex: 0x1B1C1F)
  /// iconBackground
  static let control = Color(hex: 0x2A2C31)
  /// primary
  static let accent = Color(hex: 0xFF7F26)
  /// onPrimary
  static let onAccent = Color(hex: 0x1C0C00)
  /// success
  static let success = Color(hex: 0x4ADE80)
  /// warning
  static let warning = Color(hex: 0xFBBF24)
  /// warningBackground
  static let warningBackground = Color(hex: 0x2E2410)
  /// snack: the heart rate, as the app's heart rate chart shows it.
  static let heart = Color(hex: 0xF28AB7)
}

extension Font {
  /// The watch's type: the system's rounded face, close to the app's Nunito.
  static func rounded(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
    .system(size: size, weight: weight, design: .rounded)
  }
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
        .font(.rounded(style.fontSize, .heavy))
        .frame(maxWidth: .infinity, minHeight: style.height)
        .foregroundStyle(prominent ? Theme.onAccent : Theme.text)
        .background(prominent ? Theme.accent : Theme.control, in: Capsule())
        .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.4)
    }
  }
}
