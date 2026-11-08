// The email with the code to delete an account from the app (#438, ADR 0095), in the app's
// language, in the layout of _shared/account_email.ts. The 15 minutes it names are those of
// new_account_deletion_code in the migration: change them together.
import { accountEmailHtml, escape, note, paragraph } from '../_shared/account_email.ts';
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

export function deletionCodeEmail(locale: SiteLocale, to: string, code: string): Email {
  const copy = COPY[locale];
  const codeBlock = `<p style="margin: 0 0 16px; padding: 14px 24px; display: inline-block; border-radius: 14px; background: #f6f6f8; font-size: 32px; font-weight: 800; letter-spacing: 4px">${escape(code)}</p>`;
  const html = accountEmailHtml(locale, copy.title, [
    paragraph(copy.ask),
    codeBlock,
    note(copy.note),
  ]);
  const text = [copy.title, copy.ask, code, copy.note].join('\n\n');
  return { to, subject: copy.subject(code), html, text };
}
