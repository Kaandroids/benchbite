# 0067. Check the scheduled jobs from a daily GitHub Actions workflow

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

The photo purge of deleted chats runs every five minutes from `pg_cron` (ADR 0063). When it fails,
for example after the secret key was rotated without updating Vault, every call gets a 401.
`request_coach_media_purge()` then warns, but a warning only reaches the Postgres logs, and
`cron.job_run_details` still reports each run as succeeded. Photos of deleted chats would stay in
storage without anyone noticing, which personal data must not (#368).

## Decision

- **A daily Monitor workflow asks the hosted database and fails when the purge is unhealthy.** A
  failed run sends GitHub's usual email, so no other service is needed. Each scheduled job gets its
  own check in the workflow.
- **`coach_media_purge_status()` decides, in the database.** It returns only counts, ages and status
  codes: the queued folders and the age of the oldest, and the purge's responses with their failed
  status codes. It is unhealthy when the purge has stopped (below), or when the latest answered call
  was not a 2xx while a folder is queued; a timeout counts as failed. With nothing queued no new call
  replaces a failed one, so it no longer counts. Only the database owner can call it. It runs as its
  caller, as the owner needs no more rights to read the queue and pg_net's responses.
- **The purge has stopped when a folder has waited over an hour, and either a run has already tried
  it and failed, or no call has succeeded in the last 15 minutes.** The age alone is no failure: a
  run purges 20 folders, about 240 an hour, so a larger burst, such as an account with hundreds of
  chats deleted at once, keeps folders waiting longer while every call succeeds. A failed attempt
  catches a folder storage keeps refusing, which the function still answers with a 200. Missing
  successes catch a refused key, a failing function and a cron job that calls nothing, for example
  without the Vault secrets; 15 minutes allow two missed runs. `coach_media_purge_stalled()` holds
  the rule, and `request_coach_media_purge()` warns by the same one.
- **The purge records its pg_net request ids.** pg_net's responses carry no URL, so
  `request_coach_media_purge()` keeps the ids of its requests for a day in
  `coach_media_purge_requests`, which has row level security, no policies and no client grants.
- **The workflow queries through the Management API** with the deploy's access token and project
  id, so it needs no database password. They are copies in a `monitoring` environment that allows
  only main and, unlike `production`, needs no approval, as a scheduled run waiting for one would
  never check anything.

## Alternatives considered

- **Raising an error in the cron job instead of a warning:** `cron.job_run_details` would show the
  run as failed, but someone would still have to look.
- **A log drain or an external monitoring service:** more setup and cost than one check needs.
- **The queue's age alone:** it catches every failure within an hour, but not which status the
  purge answered, which tells a rotated key (401) from a failing function (5xx), and it fails for a
  burst of over 240 folders while the purge works.
- **Only the age of folders a run has failed (`attempts > 0`):** no false alarm for a burst, but a
  refused key or a cron job that calls nothing never tries a folder, so it would never fail.
- **A read-only database role with only this function:** least privilege, but it needs a password
  set by hand in the hosted project and a connection through the pooler, for a check that already
  shows nothing but counts.
- **The `production` environment's secrets:** its approval would hold every scheduled run.

## Consequences

- A failing purge is reported within a day, by email, with the status codes that explain it.
- A folder that failed once and then waits behind a burst of over 240 others can still fail the
  check, as folders that failed go last in a run's batch. It is rare and clears once the burst is
  purged.
- The access token is in a second environment that runs without approval. Only workflows on main can
  use it, and main changes only through reviewed pull requests. Rotating the token means updating
  both environments.
- Each run records a deployment to `monitoring` in the repository.
- A scheduled workflow is disabled by GitHub after 60 days without activity in the repository.
