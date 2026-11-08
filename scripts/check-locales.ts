// Checks that every locale has exactly the keys of the English source locale, and that each
// translation uses the same {{placeholders}}; the same for the iOS permission texts, whose English
// must also be what app.json gives the config plugins. Run with `pnpm check:locales`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const LOCALES_DIR = join(ROOT, 'src', 'i18n', 'locales');
/** Where the iOS permission texts are, as app.json's `expo.locales` names them. */
const PERMISSIONS_PATH = 'src/i18n/permissions';
const PERMISSIONS_DIR = join(ROOT, PERMISSIONS_PATH);
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

/** Adds each mismatch with English to `errors`; the translations in the folder, English left out. */
function check(dir: string, label: string, errors: string[]): string[] {
  const source = load(dir, SOURCE);
  const translations = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .filter((locale) => locale !== SOURCE);
  for (const locale of translations) {
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
  return translations;
}

/**
 * The plugin and option in app.json that write each iOS permission text to Info.plist. A new
 * permission text goes here too.
 */
const PLUGIN_TEXTS: Record<string, [plugin: string, option: string]> = {
  NSCameraUsageDescription: ['expo-image-picker', 'cameraPermission'],
  NSPhotoLibraryUsageDescription: ['expo-image-picker', 'photosPermission'],
  NSMicrophoneUsageDescription: ['expo-audio', 'microphonePermission'],
  NSHealthShareUsageDescription: [
    '@kingstinct/react-native-healthkit',
    'NSHealthShareUsageDescription',
  ],
};
/** A plugin option that holds a permission text, by its name. */
const PERMISSION_OPTION = /(Permission|UsageDescription)$/;

type AppJson = {
  expo: {
    locales?: Record<string, string>;
    plugins: (string | [string, Record<string, unknown>?])[];
  };
};

/**
 * Adds to `errors` each English permission text that is not the one its plugin writes to
 * Info.plist, which shows where a language has no text of its own, and each plugin text without one.
 */
function checkPluginTexts(app: AppJson['expo'], errors: string[]) {
  const options = new Map(
    app.plugins.flatMap((plugin) =>
      typeof plugin === 'string' ? [] : [[plugin[0], plugin[1] ?? {}] as const],
    ),
  );
  const english = load(PERMISSIONS_DIR, SOURCE);
  for (const [key, [plugin, option]] of Object.entries(PLUGIN_TEXTS)) {
    const text = english[`ios.${key}`];
    if (text === undefined) {
      errors.push(`${PERMISSIONS_PATH}/${SOURCE}: missing "ios.${key}", which ${plugin} writes`);
    } else if (options.get(plugin)?.[option] !== text) {
      errors.push(
        `${PERMISSIONS_PATH}/${SOURCE}: "ios.${key}" differs from ${plugin}'s ${option} in app.json`,
      );
    }
  }
  for (const key of Object.keys(english)) {
    if (!(key.replace(/^ios\./, '') in PLUGIN_TEXTS)) {
      errors.push(
        `${PERMISSIONS_PATH}/${SOURCE}: "${key}" is in no plugin of PLUGIN_TEXTS in scripts/check-locales.ts`,
      );
    }
  }
  const known = new Set(
    Object.values(PLUGIN_TEXTS).map(([plugin, option]) => `${plugin}.${option}`),
  );
  for (const [plugin, pluginOptions] of options) {
    for (const [option, value] of Object.entries(pluginOptions)) {
      if (
        typeof value === 'string' &&
        PERMISSION_OPTION.test(option) &&
        !known.has(`${plugin}.${option}`)
      ) {
        errors.push(
          `app.json: ${plugin}'s ${option} needs a text in ${PERMISSIONS_PATH} and an entry in PLUGIN_TEXTS in scripts/check-locales.ts`,
        );
      }
    }
  }
}

/**
 * Adds to `errors` each place whose languages are not those of the app's texts: iOS shows a
 * permission text in a language only when `expo.locales` names its file.
 */
function checkLanguages(
  locales: string[],
  permissionLocales: string[],
  app: AppJson['expo'],
  errors: string[],
) {
  const sorted = (codes: readonly string[]) => [...codes].sort().join();
  const registered = Object.entries(app.locales ?? {});
  const languages = sorted([SOURCE, ...locales]);
  for (const [label, codes] of [
    [PERMISSIONS_PATH, [SOURCE, ...permissionLocales]],
    ['expo.locales in app.json', registered.map(([code]) => code)],
  ] as const) {
    if (sorted(codes) !== languages) {
      errors.push(`${label} has ${sorted(codes)}, not the languages ${languages}`);
    }
  }
  for (const [code, path] of registered) {
    if (path !== `./${PERMISSIONS_PATH}/${code}.json`) {
      errors.push(`expo.locales in app.json: ${code} points to ${path}`);
    }
  }
}

const errors: string[] = [];
const app = (JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as AppJson).expo;
const locales = check(LOCALES_DIR, '', errors);
const permissionLocales = check(PERMISSIONS_DIR, `${PERMISSIONS_PATH}/`, errors);
checkPluginTexts(app, errors);
checkLanguages(locales, permissionLocales, app, errors);

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Locales match ${SOURCE}: ${locales.join(', ')}`);
console.log(`Permission texts match ${SOURCE} and app.json: ${permissionLocales.join(', ')}`);
