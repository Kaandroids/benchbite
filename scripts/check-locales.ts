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

/** Checks the locales in a folder against its English one, into `errors`; all its locales. */
function check(dir: string, label: string, errors: string[]): string[] {
  const source = load(dir, SOURCE);
  const locales = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''));
  for (const locale of locales.filter((locale) => locale !== SOURCE)) {
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

/** The plugin and option in app.json that write each iOS permission text to Info.plist. */
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
    plugins: (string | [string, Record<string, unknown>])[];
  };
};

const errors: string[] = [];
const locales = check(LOCALES_DIR, '', errors);
const permissionLocales = check(PERMISSIONS_DIR, 'permissions/', errors);

const app = (JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as AppJson).expo;
const options = new Map(
  app.plugins.flatMap((plugin) => (typeof plugin === 'string' ? [] : [[plugin[0], plugin[1]]])),
);

// The plugins write the English to Info.plist, which shows where a language has no text of its own.
const english = load(PERMISSIONS_DIR, SOURCE);
for (const [key, [plugin, option]] of Object.entries(PLUGIN_TEXTS)) {
  const text = english[`ios.${key}`];
  if (text === undefined) {
    errors.push(`permissions/${SOURCE}: missing "ios.${key}", which ${plugin} writes`);
  } else if (options.get(plugin)?.[option] !== text) {
    errors.push(
      `permissions/${SOURCE}: "ios.${key}" differs from ${plugin}'s ${option} in app.json`,
    );
  }
}
for (const key of Object.keys(english)) {
  if (!(key.replace(/^ios\./, '') in PLUGIN_TEXTS)) {
    errors.push(`permissions/${SOURCE}: "${key}" is written by no plugin in app.json`);
  }
}
const known = new Set(Object.values(PLUGIN_TEXTS).map(([plugin, option]) => `${plugin}.${option}`));
for (const [plugin, pluginOptions] of options) {
  for (const [option, value] of Object.entries(pluginOptions)) {
    if (
      typeof value === 'string' &&
      PERMISSION_OPTION.test(option) &&
      !known.has(`${plugin}.${option}`)
    ) {
      errors.push(`app.json: ${plugin}'s ${option} has no text in src/i18n/permissions`);
    }
  }
}

// iOS shows a permission text in a language only when app.json names its file.
const languages = [...locales].sort().join();
const registered = Object.entries(app.locales ?? {});
for (const [label, codes] of [
  ['src/i18n/permissions', permissionLocales],
  ['expo.locales in app.json', registered.map(([code]) => code)],
] as const) {
  if ([...codes].sort().join() !== languages) {
    errors.push(`${label} has ${[...codes].sort().join()}, not the languages ${languages}`);
  }
}
for (const [code, path] of registered) {
  if (path !== `./src/i18n/permissions/${code}.json`) {
    errors.push(`expo.locales in app.json: ${code} points to ${path}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Locales match ${SOURCE}: ${locales.filter((locale) => locale !== SOURCE).join(', ')}`);
console.log(
  `Permission texts match ${SOURCE} and app.json: ${permissionLocales.filter((locale) => locale !== SOURCE).join(', ')}`,
);
