# 0163. Take the exercise pictures out

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

The exercise library was imported with its pictures (ADR 0008): 1,746 files in
`supabase/storage/exercise-images/`, uploaded to a public bucket of the same name, with their
paths in `exercises.image_paths`.

The rights to those pictures are not known (#702). free-exercise-db is a reworking of
wrkout/exercises.json, whose own notes say the pictures were gathered from the internet and
advise against commercial use; the owner of free-exercise-db does not know where they are from.
A licence covers only what its author owns, so the Unlicense of either collection gives no right
to them.

The app shows a muscle map in their place since ADR 0162 and asks for no picture of the library.
The pictures were still in the repository, which is public and so hands them out itself, and in
the bucket of the hosted project.

## Decision

- **The files leave the repository.** `supabase/storage/exercise-images/` is deleted, the local
  stack no longer uploads it, and `pnpm import:exercises` no longer downloads or converts
  pictures.
- **The files leave the bucket.** The hosted bucket is emptied through the Storage API. The
  deploy workflow loses its step that uploaded the pictures.
- **The library's rows name no pictures.** A migration empties `image_paths` for every exercise
  without an owner, and the import writes it empty. A build from before ADR 0162 then shows an
  exercise without pictures, where it would have shown broken ones.
- **The column and the bucket stay.** `image_paths` holds the photos of the users' own exercises
  (ADR 0027). The bucket stays, empty: storage refuses to have its tables deleted from by SQL, a
  migration is the only thing every environment runs, and an empty bucket gives nothing away.
- **The credit says what holds.** The README and the licences screen name free-exercise-db for
  the exercises' names, muscles, equipment and steps, under the licence it publishes them with,
  and say that its pictures are not used.
- **The history is left as it is.** The pictures remain in commits before this one. Rewriting
  the history would change every commit since October and break every clone, branch and link to
  a commit; it stays possible later, and is the next step if someone with a right to a picture
  asks for it.

This amends ADR 0008, which committed the pictures, and ADR 0030, whose workflow uploaded them.

## Alternatives considered

- **Keep the files until the oldest supported build no longer shows them:** nobody uses such a
  build yet, as the app is not released, and every day the repository hands the pictures out.
- **Delete the bucket:** only possible through the Storage API, by hand in each environment, so
  environments would differ; it holds nothing once emptied.
- **Leave `image_paths` filled:** older builds would ask for files that are gone and show empty
  frames.
- **Rewrite the history now:** takes the pictures out of the repository for good, at the price
  above; left as a step to take if it is needed.

## Consequences

- The repository is about 35 MB lighter for a fresh checkout of the files, though not for a
  clone, which still fetches the history.
- A fresh clone needs nothing but the migrations for the library, and a deploy has no picture
  step to remember.
- The steps of each exercise come from the same collection; whether they are reworded is decided
  in #702.
- A local stack started before this keeps its uploaded pictures until its storage is reset;
  nothing reads them.
