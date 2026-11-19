// Reports how much of the app and of the Edge Functions the tests run, from what
// `pnpm test --coverage` and `pnpm functions:check` leave in coverage/: a table for the pull
// request's checks, a badge of each for the README, and a failure when the Edge Functions fall
// under their thresholds. The app's thresholds are Jest's own (jest.config.js). Run with
// `pnpm coverage:report`.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const COVERAGE_DIR = join(ROOT, 'coverage');
/** Jest's `json-summary` of the app. */
const APP_SUMMARY = join(COVERAGE_DIR, 'coverage-summary.json');
/** Deno's lcov of the Edge Functions, which `deno test --coverage` writes beside its profiles. */
const FUNCTIONS_LCOV = join(COVERAGE_DIR, 'functions', 'lcov.info');
const BADGES_DIR = join(COVERAGE_DIR, 'badges');

/**
 * The least of the Edge Functions that tests must run, in percent, set just under the coverage
 * when they were added. Only the files a test loads count, which leaves out each function's
 * index.ts: it only joins its handler to the runtime.
 */
const FUNCTIONS_THRESHOLDS = { lines: 96, functions: 97, branches: 92 } as const;

type Metric = keyof typeof FUNCTIONS_THRESHOLDS;
const METRICS: Metric[] = ['lines', 'functions', 'branches'];

/** How many there are of a kind, and how many of them tests ran. */
type Count = { total: number; covered: number };
type Coverage = Record<Metric, Count>;

const none = (): Coverage => ({
  lines: { total: 0, covered: 0 },
  functions: { total: 0, covered: 0 },
  branches: { total: 0, covered: 0 },
});

function add(to: Coverage, from: Coverage) {
  for (const metric of METRICS) {
    to[metric].total += from[metric].total;
    to[metric].covered += from[metric].covered;
  }
}

/** The share covered in percent; all of nothing counts as covered. */
const percent = ({ total, covered }: Count) => (total === 0 ? 100 : (covered / total) * 100);

/** The coverage of each file under `root`, by its path from there. */
type Files = Map<string, Coverage>;

/** Reads Jest's summary: one entry per file, and one for the total, which is left out. */
function readAppSummary(path: string, root: string): Files {
  const summary = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Coverage>;
  const files: Files = new Map();
  for (const [file, coverage] of Object.entries(summary)) {
    if (file !== 'total') {
      files.set(relative(root, file), coverage);
    }
  }
  return files;
}

/** Reads an lcov file: a record per source file, with its totals in the lines named below. */
function readLcov(path: string, root: string): Files {
  const fields: Record<string, [Metric, keyof Count]> = {
    LF: ['lines', 'total'],
    LH: ['lines', 'covered'],
    FNF: ['functions', 'total'],
    FNH: ['functions', 'covered'],
    BRF: ['branches', 'total'],
    BRH: ['branches', 'covered'],
  };
  const files: Files = new Map();
  let current = none();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const [name, value = ''] = line.split(':', 2);
    const field = name === undefined ? undefined : fields[name];
    if (name === 'SF') {
      current = none();
      files.set(relative(root, line.slice(3)), current);
    } else if (field) {
      current[field[0]][field[1]] = Number(value);
    }
  }
  return files;
}

/** The coverage of all files together. */
function totalOf(files: Files): Coverage {
  const total = none();
  for (const coverage of files.values()) add(total, coverage);
  return total;
}

/** The coverage of each top folder, with the files beside the folders as `.`, by name. */
function byFolder(files: Files): [string, Coverage][] {
  const folders = new Map<string, Coverage>();
  for (const [file, coverage] of files) {
    const parts = file.split(sep);
    const folder = parts.length > 1 ? (parts[0] ?? '.') : '.';
    const sum = folders.get(folder) ?? none();
    add(sum, coverage);
    folders.set(folder, sum);
  }
  return [...folders].sort(([a], [b]) => a.localeCompare(b));
}

const cell = (count: Count) => `${percent(count).toFixed(1)}%`;
const row = (name: string, coverage: Coverage) =>
  `| ${name} | ${METRICS.map((metric) => cell(coverage[metric])).join(' | ')} |`;
const HEAD = ['| | Lines | Functions | Branches |', '| --- | ---: | ---: | ---: |'];

/** A folded table of a part's folders, for finding where the coverage is thin. */
function folderTable(title: string, files: Files): string[] {
  return [
    `<details><summary>${title}</summary>`,
    '',
    ...HEAD,
    ...byFolder(files).map(([folder, coverage]) => row(`\`${folder}\``, coverage)),
    '',
    '</details>',
  ];
}

/** What shields.io draws a badge from (its endpoint schema): the lines covered, by colour. */
function badge(label: string, coverage: Coverage) {
  const lines = percent(coverage.lines);
  const color =
    lines >= 90 ? 'brightgreen' : lines >= 80 ? 'green' : lines >= 70 ? 'yellow' : 'red';
  return { schemaVersion: 1, label, message: `${Math.floor(lines)}%`, color };
}

for (const [path, command] of [
  [APP_SUMMARY, 'pnpm test --coverage'],
  [FUNCTIONS_LCOV, 'pnpm functions:check'],
] as const) {
  if (!existsSync(path)) {
    console.error(`No ${relative(ROOT, path)}: run \`${command}\` first.`);
    process.exit(1);
  }
}

const app = readAppSummary(APP_SUMMARY, join(ROOT, 'src'));
const functions = readLcov(FUNCTIONS_LCOV, join(ROOT, 'supabase/functions'));
const appTotal = totalOf(app);
const functionsTotal = totalOf(functions);

const report = [
  '## Test coverage',
  '',
  ...HEAD,
  row('App (`src`)', appTotal),
  row('Edge Functions (`supabase/functions`)', functionsTotal),
  '',
  ...folderTable('The app by folder', app),
  '',
  ...folderTable('The Edge Functions by folder', functions),
  '',
].join('\n');

console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}

mkdirSync(BADGES_DIR, { recursive: true });
for (const [name, label, coverage] of [
  ['app', 'app coverage', appTotal],
  ['functions', 'functions coverage', functionsTotal],
] as const) {
  writeFileSync(join(BADGES_DIR, `${name}.json`), `${JSON.stringify(badge(label, coverage))}\n`);
}

const short = METRICS.filter(
  (metric) => percent(functionsTotal[metric]) < FUNCTIONS_THRESHOLDS[metric],
);
for (const metric of short) {
  console.error(
    `The Edge Functions' coverage of ${metric} is ${cell(functionsTotal[metric])}, under the threshold of ${FUNCTIONS_THRESHOLDS[metric]}%.`,
  );
}
if (short.length > 0) {
  process.exit(1);
}
