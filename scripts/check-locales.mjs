// Checks that every locale has exactly the keys of the English source locale, and that each
// translation uses the same {{placeholders}}. Run with `pnpm check:locales`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES_DIR = join(import.meta.dirname, '..', 'src', 'i18n', 'locales');
const SOURCE = 'en';

/** Flattens nested objects into a map of dotted keys to strings. */
function flatten(object, prefix = '') {
  const entries = {};
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      Object.assign(entries, flatten(value, path));
    } else {
      entries[path] = String(value);
    }
  }
  return entries;
}

function placeholders(text) {
  return [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();
}

function load(locale) {
  return flatten(JSON.parse(readFileSync(join(LOCALES_DIR, `${locale}.json`), 'utf8')));
}

const source = load(SOURCE);
const locales = readdirSync(LOCALES_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''))
  .filter((locale) => locale !== SOURCE);

const errors = [];
for (const locale of locales) {
  const translation = load(locale);
  for (const key of Object.keys(source)) {
    if (!(key in translation)) {
      errors.push(`${locale}: missing key "${key}"`);
    } else if (placeholders(source[key]).join() !== placeholders(translation[key]).join()) {
      errors.push(`${locale}: "${key}" uses different placeholders than ${SOURCE}`);
    }
  }
  for (const key of Object.keys(translation)) {
    if (!(key in source)) {
      errors.push(`${locale}: unknown key "${key}", which ${SOURCE} does not have`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Locales match ${SOURCE}: ${locales.join(', ')}`);
