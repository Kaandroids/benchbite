// Checks that every locale has exactly the keys of the English source locale, and that each
// translation uses the same {{placeholders}}; the same for the iOS permission texts, whose English
// must also be what app.json gives the config plugins. Run with `pnpm check:locales`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const LOCALES_DIR = join(ROOT, 'src/i18n/locales');
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

/** The locales in a folder besides English. */
function translationsIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .filter((locale) => locale !== SOURCE);
}

/** Adds to `errors` each key or placeholder in which a translation differs from English. */
function check(dir: string, label: string, translations: string[], errors: string[]) {
  const source = load(dir, SOURCE);
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
/** An Info.plist key that holds a permission text. */
const USAGE_DESCRIPTION = /UsageDescription$/;

type Plugins = (string | [string, Record<string, unknown>?])[];

type AppJson = {
  expo: {
    ios?: { infoPlist?: Record<string, unknown> };
    locales?: Record<string, string>;
    plugins: Plugins;
  };
};

/** Each plugin's options in app.json, by the plugin's name. */
function pluginOptions(plugins: Plugins): Map<string, Record<string, unknown>> {
  return new Map(
    plugins.flatMap((plugin) =>
      typeof plugin === 'string' ? [] : [[plugin[0], plugin[1] ?? {}] as const],
    ),
  );
}

/**
 * Adds to `errors` each plugin option that holds a permission text but is missing from
 * `PLUGIN_TEXTS`. It goes by the option's name, so an option named otherwise is not caught.
 */
function checkPluginOptions(options: Map<string, Record<string, unknown>>, errors: string[]) {
  const listed = new Set(
    Object.values(PLUGIN_TEXTS).map(([plugin, option]) => `${plugin}.${option}`),
  );
  for (const [plugin, pluginOptions] of options) {
    for (const [option, value] of Object.entries(pluginOptions)) {
      if (
        typeof value === 'string' &&
        PERMISSION_OPTION.test(option) &&
        !listed.has(`${plugin}.${option}`)
      ) {
        errors.push(
          `app.json: ${plugin}'s ${option} needs a text in ${PERMISSIONS_PATH} and an entry in PLUGIN_TEXTS in scripts/check-locales.ts`,
        );
      }
    }
  }
}

/**
 * The permission texts app.json writes to Info.plist, by key: through the plugins in
 * `PLUGIN_TEXTS`, or set in `ios.infoPlist`, where a plugin's option wins as it does in prebuild.
 * A plugin's own default text, written without an option, is not among them.
 */
function appTexts(
  options: Map<string, Record<string, unknown>>,
  infoPlist: Record<string, unknown>,
): Map<string, unknown> {
  const texts = new Map<string, unknown>(
    Object.entries(PLUGIN_TEXTS).map(([key, [plugin, option]]) => [
      key,
      options.get(plugin)?.[option],
    ]),
  );
  for (const [key, value] of Object.entries(infoPlist)) {
    if (USAGE_DESCRIPTION.test(key) && typeof value === 'string' && texts.get(key) === undefined) {
      texts.set(key, value);
    }
  }
  return texts;
}

/**
 * Adds to `errors` each English permission text that differs from the one app.json writes to
 * Info.plist, which iOS shows where a language has no text of its own, and each without the other.
 */
function checkEnglish(texts: Map<string, unknown>, errors: string[]) {
  const english = load(PERMISSIONS_DIR, SOURCE);
  for (const [key, text] of texts) {
    if (english[`ios.${key}`] === undefined) {
      errors.push(`${PERMISSIONS_PATH}/${SOURCE}: missing "ios.${key}", which app.json writes`);
    } else if (english[`ios.${key}`] !== text) {
      errors.push(`${PERMISSIONS_PATH}/${SOURCE}: "ios.${key}" differs from the text in app.json`);
    }
  }
  // Other Info.plist keys, such as the app's name, need no text in app.json.
  for (const key of Object.keys(english)) {
    if (USAGE_DESCRIPTION.test(key) && !texts.has(key.replace(/^ios\./, ''))) {
      errors.push(
        `${PERMISSIONS_PATH}/${SOURCE}: "${key}" is written by nothing in app.json or PLUGIN_TEXTS`,
      );
    }
  }
}

/**
 * Adds to `errors` where the permission languages are not those of the app's texts: iOS shows a
 * permission text in a language only when `expo.locales` names its file.
 */
function checkLanguages(
  locales: string[],
  permissionLocales: string[],
  registered: Record<string, string>,
  errors: string[],
) {
  const sorted = (codes: string[]) => [...codes].sort().join();
  const languages = sorted([SOURCE, ...locales]);
  const permissions = sorted([SOURCE, ...permissionLocales]);
  if (permissions !== languages) {
    errors.push(`${PERMISSIONS_PATH} has ${permissions}, not the languages ${languages}`);
  }
  const named = sorted(Object.keys(registered));
  if (named !== languages) {
    errors.push(`expo.locales in app.json has ${named}, not the languages ${languages}`);
  }
  for (const [code, path] of Object.entries(registered)) {
    if (path !== `./${PERMISSIONS_PATH}/${code}.json`) {
      errors.push(`expo.locales in app.json: ${code} points to ${path}`);
    }
  }
}

const errors: string[] = [];
const app = (JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as AppJson).expo;
const locales = translationsIn(LOCALES_DIR);
const permissionLocales = translationsIn(PERMISSIONS_DIR);
check(LOCALES_DIR, '', locales, errors);
check(PERMISSIONS_DIR, `${PERMISSIONS_PATH}/`, permissionLocales, errors);
const options = pluginOptions(app.plugins);
checkPluginOptions(options, errors);
checkEnglish(appTexts(options, app.ios?.infoPlist ?? {}), errors);
checkLanguages(locales, permissionLocales, app.locales ?? {}, errors);

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Locales match ${SOURCE}: ${locales.join(', ')}`);
console.log(`Permission texts match ${SOURCE} and app.json: ${permissionLocales.join(', ')}`);
