# 0176. Show videos of the exercises

- **Status:** Accepted
- **Date:** 2026-11-28

## Context

The exercise screen shows the muscles an exercise works on a body from the front and the back
(ADR 0162), but not how the movement goes. The library's pictures are gone for want of rights to
them (ADR 0163), and a 3D figure of the project's own was piloted in Blender (#706): it needed
much work per exercise, and its hands and face fell short.

Videos of the exercises are now made with generative video tools: a start frame of a character
in a gym, then four seconds of the movement, muted, 1920 × 1080. The character's face was
generated from scratch, no real person's, and the plan they are made under allows commercial use.
They come a few at a time, from a list of the library's exercises kept beside them, the most used
exercises first; 876 in all, at about 2.5 MB each.

## Decision

- **A video takes the place of the muscle map** on the exercise screen, for an exercise that has
  one; the others keep the map. It carries no name or caption. The screen is designed with a
  mock-up first (#757).
- **The app's copy is small:** 960 × 540 H.264 at 25 frames a second, muted, with its index at
  the front so it starts while it loads, and its first frame as a poster. That is about 150 KB a
  video and 50 KB a poster.
- **The files are in a public bucket, `exercise-media`,** named `<exercise id>/<hash>`, the hash
  of the original and the settings. A new take or new settings give a new name, so the files are
  cached for a year without going stale. No policy lets a client change the bucket.
- **The table `exercise_videos`** names each exercise's video and poster. Everyone reads it, as
  the library; only migrations write it.
- **`pnpm import:exercise-videos <folder>`** matches the ticked rows of the list to the library by their
  English name, makes the copies beside the originals, writes a migration for the new or changed
  ones, records them in `supabase/exercise-videos.json`, and uploads what the bucket lacks;
  `--remote` uploads to the hosted project after the merge.
- **The originals and the copies stay out of the repository.** It is public and would hand them
  out, and hundreds of videos would make every clone heavy.

## Alternatives considered

- **The 3D figure of #706:** fully the project's own, but each exercise needs its movement written
  and checked by hand, and the figure was not yet good enough.
- **The videos in the app's bundle:** no network needed, but every new video would wait for a
  store release, and the app would grow with each.
- **Videos in the repository, uploaded by the deploy workflow:** one source for everything, but a
  heavy repository that hands the videos out.
- **A column on `exercises`:** one table less, but `exercises` is the library's import, which
  `pnpm import:exercises` writes whole.
- **Animated WebP or a GIF:** plays everywhere without a video player, but several times larger
  for the same quality.

## Consequences

- Every batch is a small PR with its migration and the manifest, then Deploy Supabase and the
  upload. Installed apps show the new videos without an update.
- Showing the videos needs a video player in the app, and so a new build.
- Storage grows by about 200 KB an exercise, some 175 MB for the whole library; the phones cache
  what they play.
- Old builds do not read the table and keep the map (ADR 0157).
