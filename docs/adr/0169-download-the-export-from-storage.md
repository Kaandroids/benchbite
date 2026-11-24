# 0169. Download the export from storage

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

The export is a ZIP with the user's photos and voice messages (ADR 0168). An Edge Function gave it
as its response, which ends at the function's wall-clock limit: 150 s on Supabase's free plan,
400 s on a paid one. A heavy user of Bite gathers hundreds of MB a year, and on a slow connection
the download would be cut off. A copy of one's data is a legal right (GDPR Art. 15, 20), so it has
to work whatever its size, the connection, and the plan. Each export also reads every file the
user has, which nothing limited.

This amends ADR 0168's delivery of the ZIP, and ADR 0148's download on the website.

## Decision

- **The ZIP is written to storage,** to the private bucket `data-exports`, one folder per user. It
  is streamed from the media to storage inside Supabase's own network, a few media read at once, so
  building it does not depend on the user's connection. Once it is stored, the user's earlier
  export goes; a failed upload leaves the earlier one and its link.
- **The user downloads it from storage through a signed link** that works for an hour, under its
  file's name. A download from storage has no time limit, and a failed one can be tried again
  while the link works.
- **The app downloads the link straight into a file,** natively, and shares it. The website's
  download sends the browser to the link.
- **Two exports an hour per account,** from the app and from the website together
  (`take_data_export()`), as each reads every file. A third is refused, and the app and the page
  say so.
- **A ZIP is removed a day after it was made** by `purge-data-exports`, which a pg_cron job calls,
  as it holds health data; **with the user,** when the account is deleted; and **when the health
  data consent is withdrawn,** which asks `purge-data-exports` for the user's folder once the
  withdrawal commits. The runs of the limit are left out of the export, as the bucket is.
- **Locally, `STORAGE_PUBLIC_URL`** points the link at the address outside Docker, as the
  functions sign with Docker's own.

## Alternatives considered

- **Splitting the ZIP into parts small enough to download in time:** the limit depends on the
  connection, so no size of part is safe; and the app and the page would need a list of parts.
- **Building the ZIP on the phone:** the website's export would differ, and the phone would read
  every file itself.
- **A higher limit on the paid plan:** 400 s still cuts off a large export on a slow connection.

## Consequences

- On Supabase's free plan an uploaded file may be at most 50 MB, so a larger export fails until the
  project moves to a paid plan (up to 500 GB a file), which is planned before the release.
- A ZIP stays in storage for up to a day; the link works for an hour.
- Building the ZIP has to answer within Supabase's request idle timeout of 150 s, on every plan:
  the app and the browser wait for the link while it is built. Reading a few media at once keeps a
  large export well within it; a user with thousands of photos and voice messages could still
  reach it, and the export would then fail.
- A failed export still uses one of the two of the hour.
- If the request to remove a withdrawn user's export cannot be sent, the daily purge removes it.
- The egress of an export counts once per download, as before.
- Old builds keep calling `export_my_data()` and get the file alone (ADR 0157).
