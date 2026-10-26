// The look and language the user chose in the settings. They belong to the device, not the
// account, and are applied before the first screen shows.
import { Appearance } from 'react-native';

import { chooseLanguage, SUPPORTED_LANGUAGES, type Language } from '@/i18n';
import { readItem, writeItem } from '@/lib/device-storage';

export type ThemeChoice = 'system' | 'light' | 'dark';
/** A language, or the device's. */
export type LanguageChoice = Language | 'system';

const THEME_KEY = 'settings.theme';
const LANGUAGE_KEY = 'settings.language';

export function loadThemeChoice(): ThemeChoice {
  const stored = readItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function applyTheme(choice: ThemeChoice) {
  // 'unspecified' follows the device again.
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice);
}

/** Keeps the look and applies it at once. */
export function saveThemeChoice(choice: ThemeChoice) {
  writeItem(THEME_KEY, choice === 'system' ? null : choice);
  applyTheme(choice);
}

export function loadLanguageChoice(): LanguageChoice {
  const stored = readItem(LANGUAGE_KEY);
  return SUPPORTED_LANGUAGES.find((language) => language === stored) ?? 'system';
}

/** Keeps the language and switches to it at once. */
export function saveLanguageChoice(choice: LanguageChoice) {
  writeItem(LANGUAGE_KEY, choice === 'system' ? null : choice);
  chooseLanguage(choice === 'system' ? null : choice);
}

/** Applies the stored look and language, once as the app starts. */
export function applyStoredPreferences() {
  const theme = loadThemeChoice();
  if (theme !== 'system') {
    applyTheme(theme);
  }
  const language = loadLanguageChoice();
  if (language !== 'system') {
    chooseLanguage(language);
  }
}
