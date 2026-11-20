// Writes the list of open source libraries that are part of the app, with their licences, for the
// licences screen (#29, ADR 0160): src/licences/libraries.json. Run with `pnpm licences` after a
// dependency was added, updated or removed.
//
// Which libraries are part of the app is read from the app itself: it is bundled for both
// platforms with source maps, and every package a source map names is in the app. Tools that only
// build the app are not, and are left out. Each library's licence is its package.json's, and the
// text and the copyright lines are those of its own licence file.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Library, Licence } from '../src/licences/types.ts';

const ROOT = join(import.meta.dirname, '..');
const OUTPUT = join(ROOT, 'src/licences/libraries.json');
const MODULES = 'node_modules/';

/** The folders, relative to the project, of the packages the app's bundles are made of. */
function bundledPackages(): Map<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'benchbite-licences-'));
  try {
    execFileSync(
      'pnpm',
      [
        'expo',
        'export',
        '--platform',
        'ios',
        '--platform',
        'android',
        '--dump-sourcemap',
        '--output-dir',
        dir,
      ],
      {
        cwd: ROOT,
        stdio: ['ignore', 'ignore', 'inherit'],
        env: { ...process.env, APP_VARIANT: 'production' },
      },
    );
    const packages = new Map<string, string>();
    for (const file of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
      if (!file.endsWith('.map')) continue;
      const { sources } = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
        sources: string[];
      };
      for (const source of sources) {
        const at = source.lastIndexOf(MODULES);
        if (at < 0) continue;
        const [scope = '', inScope = ''] = source.slice(at + MODULES.length).split('/');
        const name = scope.startsWith('@') ? `${scope}/${inScope}` : scope;
        packages.set(name, source.slice(0, at + MODULES.length).replace(/^\//, '') + name);
      }
    }
    return packages;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A line that names who holds the copyright: "Copyright (c) …" or "Copyright 2014 …", and neither a
 * sentence of the licence that starts with the word nor the blank line of a licence's template.
 */
const isCopyright = (line: string) =>
  /^\s*(copyright\s+(\(c\)|©|\d{4})|\(c\)\s*\d{4}|©)/i.test(line) &&
  !/\[yyyy\]|<year>|\[year\]/i.test(line);

/**
 * A line that only names one of the short licences, which libraries write in many ways. A long
 * licence, as Apache's, is shown whole, its heading with it.
 */
const isTitle = (line: string) =>
  /^[\s#]*(the\s+)?(mit|isc|bsd)\b.*licen[sc]e.*$/i.test(line) && line.trim().length < 60;

/**
 * A licence file's text without its copyright lines, as one licence reads for all its libraries;
 * without its title too, which stands at its head, unless `titled`.
 */
function withoutNotice(text: string, titled: boolean): string {
  let inHead = true;
  return text
    .split('\n')
    .filter((line) => {
      if (isCopyright(line) || /^all rights reserved\.?$/i.test(line.trim())) return false;
      if (line.trim() === '') return true;
      const title = inHead && isTitle(line);
      inHead &&= title;
      return titled || !title;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** What two texts of one licence have in common, however they are wrapped and quoted. */
const wording = (body: string) =>
  body
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * The texts of a package's licence files; none for a package that ships without one. A font's
 * package has a second file for the font itself, under a licence of its own.
 */
function licenceFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => /^(licen[sc]e|copying)([._]|$)/i.test(file))
    .sort()
    .map((file) => readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim());
}

const packages = bundledPackages();
// A library without a licence file names its licence in its package.json alone: it is listed
// under that licence's usual text, without copyright lines.
const byLicence = new Map<string, (Library & { body?: string })[]>();
const withoutFile: string[] = [];
for (const [name, dir] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
  const { version, license } = JSON.parse(
    readFileSync(join(ROOT, dir, 'package.json'), 'utf8'),
  ) as {
    version: string;
    license?: string;
  };
  if (!license) throw new Error(`${name} names no licence in its package.json`);
  const files = licenceFiles(join(ROOT, dir));
  if (files.length === 0) withoutFile.push(name);
  const copyright = files
    .flatMap((file) => file.split('\n'))
    .filter(isCopyright)
    .map((line) => line.trim());
  // Several files keep their titles, which say where one licence ends and the next begins.
  const body =
    files.length > 0
      ? files.map((file) => withoutNotice(file, files.length > 1)).join('\n\n')
      : undefined;
  byLicence.set(license, [...(byLicence.get(license) ?? []), { name, version, copyright, body }]);
}

const licences: Licence[] = [...byLicence]
  .map(([id, libraries]) => {
    // The wording most of the licence's libraries share is the licence's text.
    const counts = new Map<string, number>();
    for (const { body } of libraries) {
      if (body !== undefined) counts.set(wording(body), (counts.get(wording(body)) ?? 0) + 1);
    }
    const [usual] = [...counts].sort(([, a], [, b]) => b - a)[0] ?? [];
    const text = libraries.find(({ body }) => body !== undefined && wording(body) === usual)?.body;
    if (!text) {
      throw new Error(`No library under ${id} ships its text: add the licence's text by hand`);
    }
    return {
      id,
      text,
      libraries: libraries.map(({ body, ...library }) =>
        body === undefined || wording(body) === usual ? library : { ...library, text: body },
      ),
    };
  })
  .sort((a, b) => b.libraries.length - a.libraries.length || a.id.localeCompare(b.id));

writeFileSync(OUTPUT, `${JSON.stringify({ licences }, null, 2)}\n`);
const count = licences.reduce((sum, { libraries }) => sum + libraries.length, 0);
console.log(`Wrote ${count} libraries under ${licences.length} licences to ${OUTPUT}`);
if (withoutFile.length > 0) {
  console.log(`Without a licence file of their own: ${withoutFile.join(', ')}`);
}
