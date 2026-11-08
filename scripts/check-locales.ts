// Checks that every locale has exactly the keys of the English source locale, and that each
// translation uses the same {{placeholders}}; the same for the iOS permission texts, whose English
// must also be what app.json gives the config plugins. Run with `pnpm check:locales`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const LOCALES_DIR = join(ROOT, 'src', 'i18n', 'locales');
const PERMISSIONS_DIR = join(ROOT, 'src', 'i18n', 'permissions');
const SOURCE = 'en';

/** Flattens nested objects into a map of dotted keys to strings. */
type Messages = { [key: string]: string | Messages };

function flatten(object: Messages, prefix = ''): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object') {
      Object.assign(entries, flatten(value, path));
    } else {
      entries[path] = String(value);
    }
  }
  return entries;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1] ?? '').sort();
}

function load(dir: string, locale: string): Record<string, string> {
  return flatten(JSON.parse(readFileSync(join(dir, `${locale}.json`), 'utf8')) as Messages);
}

const errors: string[] = [];

/** Checks the locales in a folder against its English one; the locales it checked. */
function check(dir: string, label: string): string[] {
  const source = load(dir, SOURCE);
  const locales = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .filter((locale) => locale !== SOURCE);
  for (const locale of locales) {
    const translation = load(dir, locale);
    for (const key of Object.keys(source)) {
      if (!(key in translation)) {
        errors.push(`${label}${locale}: missing key "${key}"`);
      } else if (
        placeholders(source[key] ?? '').join() !== placeholders(translation[key] ?? '').join()
      ) {
        errors.push(`${label}${locale}: "${key}" uses different placeholders than ${SOURCE}`);
      }
    }
    for (const key of Object.keys(translation)) {
      if (!(key in source)) {
        errors.push(`${label}${locale}: unknown key "${key}", which ${SOURCE} does not have`);
      }
    }
  }
  return locales;
}

const locales = check(LOCALES_DIR, '');
const permissionLocales = check(PERMISSIONS_DIR, 'permissions/');

// The plugins write the English to Info.plist, which shows where a language has no text of its own.
const app = readFileSync(join(ROOT, 'app.json'), 'utf8');
for (const [key, text] of Object.entries(load(PERMISSIONS_DIR, SOURCE))) {
  if (!app.includes(JSON.stringify(text))) {
    errors.push(`permissions/${SOURCE}: "${key}" differs from the text in app.json`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Locales match ${SOURCE}: ${locales.join(', ')}`);
console.log(`Permission texts match ${SOURCE} and app.json: ${permissionLocales.join(', ')}`);
