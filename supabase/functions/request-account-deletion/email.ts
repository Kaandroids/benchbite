// The email with the link to delete an account (ADR 0094), in the language of the page it was asked
// from. Laid out as the Auth emails in supabase/templates/.
import type { Email } from '../_shared/email.ts';
import type { SiteLocale } from '../_shared/site.ts';

const COPY = {
  en: {
    subject: 'Delete your Benchbite account',
    title: 'Delete your account?',
    ask: 'Someone asked to delete the Benchbite account of this email address. If it was you, open the page and confirm there.',
    button: 'Open the page',
    note: 'The link works once, for 30 minutes. Opening it deletes nothing; the page asks first.',
    ignore: "Didn't ask for this? Ignore this email, and your account stays as it is.",
  },
  de: {
    subject: 'Lösche dein Benchbite-Konto',
    title: 'Dein Konto löschen?',
    ask: 'Jemand möchte das Benchbite-Konto dieser E-Mail-Adresse löschen. Warst du das, öffne die Seite und bestätige es dort.',
    button: 'Seite öffnen',
    note: 'Der Link funktioniert einmal, 30 Minuten lang. Das Öffnen löscht nichts; die Seite fragt erst nach.',
    ignore: 'Warst du das nicht? Ignoriere diese E-Mail, dann bleibt dein Konto, wie es ist.',
  },
  tr: {
    subject: 'Benchbite hesabını sil',
    title: 'Hesabın silinsin mi?',
    ask: 'Biri bu e-posta adresinin Benchbite hesabını silmek istedi. Sen istediysen sayfayı aç ve orada onayla.',
    button: 'Sayfayı aç',
    note: 'Bağlantı bir kez, 30 dakika boyunca çalışır. Açmak hiçbir şeyi silmez; sayfa önce sorar.',
    ignore: 'Bunu sen istemediysen bu e-postayı yok say; hesabın olduğu gibi kalır.',
  },
} satisfies Record<SiteLocale, Record<string, string>>;

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function deletionEmail(locale: SiteLocale, to: string, link: string): Email {
  const copy = COPY[locale];
  const html = `<!doctype html>
<html lang="${locale}">
  <body style="margin: 0; padding: 24px; background: #f6f6f8; font-family: Helvetica, Arial, sans-serif; color: #16171a">
    <div style="max-width: 480px; margin: 0 auto; padding: 32px; border-radius: 20px; background: #ffffff">
      <p style="margin: 0 0 24px; font-size: 22px; font-weight: 800">benchbite</p>
      <h1 style="margin: 0 0 12px; font-size: 24px">${escape(copy.title)}</h1>
      <p style="margin: 0 0 20px">${escape(copy.ask)}</p>
      <p style="margin: 0 0 20px">
        <a href="${escape(link)}" style="display: inline-block; padding: 14px 24px; border-radius: 14px; background: #f25a00; color: #ffffff; font-weight: 800; text-decoration: none">${escape(copy.button)}</a>
      </p>
      <p style="margin: 0 0 12px; color: #676a72">${escape(copy.note)}</p>
      <p style="margin: 0; color: #676a72">${escape(copy.ignore)}</p>
    </div>
  </body>
</html>`;
  const text = [copy.title, copy.ask, link, copy.note, copy.ignore].join('\n\n');
  return { to, subject: copy.subject, html, text };
}
