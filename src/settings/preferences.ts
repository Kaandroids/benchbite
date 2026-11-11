// The look and language the user chose in the settings. They belong to the device, not the
// account, and are applied before the first screen shows. This module is the only place that
// knows them: screens read them through its hooks.
import { Appearance } from 'react-native';

import { chooseLanguage, SUPPORTED_LANGUAGES, type Language } from '@/i18n';
import { createDeviceChoice } from '@/lib/device-choice';

export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
/** A language, or the device's. */
export type LanguageChoice = Language | 'system';

const theme = createDeviceChoice('settings.theme', THEME_CHOICES, 'system');
const language = createDeviceChoice<LanguageChoice>(
  'settings.language',
  [...SUPPORTED_LANGUAGES, 'system'],
  'system',
);

export const loadThemeChoice = theme.load;

function applyTheme(choice: ThemeChoice) {
  // 'unspecified' follows the device again.
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice);
}

/** Keeps the look and applies it at once. */
export function setThemeChoice(choice: ThemeChoice) {
  applyTheme(choice);
  theme.set(choice);
}

/** The look chosen, kept up to date. */
export const useThemeChoice = theme.useChoice;

export const loadLanguageChoice = language.load;

/** Keeps the language and switches to it at once. */
export function setLanguageChoice(choice: LanguageChoice) {
  chooseLanguage(choice === 'system' ? null : choice);
  language.set(choice);
}

/** The language chosen, kept up to date. */
export const useLanguageChoice = language.useChoice;

/** Applies the stored look and language, once as the app starts. */
export function applyStoredPreferences() {
  const look = loadThemeChoice();
  if (look !== 'system') {
    applyTheme(look);
  }
  const chosen = loadLanguageChoice();
  if (chosen !== 'system') {
    chooseLanguage(chosen);
  }
}
