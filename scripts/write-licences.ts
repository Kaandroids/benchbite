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

const ROOT = join(import.meta.dirname, '..');
const OUTPUT = join(ROOT, 'src/licences/libraries.json');
const MODULES = 'node_modules/';

type Library = {
  name: string;
  version: string;
  /** The copyright lines of the library's licence file. */
  copyright: string[];
  /** The library's own licence text, when it differs from its licence's usual one. */
  text?: string;
};
type Licence = {
  /** The licence as the libraries name it, such as "MIT". */
  id: string;
  /** The licence's text, without any library's copyright lines. */
  text: string;
  libraries: Library[];
};

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

/** A line that only names the licence, which libraries write in many ways. */
const isTitle = (line: string) =>
  /^[\s#]*(the\s+)?(mit|isc|bsd|apache)\b.*licen[sc]e.*$/i.test(line) && line.trim().length < 60;

/** A licence file's text without its copyright lines and its title, as one licence reads for all. */
function withoutNotice(text: string): string {
  return text
    .split('\n')
    .filter(
      (line) =>
        !isCopyright(line) && !isTitle(line) && !/^all rights reserved\.?$/i.test(line.trim()),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** What two texts of one licence have in common, however they are wrapped and quoted. */
const wording = (text: string) =>
  withoutNotice(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * The text of a package's licence file, or nothing for a package that ships without one. A font's
 * package has a second file for the font itself, under a licence of its own: both are the text.
 */
function licenceFile(dir: string): string | undefined {
  const texts = readdirSync(dir)
    .filter((file) => /^(licen[sc]e|copying)([._]|$)/i.test(file))
    .sort()
    .map((file) => readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim());
  return texts.length > 0 ? texts.join('\n\n') : undefined;
}

const packages = bundledPackages();
// A library without a licence file names its licence in its package.json alone: it is listed
// under that licence's usual text, without copyright lines.
const byLicence = new Map<string, (Library & { full?: string })[]>();
const withoutFile: string[] = [];
for (const [name, dir] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
  const { version, license } = JSON.parse(
    readFileSync(join(ROOT, dir, 'package.json'), 'utf8'),
  ) as {
    version: string;
    license?: string;
  };
  if (!license) throw new Error(`${name} names no licence in its package.json`);
  const full = licenceFile(join(ROOT, dir));
  if (full === undefined) withoutFile.push(name);
  const copyright = (full ?? '')
    .split('\n')
    .filter(isCopyright)
    .map((line) => line.trim());
  byLicence.set(license, [...(byLicence.get(license) ?? []), { name, version, copyright, full }]);
}

const licences: Licence[] = [...byLicence]
  .map(([id, libraries]) => {
    // The wording most of the licence's libraries share is the licence's text.
    const counts = new Map<string, number>();
    for (const { full } of libraries) {
      if (full !== undefined) counts.set(wording(full), (counts.get(wording(full)) ?? 0) + 1);
    }
    const [usual] = [...counts].sort(([, a], [, b]) => b - a)[0] ?? [];
    const withUsual = libraries.find(({ full }) => full !== undefined && wording(full) === usual);
    if (!withUsual?.full) {
      throw new Error(`No library under ${id} ships its text: add the licence's text by hand`);
    }
    return {
      id,
      text: withoutNotice(withUsual.full),
      libraries: libraries.map(({ full, ...library }) =>
        full === undefined || wording(full) === usual
          ? library
          : { ...library, text: withoutNotice(full) },
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
