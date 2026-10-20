# 0008. Import free-exercise-db as the exercise library

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

Workout plans need an exercise library with equipment, difficulty, muscles, instructions and
images. The library must be the same in every environment, readable by every user including
guests, and changeable only by us. The images should not depend on a third party staying
online or keeping its repository layout.

## Decision

- **Source:** [free-exercise-db](https://github.com/yuhonas/free-exercise-db), about 870
  exercises with two images each, released into the public domain.
- **Pinned import:** `scripts/import-exercises.ts` downloads the data and images from a fixed
  upstream commit, so every run produces the same result.
- **Data as a migration:** the script writes a migration that inserts or updates every
  exercise. Migrations reach local and hosted databases alike, while `seed.sql` would only
  reach local ones. Updating the library means changing the pinned commit and generating a new
  migration.
- **Schema:** `exercises` keeps the upstream id and fields. Fixed sets of values, such as level,
  equipment and muscles, are Postgres enums, so that the generated TypeScript types list them.
  Translated names live in `exercise_translations`, one row per exercise and language; untranslated
  exercises fall back to English. Instructions are English only for now.
- **Access:** row level security allows everyone to read both tables, with no write policies
  and write privileges revoked.
- **Images:** converted to WebP at 600 px wide and quality 75 with `sharp`, which shrinks them
  from 94 MB to about 32 MB. They are committed in `supabase/storage/exercise-images/`, served
  from a public, read-only Storage bucket created by a migration, and uploaded to the local
  stack by `config.toml`.

## Alternatives considered

- **wger:** a larger, multilingual library, but each entry has its own Creative Commons
  licence, so licence terms and attribution would have to be tracked per exercise.
- **ExerciseDB:** a commercial API with usage limits and licensing terms for its media.
- **Bundling the library in the app,** as JSON with images loaded from GitHub: works offline, but
  the library could not change without an app release and images would depend on the upstream
  repository.
- **Downloading the images at setup instead of committing them:** keeps the repository smaller,
  but every developer and environment would depend on GitHub and on a conversion step.
- **Check constraints instead of enums:** easier to change, but generated types would only say
  `string`.

## Consequences

- A fresh clone has everything `supabase db reset` needs, with no network access.
- Each regeneration of the images adds their size to the Git history, so the library is only
  updated when there is a reason to.
- The hosted project needs the images uploaded once with `supabase seed buckets --project-ref <ref>`.
- Exercise names in German and Turkish cover the common exercises; more are added as the plan
  builder needs them. Credits are in the README and will be shown in the app (#29).
