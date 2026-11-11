# 0123. Translate the watch app

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The app is in English, German and Turkish, in the language chosen in Benchbite or the phone's (ADR 0007). The Apple Watch app's own text, from "Finish workout?" to "2 sets wait for your iPhone", was English only, while the exercises' names it shows come from the phone in the app's language. Its text is compiled into the watch app, which iOS's own localization would pick by the watch's language, not by the one chosen in Benchbite.

## Decision

- **The watch shows its text in the language chosen in Benchbite.** The phone sends it with each state (`language`), and the watch keeps the last one, so that it opens in it; English until the phone has said. The watch's screens are drawn again when it changes.
- **The text lives in `src/i18n/watch/`, one file per language**, beside the app's (ADR 0007) and the permission texts (ADR 0102), with i18next's `{{placeholders}}` and `_one` / `_other` forms. A separate folder keeps the app from loading text it never shows.
- **`pnpm watch:strings` writes it to `targets/watch/Strings.swift`**, a dictionary by language and key, which `L10n.t()` reads on the watch, filling in the placeholders and taking `_one` for a count of one, as i18next does for the app's languages. The file is committed, as the watch target is built from `targets/watch`.
- **`pnpm check:locales` checks the watch's text too**: the same keys and placeholders in each language as in English, the app's languages, and a Swift file written from the current text.

## Alternatives considered

- **The watch's own language, through a String Catalog:** the standard way, but with a language chosen in Benchbite the watch's text and the exercises' names could be in two languages.
- **The phone sends the text with each state:** no copy in the watch app, but the state, sent at each change, would carry every text, and the watch would have none before the phone first speaks.
- **The watch's text in the app's files:** the app would load text it never shows, as ADR 0102 found for the permission texts.

## Consequences

- The watch speaks German and Turkish, as the app does.
- A watch text changes in `src/i18n/watch/` and needs `pnpm watch:strings` and a new build; the check fails until the Swift file follows.
- Numbers and times on the watch, such as the rest's countdown, follow the watch's own region, not the language chosen in Benchbite.
