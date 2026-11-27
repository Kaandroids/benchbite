// The Auth emails with a code, in the layout of account_email.ts (ADR 0175). Supabase Auth reads
// them as Go templates from supabase/templates/, which `pnpm emails` writes by running this file,
// and auth_templates_test.ts keeps alike. The 15 minutes are `otp_expiry` in supabase/config.toml.
import { accountEmailHtml, code, note, paragraph } from './account_email.ts';
import { SITE_LOCALES, type SiteLocale } from './site.ts';

type CodeCopy = { title: string; ask: string; note: string };

const TEMPLATES = {
  // Sign-up and a new email address (`confirmation` and `email_change` in config.toml).
  'account-code.html': {
    en: {
      title: 'Confirm your email',
      ask: 'Enter this code in the app to finish creating your account:',
      note: "It works for 15 minutes. If you didn't ask for this, you can ignore this email.",
    },
    de: {
      title: 'Bestätige deine E-Mail-Adresse',
      ask: 'Gib diesen Code in der App ein, um dein Konto fertig einzurichten:',
      note: 'Er gilt 15 Minuten. Falls du das nicht warst, kannst du diese E-Mail ignorieren.',
    },
    tr: {
      title: 'E-posta adresini onayla',
      ask: 'Hesabını tamamlamak için bu kodu uygulamaya gir:',
      note: '15 dakika geçerlidir. Bunu sen istemediysen bu e-postayı yok sayabilirsin.',
    },
  },
  // A forgotten password (`recovery`).
  'password-code.html': {
    en: {
      title: 'Reset your password',
      ask: 'Enter this code in the app to choose a new password:',
      note: "It works for 15 minutes. If you didn't ask for this, your password stays as it is.",
    },
    de: {
      title: 'Setze dein Passwort zurück',
      ask: 'Gib diesen Code in der App ein, um ein neues Passwort zu wählen:',
      note: 'Er gilt 15 Minuten. Falls du das nicht warst, bleibt dein Passwort, wie es ist.',
    },
    tr: {
      title: 'Şifreni sıfırla',
      ask: 'Yeni bir şifre seçmek için bu kodu uygulamaya gir:',
      note: '15 dakika geçerlidir. Bunu sen istemediysen şifren olduğu gibi kalır.',
    },
  },
} satisfies Record<string, Record<SiteLocale, CodeCopy>>;

/** Where Auth puts the code; Go reads it, so it is left as it is. */
const TOKEN = '{{ .Token }}';

const email = (locale: SiteLocale, copy: CodeCopy) =>
  accountEmailHtml(locale, copy.title, [paragraph(copy.ask), code(TOKEN), note(copy.note)]);

/** Each template's file name and text: one email per language, chosen by the user's locale. */
export function authTemplates(): Record<string, string> {
  const others = SITE_LOCALES.filter((locale) => locale !== 'en');
  return Object.fromEntries(
    Object.entries(TEMPLATES).map(([file, copies]) => {
      const branches = others
        .map(
          (locale, i) =>
            `{{ ${i === 0 ? 'if' : 'else if'} eq .Data.locale "${locale}" }}\n${email(locale, copies[locale])}\n`,
        )
        .join('');
      const text = `<!-- Written by \`pnpm emails\` from supabase/functions/_shared/auth_templates.ts: change it there. -->\n${branches}{{ else }}\n${email('en', copies.en)}\n{{ end }}\n`;
      return [file, text];
    }),
  );
}

// `pnpm emails`: writes the templates to supabase/templates/.
if (import.meta.main) {
  for (const [file, text] of Object.entries(authTemplates())) {
    await Deno.writeTextFile(new URL(`../../templates/${file}`, import.meta.url), text);
    console.log(`Wrote supabase/templates/${file}`);
  }
}
