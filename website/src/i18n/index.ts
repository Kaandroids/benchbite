import { de } from './de';
import { en, type Messages } from './en';
import { tr } from './tr';

/**
 * A new language also needs its rule in `public/_redirects`, and its place in the Edge Functions'
 * `SITE_LOCALES` (supabase/functions/_shared/site.ts) and their email copy.
 */
export const LOCALES = ['en', 'de', 'tr'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * The pages below the landing page, as they appear in addresses. The Edge Functions redirect to
 * the `delete-account/*` ones (supabase/functions/request-account-deletion and
 * confirm-account-deletion): a new name goes there too.
 */
export type Page =
  | 'privacy'
  | 'terms'
  | 'imprint'
  | 'support'
  | 'delete-account'
  | 'delete-account/sent'
  | 'delete-account/done'
  | 'delete-account/expired';

/** English lives at the root, so the links in the app (`/privacy`) stay short. */
const DEFAULT_LOCALE: Locale = 'en';

const MESSAGES: Record<Locale, Messages> = { en, de, tr };

export const messagesFor = (locale: Locale) => MESSAGES[locale];

/** A page's address in a language; without a page, the landing page's. */
export const localePath = (locale: Locale, page: Page | '' = '') => {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  return `${prefix}/${page}`;
};

/** The paths of a page under `[...locale]`, one per language. */
export const localeStaticPaths = () =>
  LOCALES.map((locale) => ({
    params: { locale: locale === DEFAULT_LOCALE ? undefined : locale },
    props: { locale },
  }));
