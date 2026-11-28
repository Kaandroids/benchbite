// Brings the exercises' videos into the app (ADR 0176), a batch at a time. The videos are made
// outside the repository, in a folder with a list of the exercises (`Hareket_Listesi.md`), in
// which a finished video's row is ticked (✅) and names its file. For each ticked video this
// script:
//
// - finds its exercise by the name in the list's English column;
// - makes the app's copy beside the originals, in `<folder>/app/`: 960 × 540 H.264, muted, ready
//   to stream, and its first frame as the poster, both named by a hash of the original and the
//   settings, so that a new take or new settings give new names that no phone has cached;
// - for the videos that are new or changed, writes a migration into `exercise_videos` and records
//   them in supabase/exercise-videos.json;
// - uploads to the exercise-media bucket the files it does not have yet.
//
//   pnpm import:exercise-videos <folder>            the local stack: migration, manifest and upload
//   pnpm import:exercise-videos <folder> --remote   the hosted project: only the upload, after the merge
//
// It needs ffmpeg, and the local stack running for the exercises' names.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { DB_CONTAINER } from './lib/local-stack.ts';
import { MIGRATIONS_DIR, sqlString, timestamp } from './lib/migration.ts';

const ROOT = join(import.meta.dirname, '..');
const MANIFEST = join(ROOT, 'supabase', 'exercise-videos.json');
const SUPABASE = join(ROOT, 'node_modules', '.bin', 'supabase');
const BUCKET = 'exercise-media';
const LIST = 'Hareket_Listesi.md';

/** How the app's copy is made; a change here gives every video a new name. */
const VIDEO_ARGS = [
  '-an',
  '-vf',
  'scale=960:540:flags=lanczos,fps=25',
  '-c:v',
  'libx264',
  '-profile:v',
  'high',
  '-pix_fmt',
  'yuv420p',
  '-crf',
  '26',
  '-preset',
  'slow',
  '-movflags',
  '+faststart',
];
const POSTER_ARGS = ['-frames:v', '1', '-vf', 'scale=960:540:flags=lanczos', '-q:v', '4'];

/** A video in the app: its files in the bucket, and the original it was made from. */
type Entry = { source: string; video: string; poster: string };
type Manifest = Record<string, Entry>;

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const folder = args.find((arg) => !arg.startsWith('--'));
if (!folder) {
  console.error('Usage: pnpm import:exercise-videos <folder> [--remote]');
  process.exit(1);
}
const output = join(folder, 'app');

/** The finished videos in the list: the English name of each and its file. */
function finished(): { name: string; file: string }[] {
  const rows = readFileSync(join(folder!, LIST), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('|') && line.includes('✅'));
  return rows.map((line) => {
    // | # | Status | Name (EN) | Name (TR) | Equipment | Muscle | Video file |
    const cells = line.split('|').map((cell) => cell.trim());
    const name = cells[3]!.replace('⭐', '').trim();
    const file = cells[7] ?? '';
    if (!file) {
      throw new Error(`${name} is ticked in ${LIST} without a video file.`);
    }
    return { name, file };
  });
}

/** The library's exercises by their English name, from the local stack. */
function exerciseIds(): Map<string, string> {
  const rows = execFileSync(
    'docker',
    [
      'exec',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-At',
      '-F',
      '\t',
      '-c',
      'select name, id from public.exercises where owner_id is null',
    ],
    { encoding: 'utf8' },
  );
  return new Map(
    rows
      .trim()
      .split('\n')
      .map((row) => row.split('\t') as [string, string]),
  );
}

function readManifest(): Manifest {
  return existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest) : {};
}

/** The app's copy of a video and its poster, made unless they are there already. */
function make(id: string, source: string): Entry {
  const original = join(folder!, source);
  const hash = createHash('sha256')
    .update(readFileSync(original))
    .update(JSON.stringify([VIDEO_ARGS, POSTER_ARGS]))
    .digest('hex')
    .slice(0, 16);
  const entry = { source, video: `${id}/${hash}.mp4`, poster: `${id}/${hash}.jpg` };
  const video = join(output, entry.video);
  const poster = join(output, entry.poster);
  mkdirSync(dirname(video), { recursive: true });
  if (!existsSync(video)) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', original, ...VIDEO_ARGS, video]);
  }
  if (!existsSync(poster)) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', original, ...POSTER_ARGS, poster]);
  }
  return entry;
}

/** Writes the migration of the new or changed videos, after every migration there is. */
function writeMigration(changed: [string, Entry][]) {
  const now = timestamp();
  const last = readdirSync(MIGRATIONS_DIR).sort().at(-1)?.slice(0, 14) ?? '';
  const stamp = now > last ? now : String(BigInt(last) + 1n);
  const values = changed
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([id, entry]) =>
        `  (${sqlString(id)}, ${sqlString(entry.video)}, ${sqlString(entry.poster)})`,
    )
    .join(',\n');
  const file = join(MIGRATIONS_DIR, `${stamp}_exercise_videos.sql`);
  writeFileSync(
    file,
    `-- Videos of ${changed.length} exercise${changed.length === 1 ? '' : 's'}, written by \`pnpm import:exercise-videos\` (ADR 0176).
insert into public.exercise_videos (exercise_id, video_path, poster_path)
values
${values}
on conflict (exercise_id) do update
  set video_path = excluded.video_path, poster_path = excluded.poster_path;
`,
  );
  console.log(`Wrote ${file.slice(ROOT.length + 1)}`);
}

/**
 * The Supabase CLI on the local stack, or on the hosted project with `--remote`, whose changes
 * the CLI asks to confirm: running the script with `--remote` is that confirmation.
 */
function supabase(...command: string[]): string {
  const target = remote ? ['--remote', '--yes'] : [];
  return execFileSync(SUPABASE, [...command, '--experimental', ...target], {
    encoding: 'utf8',
  });
}

/** Uploads every file of the manifest that the bucket does not have yet. */
function upload(manifest: Manifest) {
  const listed = supabase('storage', 'ls', '-r', `ss:///${BUCKET}/`);
  const files = Object.values(manifest).flatMap((entry) => [entry.video, entry.poster]);
  const missing = files.filter((file) => !listed.includes(file));
  for (const file of missing) {
    supabase(
      'storage',
      'cp',
      join(output, file),
      `ss:///${BUCKET}/${file}`,
      '--content-type',
      file.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg',
      // Named by their content, the files never change.
      '--cache-control',
      'public, max-age=31536000, immutable',
    );
  }
  console.log(
    `Uploaded ${missing.length} of ${files.length} files to ${remote ? 'the hosted project' : 'the local stack'}.`,
  );
}

/**
 * Checks that every recorded video can be uploaded: its copies are in `<folder>/app/`, or are made
 * again from its original, which must still be the one recorded. A copy that is there already is
 * trusted, as its name carries the hash, so old originals may be cleaned out once their copies exist.
 */
function check(manifest: Manifest) {
  for (const [id, entry] of Object.entries(manifest)) {
    if (existsSync(join(output, entry.video)) && existsSync(join(output, entry.poster))) {
      continue;
    }
    if (!existsSync(join(folder!, entry.source))) {
      throw new Error(
        `The copy of ${id}'s video is missing, and so is its original ${entry.source}.`,
      );
    }
    if (make(id, entry.source).video !== entry.video) {
      throw new Error(`${entry.source} is not the video recorded for ${id}.`);
    }
  }
}

const manifest = readManifest();
if (!remote) {
  const ids = exerciseIds();
  const changed: [string, Entry][] = [];
  for (const { name, file } of finished()) {
    const id = ids.get(name);
    if (!id) {
      throw new Error(`No exercise of the library is named ${name}.`);
    }
    const entry = make(id, file);
    if (manifest[id]?.video !== entry.video) {
      changed.push([id, entry]);
    }
    manifest[id] = entry;
  }
  // Before anything is written, so that a batch is recorded only when all of it can be uploaded.
  check(manifest);
  if (changed.length > 0) {
    writeMigration(changed);
    const sorted = Object.fromEntries(
      Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
    );
    writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log(
      `${changed.length} new or changed videos recorded in supabase/exercise-videos.json.`,
    );
  } else {
    console.log('No new or changed videos.');
  }
} else {
  check(manifest);
}
upload(manifest);
