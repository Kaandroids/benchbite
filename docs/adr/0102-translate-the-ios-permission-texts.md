# 0102. Translate the iOS permission texts

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

On iOS, the buttons of a permission prompt follow the phone's language, but the sentence under the title is the app's own, from Info.plist. The config plugins in `app.json` write it in English only, so German and Turkish users read English under the camera, photos, microphone and Apple Health prompts. ADR 0007 keeps the app's text in `src/i18n/locales/`, which the app loads at run time; Info.plist texts are read by iOS before the app runs.

## Decision

- **The permission texts live in `src/i18n/permissions/`,** one file per language with the Info.plist keys under `ios`, and `expo.locales` in `app.json` names them. Prebuild writes each to its language's `InfoPlist.strings`. `CFBundleAllowMixedLocalizations` lets iOS use them.
- **English is kept twice:** in `en.json`, and in the plugin options in `app.json`, which write the Info.plist default.
- **`pnpm check:locales` keeps them in step.** It checks that:
  - each English text is the one its plugin writes, as listed in `PLUGIN_TEXTS` in `scripts/check-locales.ts`;
  - every permission option of a plugin has a text;
  - the permission files, `expo.locales` and `src/i18n/locales/` hold the same languages.
- **Adding a language** now also means a permission file and an `expo.locales` entry. ADR 0007's one file per language covers the app's text only; `docs/development.md` lists every step.

## Alternatives considered

- **Only German and Turkish files, English left to `app.json`:** the check would have no English file to compare the translations' keys against.
- **Building the plugin options from `en.json` in `app.config.ts`:** this removes the copy, but hides the plugins' texts from `app.json`.
- **Inside `src/i18n/locales/`:** the app would load the permission texts as screen translations.

## Consequences

- German and Turkish users read the permission prompts in their language once a new build is installed.
- iOS picks the text by the phone's language, or the per-app language in iOS Settings, not by the language chosen in Benchbite.
- A new permission text goes in four places: the plugin option, the three permission files and `PLUGIN_TEXTS`. The check names what is missing.
