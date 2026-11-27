// The layout of every account email (ADR 0175): the Edge Functions' (ADR 0094, ADR 0095) and the
// Auth templates in supabase/templates/, which auth_templates.ts writes from it. Tables and inline
// styles, as Outlook and Gmail need; the dark theme in a <style> block, for the clients that let an
// email choose (Apple Mail, iOS). The colours are the app's tokens in src/theme/colors.ts.
import type { Email } from './email.ts';
import { LIVE_SITE, type SiteLocale, sitePage } from './site.ts';

/** Text made safe to put in HTML. */
export const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The emails' images and font are on the live site, also when the email is sent locally. */
const IMAGES = `${LIVE_SITE}/images/email`;
const FONTS = `${LIVE_SITE}/fonts/email`;

/** The app's tokens of the same names, light and dark. */
const LIGHT = {
  background: '#F6F6F8',
  surface: '#FFFFFF',
  text: '#16171A',
  textMuted: '#676A72',
  border: '#E3E4E8',
  track: '#ECEDF0',
  primaryText: '#C2410C',
  primaryButton: '#F25A00',
  primaryButtonLedge: '#C24800',
  onPrimary: '#FFFFFF',
  primaryWash: 'rgba(255, 106, 16, 0.1)',
};
const DARK: typeof LIGHT = {
  background: '#111214',
  surface: '#1B1C1F',
  text: '#F2F3F5',
  textMuted: '#9A9DA5',
  border: '#2B2D31',
  track: '#25272B',
  primaryText: '#FF7F26',
  primaryButton: '#FF7F26',
  primaryButtonLedge: '#D45A00',
  onPrimary: '#1C0C00',
  primaryWash: 'rgba(255, 127, 38, 0.1)',
};

/**
 * Nunito from our own site, where the client loads web fonts, as the website does: from Google
 * Fonts, opening an email would tell Google who read it. Latin and Latin Extended, for Turkish.
 */
const FONT_FACES = `@font-face { font-family: Nunito; font-weight: 400 900; font-display: swap; src: url(${FONTS}/nunito-latin-wght-normal.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: Nunito; font-weight: 400 900; font-display: swap; src: url(${FONTS}/nunito-latin-ext-wght-normal.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }`;

/** Nunito where the client loads it, else the system's own sans serif. */
const FONT = "Nunito, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const DARK_STYLE = `@media (prefers-color-scheme: dark) {
        .bb-page { background: ${DARK.background} !important; }
        .bb-card { background: ${DARK.surface} !important; color: ${DARK.text} !important; }
        .bb-muted, .bb-muted a { color: ${DARK.textMuted} !important; }
        .bb-code { background: ${DARK.track} !important; color: ${DARK.text} !important; }
        .bb-button { background: ${DARK.primaryButton} !important; border-bottom-color: ${DARK.primaryButtonLedge} !important; }
        .bb-button a { color: ${DARK.onPrimary} !important; }
        .bb-tick { background: ${DARK.primaryWash} !important; color: ${DARK.primaryText} !important; }
        .bb-line { border-top-color: ${DARK.border} !important; }
      }`;

/** The line under every email, in each language. */
const FOOTER = {
  en: {
    why: 'You get this email because of your Benchbite account.',
    imprint: 'Imprint',
    privacy: 'Privacy',
  },
  de: {
    why: 'Du bekommst diese E-Mail wegen deines Benchbite-Kontos.',
    imprint: 'Impressum',
    privacy: 'Datenschutz',
  },
  tr: {
    why: 'Bu e-postayı Benchbite hesabın nedeniyle alıyorsun.',
    imprint: 'Künye',
    privacy: 'Gizlilik',
  },
} satisfies Record<SiteLocale, Record<string, string>>;

/** A paragraph of muted text, as the notes at the end. */
export const note = (text: string) =>
  `<p class="bb-muted" style="margin: 0 0 10px; font-size: 14px; color: ${LIGHT.textMuted}">${escape(text)}</p>`;

/** A paragraph of text. */
export const paragraph = (text: string) => `<p style="margin: 0 0 16px">${escape(text)}</p>`;

/** A code to type in the app, large and spaced to read digit by digit. */
export const code = (value: string) =>
  `<p class="bb-code" style="margin: 4px 0 18px; padding: 16px 0 16px 10px; border-radius: 16px; background: ${LIGHT.track}; text-align: center; font-size: 36px; line-height: 1.2; font-weight: 900; letter-spacing: 10px">${escape(value)}</p>`;

/** A button that opens a link, in the app's orange with the ledge its buttons press onto. */
export const button = (link: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 4px 0 18px"><tr><td class="bb-button" style="border-radius: 14px; background: ${LIGHT.primaryButton}; border-bottom: 4px solid ${LIGHT.primaryButtonLedge}"><a href="${escape(link)}" style="display: inline-block; padding: 14px 26px 12px; color: ${LIGHT.onPrimary}; font-family: ${FONT}; font-size: 16px; font-weight: 800; text-decoration: none">${escape(label)}</a></td></tr></table>`;

/** Points in a list, each behind a tick. */
export const points = (items: string[]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 16px">${items
    .map(
      (item) =>
        `<tr><td valign="top" style="padding: 0 10px 10px 0"><div class="bb-tick" style="width: 22px; height: 22px; border-radius: 11px; background: ${LIGHT.primaryWash}; color: ${LIGHT.primaryText}; text-align: center; font-size: 13px; line-height: 22px; font-weight: 900">&#10003;</div></td><td valign="top" style="padding: 0 0 10px">${escape(item)}</td></tr>`,
    )
    .join('')}</table>`;

/** A thin line, before the notes of a longer email. */
export const divider = () =>
  `<div class="bb-line" style="margin: 6px 0 16px; border-top: 1px solid ${LIGHT.border}"></div>`;

export type LayoutOptions = {
  /** Bite greets beside the title: only for the welcome, so a code or a deletion stays plain. */
  bite?: boolean;
};

const heading = (title: string, margin = '0 0 10px') =>
  `<h1 style="margin: ${margin}; font-size: 24px; line-height: 1.25; font-weight: 800">${escape(title)}</h1>`;

const greeting = (title: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 14px"><tr><td style="padding-right: 14px"><img src="${IMAGES}/bite.png" width="64" height="64" alt="" style="display: block; border: 0"></td><td>${heading(title, '0')}</td></tr></table>`;

/** The page around an email's parts, which are HTML already made safe. */
export function accountEmailHtml(
  locale: SiteLocale,
  title: string,
  parts: string[],
  { bite = false }: LayoutOptions = {},
): string {
  const footer = FOOTER[locale];
  const link = (path: string, label: string) =>
    `<a href="${sitePage(LIVE_SITE, locale, path)}" style="color: ${LIGHT.textMuted}">${escape(label)}</a>`;
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${escape(title)}</title>
    <style>
      ${FONT_FACES}
      ${DARK_STYLE}
    </style>
  </head>
  <body class="bb-page" style="margin: 0; padding: 0; background: ${LIGHT.background}">
    <table role="presentation" class="bb-page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: ${LIGHT.background}">
      <tr>
        <td align="center" style="padding: 24px 12px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 480px">
            <tr>
              <td class="bb-card" style="padding: 28px; border-radius: 20px; background: ${LIGHT.surface}; color: ${LIGHT.text}; font-family: ${FONT}; font-size: 16px; line-height: 1.5; text-align: left">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 26px"><tr><td><img src="${IMAGES}/icon.png" width="34" height="34" alt="" style="display: block; border: 0"></td><td style="padding-left: 10px; font-size: 21px; font-weight: 900">benchbite</td></tr></table>
                ${bite ? greeting(title) : heading(title)}
                ${parts.join('\n                ')}
              </td>
            </tr>
            <tr>
              <td class="bb-muted" style="padding: 16px 28px 0; color: ${LIGHT.textMuted}; font-family: ${FONT}; font-size: 12px; line-height: 1.55; text-align: center">
                ${escape(footer.why)}<br>
                Benchbite · support@benchbite.com · ${link('imprint', footer.imprint)} · ${link('privacy', footer.privacy)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** What an email with a link says, in one language. */
export type LinkEmailCopy = {
  subject: string;
  title: string;
  /** Who asked for what, and what to do. */
  ask: string;
  button: string;
  note: string;
  ignore: string;
};

/** An email with a link from the website's forms (ADR 0094, ADR 0146), as HTML and as text. */
export function linkEmail(
  locale: SiteLocale,
  copy: LinkEmailCopy,
  to: string,
  link: string,
): Email {
  const html = accountEmailHtml(locale, copy.title, [
    paragraph(copy.ask),
    button(link, copy.button),
    note(copy.note),
    note(copy.ignore),
  ]);
  const text = [copy.title, copy.ask, link, copy.note, copy.ignore].join('\n\n');
  return { to, subject: copy.subject, html, text };
}
