// Hermes has no Intl.PluralRules, which i18next needs to pick plural forms such as "1 day" and
// "3 days". The polyfill only installs itself where it is missing.
import 'intl-pluralrules';

import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { AppState } from 'react-native';

import de from './locales/de.json';
import en from './locales/en.json';
import tr from './locales/tr.json';

export const SUPPORTED_LANGUAGES = ['en', 'de', 'tr'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** Each language's name in itself, so that someone who chose a language they cannot read finds theirs. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
  tr: 'Türkçe',
};

// English is the source: every key is added there first, and the other locales must match it.
export const resources = {
  en: { translation: en },
  de: { translation: de },
  tr: { translation: tr },
} as const;

/** The first of the user's preferred languages that Benchbite supports, otherwise English. */
export function deviceLanguage(): Language {
  for (const { languageCode } of getLocales()) {
    const language = SUPPORTED_LANGUAGES.find((supported) => supported === languageCode);
    if (language) {
      return language;
    }
  }
  return 'en';
}

const i18n = createInstance();

// `initReactI18next` hands this instance to `useTranslation()`.
void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: 'en',
  // React already escapes rendered text.
  interpolation: { escapeValue: false },
});

/** The language the user chose in the settings, or null to follow the device. */
let chosen: Language | null = null;

/** Uses the given language instead of the device's, or the device's again with null. */
export function chooseLanguage(language: Language | null) {
  chosen = language;
  void i18n.changeLanguage(language ?? deviceLanguage());
}

// Android can change the device language while the app runs; iOS restarts the app instead. A
// language the user chose stays.
AppState.addEventListener('change', (state) => {
  const language = deviceLanguage();
  if (state === 'active' && chosen === null && language !== i18n.language) {
    void i18n.changeLanguage(language);
  }
});

export default i18n;
