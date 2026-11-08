// The email with the code to delete an account from the app (#438, ADR 0095), in the app's
// language. Laid out as the Auth emails in supabase/templates/, which point here: change them
// together. Its colours are the app's: background, surface, text and textMuted.
import type { Email } from '../_shared/email.ts';
import type { SiteLocale } from '../_shared/site.ts';

const COPY = {
  en: {
    subject: (code: string) => `${code} is your code to delete your Benchbite account`,
    title: 'Delete your account?',
    ask: 'Enter this code in the app to delete your account for good:',
    note: "It works for 15 minutes. Didn't ask for this? Someone may have your phone: change your password in the app, and your account stays as it is.",
  },
  de: {
    subject: (code: string) => `${code} ist dein Code zum Löschen deines Benchbite-Kontos`,
    title: 'Dein Konto löschen?',
    ask: 'Gib diesen Code in der App ein, um dein Konto endgültig zu löschen:',
    note: 'Er gilt 15 Minuten. Warst du das nicht? Vielleicht hat jemand dein Handy: Ändere dein Passwort in der App, dann bleibt dein Konto, wie es ist.',
  },
  tr: {
    subject: (code: string) => `${code}, Benchbite hesabını silme kodun`,
    title: 'Hesabın silinsin mi?',
    ask: 'Hesabını kalıcı olarak silmek için bu kodu uygulamaya gir:',
    note: 'Kod 15 dakika geçerlidir. Bunu sen istemediysen telefonun başkasının elinde olabilir: uygulamada şifreni değiştir, hesabın olduğu gibi kalır.',
  },
} satisfies Record<SiteLocale, Record<string, unknown>>;

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function deletionCodeEmail(locale: SiteLocale, to: string, code: string): Email {
  const copy = COPY[locale];
  const html = `<!doctype html>
<html lang="${locale}">
  <body style="margin: 0; padding: 24px; background: #f6f6f8; font-family: Helvetica, Arial, sans-serif; color: #16171a">
    <div style="max-width: 480px; margin: 0 auto; padding: 32px; border-radius: 20px; background: #ffffff">
      <p style="margin: 0 0 24px; font-size: 22px; font-weight: 800">benchbite</p>
      <h1 style="margin: 0 0 12px; font-size: 24px">${escape(copy.title)}</h1>
      <p style="margin: 0 0 16px">${escape(copy.ask)}</p>
      <p style="margin: 0 0 16px; padding: 14px 24px; display: inline-block; border-radius: 14px; background: #f6f6f8; font-size: 32px; font-weight: 800; letter-spacing: 4px">${code}</p>
      <p style="margin: 0; color: #676a72">${escape(copy.note)}</p>
    </div>
  </body>
</html>`;
  const text = [copy.title, copy.ask, code, copy.note].join('\n\n');
  return { to, subject: copy.subject(code), html, text };
}
