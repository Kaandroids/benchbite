import Foundation

/// The watch's texts in the language chosen in Benchbite, which the phone sends with its state
/// (ADR 0123): kept from the last state, so that the app opens in it, and English until the phone
/// has said, or where a language has no text.
enum L10n {
  private static let languageKey = "watch.language"

  static var language = UserDefaults.standard.string(forKey: languageKey) ?? "en" {
    didSet { UserDefaults.standard.set(language, forKey: languageKey) }
  }

  /// The text of `key` (src/i18n/watch), with its {{placeholders}} filled in.
  static func t(_ key: String, _ values: [String: CustomStringConvertible] = [:]) -> String {
    let text = watchStrings[language]?[key] ?? watchStrings["en"]?[key] ?? key
    return values.reduce(text) {
      $0.replacingOccurrences(of: "{{\($1.key)}}", with: $1.value.description)
    }
  }

  /// The text of `key` for `count`, from its `_one` or `_other` form, as i18next picks them for the
  /// app's languages.
  static func t(
    _ key: String, count: Int, _ values: [String: CustomStringConvertible] = [:]
  ) -> String {
    t("\(key)_\(count == 1 ? "one" : "other")", values.merging(["count": count]) { value, _ in value })
  }
}
