# 0063. Remove a deleted chat's photos from a queue, on a schedule

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

Photos sent to Bite are kept in the private `coach-media` bucket as
`<user id>/<thread id>/<uuid>.jpg` (ADR 0062). A user deletes a chat from the app under row level
security (ADR 0050), and deleting an account deletes its chats through their foreign keys. Neither
removes the photos: storage objects can only be removed through the Storage API, which Postgres
cannot call, and a trigger that deletes rows of `storage.objects` would leave the files behind.
Personal data has to be gone when the user deletes it, so the photos of a deleted chat must be
removed too (#361), whichever way the chat was deleted.

## Decision

- **Deleting a chat queues its folder.** A statement trigger after delete on `coach_threads`
  writes the folder of each deleted thread, as its thread and user id, into
  `coach_media_deletions`. Deleting an account cascades to its threads, so the same trigger queues
  all of them. The queue has row level security and no policies, and clients have no grants on
  it: only the trigger writes it, and only the purge function reads it, with the service role.
- **An Edge Function empties the queued folders.** `purge-coach-media` takes up to 20 folders,
  those that failed least often and then the oldest, lists each folder's photos and removes them
  through the Storage API, a page at a time, until the folder is empty. It then removes the
  folders it emptied from the queue. A folder that fails stays queued with its attempts counted,
  and is tried again on the next run after the others.
- **`pg_cron` calls the function every five minutes, as Supabase schedules Edge Functions.** The
  job runs `request_coach_media_purge()`, which sends a request through `pg_net` only while
  folders are queued. It reads the project URL and a secret API key from Vault (`project_url` and
  `secret_key`) when it runs, so no key is kept in the migrations or the repository, and it skips
  the call with a warning while they are not set. It also warns while a folder has been queued
  for over an hour, as the purge then keeps failing, for example with a key in Vault that is no
  longer valid. Clients cannot call it.
- **Only the secret key opens the function.** The platform's JWT check is off, as the key is no
  JWT, and the function accepts only the project's secret key in the `apikey` header, compared in
  constant time; users' tokens and the publishable key are refused. CORS is off, as no browser
  calls it.

## Alternatives considered

- **A `delete-thread` Edge Function** that removes the photos and then the thread: no queue and no
  schedule, but it does not cover account deletion, which deletes the threads through foreign
  keys, and a thread deleted any other way would keep its photos. The app would also have to stop
  deleting threads directly.
- **Removing the photos from the trigger** with `pg_net`: the trigger would hold a secret key and
  call storage within the user's delete, with nothing to try again when the call fails.
- **Deleting rows of `storage.objects` in SQL:** storage refuses it, and it would leave the files
  in the storage backend.
- **The service role key in the cron command:** it would have to be written into a migration,
  which this public repository cannot hold.

## Consequences

- A deleted chat's photos are gone within minutes, and the queue keeps any that could not be
  removed until a later run succeeds. Account deletion (#134) gets this without further work.
- The project needs `pg_cron` and `pg_net`, which the migration enables, and the two Vault secrets,
  which are set once per project: `pnpm vault:local` sets them for the local stack, and the hosted
  project's are set in its SQL editor (see Deployment in the README).
- `pg_net` keeps the decrypted key in `net.http_request_queue` until it sends the request. The
  `net` schema is not exposed through the API, so clients cannot read it; any role that can log in
  to the database can.
- The chat function, when it stores photos (ADR 0062), must store them only for a thread that
  exists and remove them when it cannot save the message, as a photo stored after its thread was
  purged would not be queued again.
