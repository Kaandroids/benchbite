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

// Android can change the device language while the app runs; iOS restarts the app instead.
AppState.addEventListener('change', (state) => {
  const language = deviceLanguage();
  if (state === 'active' && language !== i18n.language) {
    void i18n.changeLanguage(language);
  }
});

export default i18n;
