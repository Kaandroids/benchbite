// The look and language the user chose in the settings. They belong to the device, not the
// account, and are applied before the first screen shows. This module is the only place that
// knows them: screens read them through its hooks.
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

import { chooseLanguage, SUPPORTED_LANGUAGES, type Language } from '@/i18n';
import { readItem, writeItem } from '@/lib/device-storage';

export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
/** A language, or the device's. */
export type LanguageChoice = Language | 'system';

const THEME_KEY = 'settings.theme';
const LANGUAGE_KEY = 'settings.language';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changed() {
  for (const listener of listeners) {
    listener();
  }
}

export function loadThemeChoice(): ThemeChoice {
  const stored = readItem(THEME_KEY);
  return THEME_CHOICES.find((choice) => choice === stored) ?? 'system';
}

function applyTheme(choice: ThemeChoice) {
  // 'unspecified' follows the device again.
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice);
}

/** Keeps the look and applies it at once. */
export function setThemeChoice(choice: ThemeChoice) {
  writeItem(THEME_KEY, choice === 'system' ? null : choice);
  applyTheme(choice);
  changed();
}

/** The look chosen, kept up to date. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, loadThemeChoice);
}

export function loadLanguageChoice(): LanguageChoice {
  const stored = readItem(LANGUAGE_KEY);
  return SUPPORTED_LANGUAGES.find((language) => language === stored) ?? 'system';
}

/** Keeps the language and switches to it at once. */
export function setLanguageChoice(choice: LanguageChoice) {
  writeItem(LANGUAGE_KEY, choice === 'system' ? null : choice);
  chooseLanguage(choice === 'system' ? null : choice);
  changed();
}

/** The language chosen, kept up to date. */
export function useLanguageChoice(): LanguageChoice {
  return useSyncExternalStore(subscribe, loadLanguageChoice);
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
