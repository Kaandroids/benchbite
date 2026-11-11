// Writes the watch app's texts from src/i18n/watch to targets/watch/Strings.swift. Run with
// `pnpm watch:strings` after changing them; `pnpm check:locales` fails while the file is behind.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { WATCH_SWIFT_PATH, watchStringsSwift } from './lib/watch-strings.ts';

const ROOT = join(import.meta.dirname, '..');
writeFileSync(join(ROOT, WATCH_SWIFT_PATH), watchStringsSwift(ROOT));
console.log(`Wrote ${WATCH_SWIFT_PATH}`);
