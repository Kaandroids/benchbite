// Reading the text files of the app, the permission prompts and the watch app: one JSON file per
// language, nested by key.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Messages = { [key: string]: string | Messages };

/** Flattens nested objects into a map of dotted keys to strings. */
export function flatten(object: Messages, prefix = ''): Record<string, string> {
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

/** A language's texts in a folder, by dotted key. */
export function load(dir: string, language: string): Record<string, string> {
  return flatten(JSON.parse(readFileSync(join(dir, `${language}.json`), 'utf8')) as Messages);
}

/** The languages a folder has a file for, sorted. */
export function languagesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort();
}
