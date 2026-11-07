// The website's pages that the Edge Functions send people to (ADR 0094).

/** The site's languages, as `LOCALES` in website/src/i18n/index.ts: a new one goes in both. */
export const SITE_LOCALES = ['en', 'de', 'tr'] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];

/** The site's language a form named, English for anything else. */
export function siteLocale(value: unknown): SiteLocale {
  return SITE_LOCALES.find((locale) => locale === value) ?? 'en';
}

/** A page of the site in a language: English has no prefix, as on the site. */
export function sitePage(siteUrl: string, locale: SiteLocale, path: string): string {
  return `${siteUrl}/${locale === 'en' ? '' : `${locale}/`}${path}`;
}

/** The site's address: `SITE_URL`, as locally, or the live site. */
export function siteUrl(env: (name: string) => string | undefined = Deno.env.get): string {
  return (env('SITE_URL') ?? 'https://www.benchbite.com').replace(/\/$/, '');
}

/** Sends the browser on to a page after a form, as a GET. */
export function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}
