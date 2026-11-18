// The email with the link to withdraw a consent (ADR 0146), in the language of the page it was
// asked from, in the layout of _shared/account_email.ts.
import { accountEmailHtml, escape, note, paragraph } from '../_shared/account_email.ts';
import type { Consent } from '../_shared/consents.ts';
import type { Email } from '../_shared/email.ts';
import type { SiteLocale } from '../_shared/site.ts';

const COPY = {
  en: {
    subject: 'Withdraw a consent on Benchbite',
    title: 'Withdraw your consent?',
    ask: {
      health:
        'Someone asked to withdraw the consent to health data of the Benchbite account of this email address. If it was you, open the page and confirm there.',
      ai: 'Someone asked to withdraw the consent to the AI features of the Benchbite account of this email address. If it was you, open the page and confirm there.',
    },
    button: 'Open the page',
    note: 'The link works once, for 30 minutes. Opening it changes nothing; the page asks first.',
    ignore: "Didn't ask for this? Ignore this email, and your consent stays as it is.",
  },
  de: {
    subject: 'Eine Einwilligung bei Benchbite widerrufen',
    title: 'Deine Einwilligung widerrufen?',
    ask: {
      health:
        'Jemand möchte die Einwilligung in Gesundheitsdaten für das Benchbite-Konto dieser E-Mail-Adresse widerrufen. Warst du das, öffne die Seite und bestätige es dort.',
      ai: 'Jemand möchte die Einwilligung in die KI-Funktionen für das Benchbite-Konto dieser E-Mail-Adresse widerrufen. Warst du das, öffne die Seite und bestätige es dort.',
    },
    button: 'Seite öffnen',
    note: 'Der Link funktioniert einmal, 30 Minuten lang. Das Öffnen ändert nichts; die Seite fragt erst nach.',
    ignore:
      'Warst du das nicht? Ignoriere diese E-Mail, dann bleibt deine Einwilligung, wie sie ist.',
  },
  tr: {
    subject: 'Benchbite’ta bir onayı geri çek',
    title: 'Onayın geri çekilsin mi?',
    ask: {
      health:
        'Biri bu e-posta adresinin Benchbite hesabı için sağlık verisi onayını geri çekmek istedi. Sen istediysen sayfayı aç ve orada onayla.',
      ai: 'Biri bu e-posta adresinin Benchbite hesabı için yapay zekâ özellikleri onayını geri çekmek istedi. Sen istediysen sayfayı aç ve orada onayla.',
    },
    button: 'Sayfayı aç',
    note: 'Bağlantı bir kez, 30 dakika boyunca çalışır. Açmak hiçbir şeyi değiştirmez; sayfa önce sorar.',
    ignore: 'Bunu sen istemediysen bu e-postayı yok say; onayın olduğu gibi kalır.',
  },
} satisfies Record<
  SiteLocale,
  { ask: Record<Consent, string> } & Record<
    'subject' | 'title' | 'button' | 'note' | 'ignore',
    string
  >
>;

export function withdrawalEmail(
  locale: SiteLocale,
  consent: Consent,
  to: string,
  link: string,
): Email {
  const copy = COPY[locale];
  const ask = copy.ask[consent];
  const button = `<p style="margin: 0 0 16px">
        <a href="${escape(link)}" style="display: inline-block; padding: 14px 24px; border-radius: 14px; background: #f25a00; color: #ffffff; font-weight: 800; text-decoration: none">${escape(copy.button)}</a>
      </p>`;
  const html = accountEmailHtml(locale, copy.title, [
    paragraph(ask),
    button,
    note(copy.note),
    note(copy.ignore),
  ]);
  const text = [copy.title, ask, link, copy.note, copy.ignore].join('\n\n');
  return { to, subject: copy.subject, html, text };
}
