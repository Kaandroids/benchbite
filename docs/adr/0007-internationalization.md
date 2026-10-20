# 0007. Translate the app with i18next and default units from the device

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Benchbite is built for English, German and Turkish speakers, with Germany as the main market.
The onboarding is about to add most of the app's text, so translations have to be in place
before it, not added afterwards. The onboarding also asks for height and weight, which people
expect in the units of their region, and numbers are written differently per language (72.5 in
English, 72,5 in German and Turkish).

## Decision

- **Library:** `i18next` with `react-i18next`. Components read text through `useTranslation()`.
  Translations live in `src/i18n/locales/` as one JSON file per language.
- **Source locale:** English. Every key is added there first, and `t()` is typed against it, so
  a misspelled key is a type error. `pnpm check:locales` fails CI when another locale is missing
  a key, has an extra one or uses different `{{placeholders}}`.
- **Language:** the first of the user's preferred device languages that Benchbite supports,
  read with `expo-localization`, falling back to English. Android can change it while the app
  runs, so it is checked again when the app returns to the foreground.
- **Plurals:** Hermes lacks `Intl.PluralRules`, which i18next needs, so `intl-pluralrules` is
  loaded as a polyfill.
- **Units:** `defaultUnits()` derives them from the device's measurement system: kilograms and
  centimetres by default, pounds and feet in the United States, and kilograms with feet in the
  United Kingdom. Users can switch where a value is entered. Stones are not supported.
- **Numbers:** `useNumberFormat()` formats them with `Intl.NumberFormat` for the app language,
  so that they match the text around them.
- **Style:** German and Turkish address the user informally (du, sen), like most fitness apps.
  Text is never upper-cased in code, because automatic upper-casing turns the Turkish "i" into
  "I" instead of "İ".

## Alternatives considered

- **`i18n-js`**, used in the Expo documentation: smaller, but its keys are not typed and its
  ecosystem is much smaller.
- **`react-intl` (FormatJS) or Lingui:** powerful ICU message formatting, but heavier, and
  Lingui needs a compile step for its catalogues.
- **English only for the first version:** rejected, because the main market is Germany and
  Turkish is needed from the start.

## Consequences

- Every user-facing string goes through `t()`, including accessibility labels. The
  development-only component gallery stays in English.
- Adding a language means adding one JSON file and its code to `SUPPORTED_LANGUAGES`.
- Choosing a language other than the device's, in the app or in the system's per-app language
  setting, is not possible yet (#26, #27).
