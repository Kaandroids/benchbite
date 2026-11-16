// The watch's side of the protocol's fixtures in src/watch/fixtures (#541), on a Mac with Xcode:
// compiles the watch's Protocol.swift with scripts/watch-check/main.swift, then checks that the
// watch reads every field of each state the phone sends, but those it leaves to the phone, that
// every field it reads has a value in a fixture, and that the commands it makes are the fixtures'.
// A field without a value is given one in the states of src/watch/protocol-fixtures.test.ts, then
// written with `pnpm watch:fixtures`. `--write` writes the commands' fixture instead.
// Jest checks the phone's side (src/watch/protocol-fixtures.test.ts).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// The watch's files that need no SwiftUI, WatchKit or WatchConnectivity, as the watch's tests link
// them (targets/watch-tests): one list for both.
const LOGIC = join(ROOT, 'targets/watch-tests/Sources/WatchLogic');
const logic = readdirSync(LOGIC)
  .filter((file) => file.endsWith('.swift'))
  .map((file) => join(LOGIC, file));

const build = mkdtempSync(join(tmpdir(), 'watch-check-'));
const binary = join(build, 'watch-check');
execFileSync(
  'xcrun',
  ['swiftc', '-o', binary, ...logic, join(ROOT, 'scripts/watch-check/main.swift')],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);
const output = JSON.parse(execFileSync(binary, [FIXTURES], { encoding: 'utf8' })) as {
  states: Record<string, Json>;
  read: string[];
  commands: Json[];
};

/** The values at `path` in `json`, `[]` standing for every item of a list and `*` for any key. */
function valuesAt(json: Json | undefined, path: string[]): Json[] {
  if (path.length === 0) return json === undefined ? [] : [json];
  const [step, ...rest] = path as [string, ...string[]];
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return [];
  if (step === '*') return Object.values(json).flatMap((value) => valuesAt(value, rest));
  if (step.endsWith('[]')) {
    const list = json[step.slice(0, -2)];
    return Array.isArray(list) ? list.flatMap((item) => valuesAt(item, rest)) : [];
  }
  return valuesAt(json[step], rest);
}

const problems: string[] = [];
const names = Object.keys(output.states);
if (names.length === 0) problems.push('No state fixture was read.');
const sentStates = Object.fromEntries(
  names.map((name) => [name, JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as Json]),
);
for (const [name, sent] of Object.entries(sentStates)) {
  for (const path of unread(sent, output.states[name], '')) {
    problems.push(`${name}: the watch does not read ${path}`);
  }
}

// Every field the watch reads has a value in a fixture: one the phone stopped sending, or sent as
// null, or as an empty list whose items' fields go unlisted, in every fixture would go unchecked.
const hasValue = (value: Json) =>
  value !== null && !(typeof value === 'object' && Object.keys(value).length === 0);
for (const path of output.read) {
  const values = Object.values(sentStates).flatMap((state) => valuesAt(state, path.split('.')));
  if (!values.some(hasValue)) {
    problems.push(`No fixture has a value for ${path}, which the watch reads`);
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
