// The website's pages that the Edge Functions send people to (ADR 0094).
import { readBody } from './request.ts';

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

/** A form's fields, read within a small limit; none for a body that is too large or not a form. */
export async function readForm(req: Request, max = 2048): Promise<URLSearchParams> {
  return new URLSearchParams((await readBody(req, max)) ?? '');
}

/** The SHA-256 of a text, as Postgres takes a bytea: `\x` and hex. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return `\\x${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
