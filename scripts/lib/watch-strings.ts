// The watch app's texts, kept in src/i18n/watch and written as Swift to targets/watch/Strings.swift,
// which the watch reads in the language the phone chose (ADR 0123).
import { join } from 'node:path';

import { languagesIn, load } from './messages.ts';

export const WATCH_STRINGS_PATH = 'src/i18n/watch';
export const WATCH_SWIFT_PATH = 'targets/watch/Strings.swift';

/** A Swift string literal of `text`. */
function literal(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/** The Swift file that holds the watch's texts of each language in `root`, sorted. */
export function watchStringsSwift(root: string): string {
  const dir = join(root, WATCH_STRINGS_PATH);
  const blocks = languagesIn(dir).map((language) => {
    const entries = Object.entries(load(dir, language))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, text]) => `    ${literal(key)}: ${literal(text)},`);
    return `  ${literal(language)}: [\n${entries.join('\n')}\n  ],`;
  });
  return [
    `// Generated from ${WATCH_STRINGS_PATH} by \`pnpm watch:strings\`: edit those files, not this one.`,
    '',
    "/// The watch's texts, by language, then by key (ADR 0123).",
    'let watchStrings: [String: [String: String]] = [',
    ...blocks,
    ']',
    '',
  ].join('\n');
}
