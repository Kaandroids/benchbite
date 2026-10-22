// Imports the free-exercise-db exercise library (public domain) at a pinned commit:
//
// - converts its images to WebP in supabase/storage/exercise-images/, which local Supabase
//   uploads to the exercise-images bucket, and
// - writes a migration that inserts or updates every exercise with its metrics and the
//   translated names from supabase/data/exercise-names.json.
//
// Run with `pnpm import:exercises`. To update the library, change UPSTREAM_COMMIT, run the
// script again and commit the new migration and images.
//
// `pnpm import:exercises --names-only` writes a small migration with only the translated names,
// for when exercise-names.json changes but the library does not.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

import type { Database } from '../src/lib/database.types.ts';

const UPSTREAM_COMMIT = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5';
const UPSTREAM = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${UPSTREAM_COMMIT}`;

/** Wide enough for a phone screen; the source images are 850 px wide. */
const IMAGE_WIDTH = 600;
const IMAGE_QUALITY = 75;
const PARALLEL_DOWNLOADS = 8;

const ROOT = join(import.meta.dirname, '..');
const IMAGES_DIR = join(ROOT, 'supabase', 'storage', 'exercise-images');
const NAMES_FILE = join(ROOT, 'supabase', 'data', 'exercise-names.json');
const METRICS_FILE = join(ROOT, 'supabase', 'data', 'exercise-metrics.json');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

type UpstreamExercise = {
  id: string;
  name: string;
  level: string;
  category: string;
  equipment: string | null;
  force: string | null;
  mechanic: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  /** Relative to the exercises/ folder, such as 'Barbell_Squat/0.jpg'. */
  images: string[];
};

type TranslatedNames = Record<string, { de: string; tr: string }>;

type Metric = Database['public']['Enums']['exercise_metric'];

/** Equipment that adds no weight to measure. */
const UNWEIGHTED_EQUIPMENT = new Set([null, 'body only', 'bands', 'exercise ball']);

/**
 * The metrics most exercises of a kind record. Exceptions are listed in
 * supabase/data/exercise-metrics.json.
 */
function defaultMetrics(exercise: UpstreamExercise): Metric[] {
  if (exercise.category === 'stretching' || exercise.equipment === 'foam roll') {
    return ['duration'];
  }
  if (exercise.category === 'cardio') {
    return ['distance', 'duration'];
  }
  // Holds such as planks and isometric exercises.
  if (exercise.force === 'static') {
    return ['duration'];
  }
  // Jumps and bounds on boxes, hurdles and cones are counted, not weighed.
  if (
    UNWEIGHTED_EQUIPMENT.has(exercise.equipment) ||
    (exercise.category === 'plyometrics' && exercise.equipment === 'other')
  ) {
    return ['reps'];
  }
  return ['weight', 'reps'];
}

async function fetchExercises(): Promise<UpstreamExercise[]> {
  const response = await fetch(`${UPSTREAM}/dist/exercises.json`);
  if (!response.ok) {
    throw new Error(`Could not download the exercises: ${response.status}`);
  }
  return (await response.json()) as UpstreamExercise[];
}

/** 'Barbell_Squat/0.jpg' becomes 'Barbell_Squat/0.webp'. */
function webpPath(image: string): string {
  return image.replace(/\.jpg$/, '.webp');
}

async function convertImage(image: string): Promise<void> {
  const target = join(IMAGES_DIR, webpPath(image));
  // Images are converted from a pinned commit, so existing files are already up to date.
  if (existsSync(target)) {
    return;
  }
  const response = await fetch(`${UPSTREAM}/exercises/${image}`);
  if (!response.ok) {
    throw new Error(`Could not download ${image}: ${response.status}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  await sharp(Buffer.from(await response.arrayBuffer()))
    .resize({ width: IMAGE_WIDTH, withoutEnlargement: true })
    .webp({ quality: IMAGE_QUALITY })
    .toFile(target);
}

async function convertImages(images: string[]): Promise<void> {
  const queue = [...images];
  const worker = async () => {
    for (let image = queue.shift(); image !== undefined; image = queue.shift()) {
      await convertImage(image);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_DOWNLOADS }, worker));
}

function sqlString(value: string | null): string {
  return value === null ? 'null' : `'${value.replaceAll("'", "''")}'`;
}

function sqlArray(values: string[], type: string): string {
  return `array[${values.map(sqlString).join(', ')}]::${type}[]`;
}

function exerciseRow(exercise: UpstreamExercise, metrics: Metric[]): string {
  return `  (${[
    sqlString(exercise.id),
    sqlString(exercise.name),
    sqlString(exercise.level),
    sqlString(exercise.category),
    sqlString(exercise.equipment),
    sqlString(exercise.force),
    sqlString(exercise.mechanic),
    sqlArray(exercise.primaryMuscles, 'public.muscle'),
    sqlArray(exercise.secondaryMuscles, 'public.muscle'),
    sqlArray(exercise.instructions, 'text'),
    sqlArray(exercise.images.map(webpPath), 'text'),
    sqlArray(metrics, 'public.exercise_metric'),
  ].join(', ')})`;
}

const HEADER = `-- Generated by scripts/import-exercises.ts from free-exercise-db at commit
-- ${UPSTREAM_COMMIT}. Do not edit by hand.
`;

function exercisesSql(
  exercises: UpstreamExercise[],
  metricOverrides: Record<string, Metric[]>,
): string {
  return `
insert into public.exercises (
  id, name, level, category, equipment, force, mechanic,
  primary_muscles, secondary_muscles, instructions, image_paths, metrics
)
values
${exercises
  .map((exercise) =>
    exerciseRow(exercise, metricOverrides[exercise.id] ?? defaultMetrics(exercise)),
  )
  .join(',\n')}
on conflict (id) do update set
  name = excluded.name,
  level = excluded.level,
  category = excluded.category,
  equipment = excluded.equipment,
  force = excluded.force,
  mechanic = excluded.mechanic,
  primary_muscles = excluded.primary_muscles,
  secondary_muscles = excluded.secondary_muscles,
  instructions = excluded.instructions,
  image_paths = excluded.image_paths,
  metrics = excluded.metrics;
`;
}

function translationsSql(names: TranslatedNames): string {
  const translations = Object.entries(names).flatMap(([id, byLanguage]) =>
    Object.entries(byLanguage).map(
      ([language, name]) => `  (${[id, language, name].map(sqlString).join(', ')})`,
    ),
  );
  return `
insert into public.exercise_translations (exercise_id, language, name)
values
${translations.join(',\n')}
on conflict (exercise_id, language) do update set name = excluded.name;
`;
}

/** A migration timestamp in the Supabase CLI's format, such as 20261020215835. */
function timestamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

const exercises = (await fetchExercises()).sort((a, b) => a.id.localeCompare(b.id));
const names = JSON.parse(readFileSync(NAMES_FILE, 'utf8')) as TranslatedNames;

const metricOverrides = JSON.parse(readFileSync(METRICS_FILE, 'utf8')) as Record<string, Metric[]>;

const ids = new Set(exercises.map((exercise) => exercise.id));
for (const [file, entries] of [
  ['exercise-names.json', names],
  ['exercise-metrics.json', metricOverrides],
] as const) {
  const unknown = Object.keys(entries).filter((id) => !ids.has(id));
  if (unknown.length > 0) {
    throw new Error(`${file} has unknown exercises: ${unknown.join(', ')}`);
  }
}

if (process.argv.includes('--names-only')) {
  const file = join(MIGRATIONS_DIR, `${timestamp()}_import_exercise_names.sql`);
  writeFileSync(file, HEADER + translationsSql(names));
  console.log(`Wrote ${Object.keys(names).length} names to ${file}`);
} else {
  const images = exercises.flatMap((exercise) => exercise.images);
  console.log(`Converting ${images.length} images…`);
  await convertImages(images);

  const file = join(MIGRATIONS_DIR, `${timestamp()}_import_exercises.sql`);
  writeFileSync(file, HEADER + exercisesSql(exercises, metricOverrides) + translationsSql(names));
  console.log(
    `Wrote ${exercises.length} exercises and ${Object.keys(names).length} names to ${file}`,
  );
}
