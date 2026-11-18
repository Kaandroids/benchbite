// The email with the link to download an account's data (ADR 0148), in the language of the page it
// was asked from, in the layout of _shared/account_email.ts.
import { type LinkEmailCopy, linkEmail } from '../_shared/account_email.ts';
import type { Email } from '../_shared/email.ts';
import type { SiteLocale } from '../_shared/site.ts';

const COPY = {
  en: {
    subject: 'Your Benchbite data',
    title: 'Download your data',
    ask: 'Someone asked for a copy of the data of the Benchbite account of this email address. If it was you, open the page and download it there.',
    button: 'Open the page',
    note: 'The link works for 30 minutes. The file holds your health data, so keep it somewhere safe.',
    ignore: "Didn't ask for this? Ignore this email; nobody gets your data without this link.",
  },
  de: {
    subject: 'Deine Benchbite-Daten',
    title: 'Deine Daten herunterladen',
    ask: 'Jemand möchte eine Kopie der Daten des Benchbite-Kontos dieser E-Mail-Adresse. Warst du das, öffne die Seite und lade sie dort herunter.',
    button: 'Seite öffnen',
    note: 'Der Link funktioniert 30 Minuten lang. Die Datei enthält deine Gesundheitsdaten, bewahre sie also sicher auf.',
    ignore:
      'Warst du das nicht? Ignoriere diese E-Mail; ohne diesen Link bekommt niemand deine Daten.',
  },
  tr: {
    subject: 'Benchbite verilerin',
    title: 'Verilerini indir',
    ask: 'Biri bu e-posta adresinin Benchbite hesabının verilerinin bir kopyasını istedi. Sen istediysen sayfayı aç ve orada indir.',
    button: 'Sayfayı aç',
    note: 'Bağlantı 30 dakika boyunca çalışır. Dosyada sağlık verilerin var, bu yüzden onu güvenli bir yerde sakla.',
    ignore:
      'Bunu sen istemediysen bu e-postayı yok say; bu bağlantı olmadan kimse verilerini alamaz.',
  },
} satisfies Record<SiteLocale, LinkEmailCopy>;

export function exportEmail(locale: SiteLocale, to: string, link: string): Email {
  return linkEmail(locale, COPY[locale], to, link);
}
