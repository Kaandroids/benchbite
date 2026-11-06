import { de } from './de';
import { en, type Messages } from './en';
import { tr } from './tr';

export const LOCALES = ['en', 'de', 'tr'] as const;
export type Locale = (typeof LOCALES)[number];

/** English lives at the root, so the links in the app (`/privacy`) stay short. */
const DEFAULT_LOCALE: Locale = 'en';

const MESSAGES: Record<Locale, Messages> = { en, de, tr };

export const messagesFor = (locale: Locale) => MESSAGES[locale];

/** A page's address in a language; `page` is relative to the root, such as `privacy`. */
export const localePath = (locale: Locale, page = '') => {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  return `${prefix}/${page}`;
};

/** The paths of a page under `[...locale]`, one per language. */
export const localeStaticPaths = () =>
  LOCALES.map((locale) => ({
    params: { locale: locale === DEFAULT_LOCALE ? undefined : locale },
    props: { locale },
  }));
