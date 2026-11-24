# 0168. Export the media and the record of the AI

- **Status:** Accepted, amended by ADR-0169
- **Date:** 2026-11-24

## Context

The export (ADR 0147, ADR 0148) is meant to answer a request for a copy (GDPR Art. 20) and a
request for access (Art. 15). It fell short of access in two places (#712): photos and voice
messages were named only by their path, and the record of the AI (`ai_usage`, and which model
answered each message) was left out as the service's own. Access covers the data itself and data
observed about the user's own use (EDPB Guidelines 01/2022, paras 99 and following).

This amends ADR 0147's points on the AI's record and on photos and voice messages, and ADR 0148's
file.

## Decision

- **The record of the AI is exported:** `ai_usage` whole (feature, model, tokens, cost and time of
  each call) and, in each message, the model that answered and its tokens. They describe the user's
  own use, priced.
- **The export is a ZIP:** the user's photos and voice messages under `media/<bucket>/`, without
  the user's folder, and the file `benchbite-data.json`, last, whose `media` names where each one
  is in the ZIP, or that it could not be read. The file's `version` is 2.
- **The database lists the media,** from `storage.objects` in the private buckets `coach-media` and
  `exercise-photos` under the user's folder, so that the list and the files cannot disagree.
- **Edge Functions build the ZIP, one shared module for both:** `export-my-data` for the app,
  which reads the export as the signed-in user and the files with the service role, and
  `download-data-export` for the website's link. The ZIP is streamed a file at a time, the next
  read from storage only once the reader has taken the last, so that the function holds one file
  at a time however many there are. The media are stored as they are, as they are compressed
  already. A path with a `.` or `..` part is never read, and the database lists only names in the
  user's own folders.
- **The app shares the ZIP** as before (ADR 0147), as `application/zip`. Builds before this one go
  on calling `export_my_data()` and get the file alone, with the list of media.

## Alternatives considered

- **Signed links to the media in the file:** simpler and smaller, but the links run out, the media
  are not in the copy, and anyone with the file could download them while they work.
- **Building the ZIP on the phone:** the website's export would differ, and the phone would have to
  download every file itself.
- **Compressing the media:** photos and voice messages are compressed already; it would cost time
  for nothing.

## Consequences

- The export grows with the user's media: up to 1.5 MB a photo or voice message.
- Building it takes as long as the reader takes to download it, and an Edge Function's response
  ends at its wall-clock limit (150 s on Supabase's free plan, 400 s on a paid one): a very large
  export on a slow connection can be cut off, and is then not saved, as the app reads it whole.
- A file that cannot be read leaves the ZIP without it, and says so in the file, rather than
  failing the whole export.
- The privacy policy's section on the export says what the ZIP holds (#726).
