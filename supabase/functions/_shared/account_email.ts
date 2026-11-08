// The layout of the account emails the Edge Functions send (ADR 0094, ADR 0095), as the Auth emails
// in supabase/templates/, which point here: change them together. Its colours are the app's:
// background, surface, text, textMuted and primaryButton.
import type { SiteLocale } from './site.ts';

/** Text made safe to put in HTML. */
export const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A paragraph of muted text, as the notes at the end. */
export const note = (text: string) =>
  `<p style="margin: 0 0 12px; color: #676a72">${escape(text)}</p>`;

/** A paragraph of text. */
export const paragraph = (text: string) => `<p style="margin: 0 0 16px">${escape(text)}</p>`;

/** The page around an email's parts, which are HTML already made safe. */
export function accountEmailHtml(locale: SiteLocale, title: string, parts: string[]): string {
  return `<!doctype html>
<html lang="${locale}">
  <body style="margin: 0; padding: 24px; background: #f6f6f8; font-family: Helvetica, Arial, sans-serif; color: #16171a">
    <div style="max-width: 480px; margin: 0 auto; padding: 32px; border-radius: 20px; background: #ffffff">
      <p style="margin: 0 0 24px; font-size: 22px; font-weight: 800">benchbite</p>
      <h1 style="margin: 0 0 12px; font-size: 24px">${escape(title)}</h1>
      ${parts.join('\n      ')}
    </div>
  </body>
</html>`;
}
