// The watch's side of the protocol's fixtures in src/watch/fixtures (#541), on a Mac with Xcode:
// compiles the watch's Protocol.swift with scripts/watch-check/main.swift, then checks that the
// watch reads every field of each state the phone sends, but those it leaves to the phone, and
// that the commands it makes are the fixtures'. `--write` writes the commands' fixture instead.
// Jest checks the phone's side (src/watch/protocol-fixtures.test.ts).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const FIXTURES = join(ROOT, 'src/watch/fixtures');
const COMMANDS = join(FIXTURES, 'commands.json');

/**
 * What the phone sends that the watch leaves to it, by path, `[]` standing for any item of a list:
 * the plan's target beyond its time, which the watch shows beside a clock.
 */
const LEFT_TO_THE_PHONE = ['workout.exercises[].target.reps', 'workout.exercises[].target.meters'];

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The paths of `sent` the watch did not read back, or read back as something else. */
function unread(sent: Json, read: Json | undefined, path: string): string[] {
  if (LEFT_TO_THE_PHONE.includes(path)) return [];
  // A value the phone sends as null, the watch reads as none and writes back as nothing.
  if (sent === null) return read === null || read === undefined ? [] : [path];
  if (Array.isArray(sent)) {
    if (!Array.isArray(read) || read.length !== sent.length) return [path];
    return sent.flatMap((item, index) => unread(item, read[index], `${path}[]`));
  }
  if (typeof sent === 'object') {
    if (read === null || typeof read !== 'object' || Array.isArray(read)) return [path];
    return Object.entries(sent).flatMap(([key, value]) =>
      unread(value, read[key], path ? `${path}.${key}` : key),
    );
  }
  return sent === read ? [] : [path];
}

const build = mkdtempSync(join(tmpdir(), 'watch-check-'));
const binary = join(build, 'watch-check');
execFileSync(
  'xcrun',
  [
    'swiftc',
    '-o',
    binary,
    ...['Protocol', 'L10n', 'Strings'].map((file) => join(ROOT, `targets/watch/${file}.swift`)),
    join(ROOT, 'scripts/watch-check/main.swift'),
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);
const output = JSON.parse(execFileSync(binary, [FIXTURES], { encoding: 'utf8' })) as {
  states: Record<string, Json>;
  commands: Json[];
};

const problems: string[] = [];
const names = Object.keys(output.states);
if (names.length === 0) problems.push('No state fixture was read.');
for (const name of names) {
  const sent = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as Json;
  for (const path of unread(sent, output.states[name], '')) {
    problems.push(`${name}: the watch does not read ${path}`);
  }
}

if (process.argv.includes('--write')) {
  writeFileSync(COMMANDS, `${JSON.stringify(output.commands, null, 2)}\n`);
  execFileSync('pnpm', ['exec', 'prettier', '--write', COMMANDS], { stdio: 'ignore' });
  console.log('Wrote src/watch/fixtures/commands.json');
} else if (
  JSON.stringify(JSON.parse(readFileSync(COMMANDS, 'utf8'))) !== JSON.stringify(output.commands)
) {
  problems.push(
    'The watch makes other commands than src/watch/fixtures/commands.json: run `pnpm check:watch --write`.',
  );
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`The watch reads ${names.length} states and makes the commands of the fixtures.`);
