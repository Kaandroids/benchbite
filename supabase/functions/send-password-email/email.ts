// The emails sent when an account's password is saved (#481, ADR 0167), in the app's language, in
// the layout of _shared/account_email.ts: a welcome for its first password, and a notice for any
// later one, which tells the owner of a change they did not make.
import { accountEmailHtml, escape, note, paragraph } from '../_shared/account_email.ts';
import type { Email } from '../_shared/email.ts';
import type { SiteLocale } from '../_shared/site.ts';

/** Which email: an account's first password, or a later one. */
export type PasswordEmailKind = 'welcome' | 'changed';

type Copy = { subject: string; title: string; body: string[]; points?: string[]; note: string };

const COPY = {
  welcome: {
    en: {
      subject: 'Welcome to Benchbite',
      title: 'Your account is ready',
      body: [
        'Welcome to Benchbite. Your plan, workouts, meals and progress are now kept with your account:',
      ],
      points: [
        'Sign in on a new phone and everything is there.',
        'Nothing is lost if you delete the app.',
      ],
      note: 'Didn’t create an account? Reset the password in the app with “Forgot your password?”, which signs out every other device, or write to support@benchbite.com.',
    },
    de: {
      subject: 'Willkommen bei Benchbite',
      title: 'Dein Konto ist bereit',
      body: [
        'Willkommen bei Benchbite. Dein Plan, deine Trainings, Mahlzeiten und Fortschritte sind jetzt bei deinem Konto gespeichert:',
      ],
      points: [
        'Melde dich auf einem neuen Handy an, und alles ist da.',
        'Nichts geht verloren, wenn du die App löschst.',
      ],
      note: 'Hast du kein Konto erstellt? Setze das Passwort in der App mit „Passwort vergessen?“ zurück, dann werden alle anderen Geräte abgemeldet, oder schreib an support@benchbite.com.',
    },
    tr: {
      subject: 'Benchbite’a hoş geldin',
      title: 'Hesabın hazır',
      body: [
        'Benchbite’a hoş geldin. Planın, antrenmanların, öğünlerin ve ilerlemen artık hesabında saklanıyor:',
      ],
      points: [
        'Yeni bir telefonda giriş yap, hepsi orada.',
        'Uygulamayı silsen de hiçbir şey kaybolmaz.',
      ],
      note: 'Hesap oluşturmadın mı? Uygulamada “Şifreni mi unuttun?” ile şifreyi sıfırla, diğer tüm cihazlarda oturum kapanır, ya da support@benchbite.com adresine yaz.',
    },
  },
  changed: {
    en: {
      subject: 'Your Benchbite password was changed',
      title: 'Your password was changed',
      body: ['The password of your Benchbite account was just changed.'],
      note: 'Wasn’t you? Reset it in the app with “Forgot your password?”. That signs out every other device.',
    },
    de: {
      subject: 'Dein Benchbite-Passwort wurde geändert',
      title: 'Dein Passwort wurde geändert',
      body: ['Das Passwort deines Benchbite-Kontos wurde gerade geändert.'],
      note: 'Warst du das nicht? Setze es in der App mit „Passwort vergessen?“ zurück. Dann werden alle anderen Geräte abgemeldet.',
    },
    tr: {
      subject: 'Benchbite şifren değiştirildi',
      title: 'Şifren değiştirildi',
      body: ['Benchbite hesabının şifresi az önce değiştirildi.'],
      note: 'Bunu sen yapmadıysan uygulamada “Şifreni mi unuttun?” ile sıfırla. Diğer tüm cihazlarda oturum kapanır.',
    },
  },
} satisfies Record<PasswordEmailKind, Record<SiteLocale, Copy>>;

const list = (points: string[]) =>
  `<ul style="margin: 0 0 16px; padding-left: 20px">${points
    .map((point) => `<li style="margin: 0 0 6px">${escape(point)}</li>`)
    .join('')}</ul>`;

export function passwordEmail(kind: PasswordEmailKind, locale: SiteLocale, to: string): Email {
  const copy: Copy = COPY[kind][locale];
  const parts = [
    ...copy.body.map(paragraph),
    ...(copy.points ? [list(copy.points)] : []),
    note(copy.note),
  ];
  const text = [
    copy.title,
    ...copy.body,
    ...(copy.points ?? []).map((point) => `- ${point}`),
    copy.note,
  ].join('\n\n');
  return { to, subject: copy.subject, html: accountEmailHtml(locale, copy.title, parts), text };
}
