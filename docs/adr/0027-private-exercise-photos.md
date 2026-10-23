# 0027. Keep the photos of custom exercises private, shown through signed URLs

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

A custom exercise (ADR 0026) can have a photo of the start and of the end of a rep, as library
exercises have pictures. People take these photos of themselves, often in a gym. The library's
pictures are in a public bucket, `exercise-images`. Custom exercises may be shared later.

## Decision

- **The photos go in a private bucket, `exercise-photos`,** one folder per user named after
  their id. Each user can only read, upload and delete files in their own folder. The bucket
  only takes JPEGs of up to 1 MB.
- **The app shrinks a photo before uploading it,** to at most 1080 px wide as a JPEG, so that
  it stays small on mobile data and in storage.
- **A custom exercise names its photos in `image_paths`,** like the library's pictures, as
  `<user id>/<uuid>.jpg`. `create_exercise` and `edit_exercise` only accept paths in the
  caller's own folder, and at most two.
- **The app shows them through signed URLs** that last an hour, created in one request for
  every photo on a screen.
- **Photos are uploaded before the exercise is saved,** under a new random name each time, so
  that a saved exercise never names a photo that is not there yet.

## Alternatives considered

- **A public bucket with unguessable paths:** simpler, and photos would work with the same URLs
  as library pictures. But anyone with a link could see them forever, which is wrong for
  photos of people.
- **Uploading after saving the exercise, into a folder named after it:** needs a second call to
  save the paths, and leaves an exercise without its photos if the upload fails.

## Consequences

- An upload whose exercise is then not saved leaves an unused file. A scheduled clean-up can
  remove files that no exercise names, if they add up.
- Sharing a custom exercise later needs a read policy for the photos of shared exercises, in
  addition to the exercise itself.
- Screens showing custom photos make one extra request for the signed URLs.
