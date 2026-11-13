# 0131. Remove guests inactive for 90 days

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

People start as guests, anonymous users with their own data in Supabase (ADR 0005). A guest
cannot sign in again: once the app's session is gone, as when it is uninstalled or its data is
cleared, nobody can reach that guest's data any more. ADR 0005 expected such guests to pile up and
said they must be removed by a scheduled job, based on inactivity rather than age. Until now
nothing did: `remove_unconfirmed_users()` leaves guests alone (ADR 0091), so every guest and their
workouts, meals, chats and photos stayed forever, and guests created at scale would cost storage
for good (#535).

Signing in sets `last_sign_in_at` once, when the guest is created. After that the app keeps the
guest signed in by refreshing the session whenever it is opened after the access token expired,
which updates the session's `updated_at` in `auth.sessions` but not `last_sign_in_at`.

A guest's exercise photos can only be removed through the Storage API, which Postgres cannot call,
so deleting the row in `auth.users` from SQL would leave them behind (ADR 0063, ADR 0087).

## Decision

- **A guest is inactive when it has not been used for 90 days.** Its last activity is the latest
  of its creation, its last sign-in and the last refresh of any of its sessions
  (`last_active_at()`). Someone who opens the app at least once in three months keeps their data;
  90 days is long enough for a break from training, an injury or a season away. Accounts with an
  email address are never removed this way.
- **An Edge Function deletes them as deleting an account does.** `remove-inactive-guests` takes up
  to 20 inactive guests from `inactive_guests()`, in random order so that guests whose removal
  keeps failing cannot hold up the others, and deletes each with the same `deleteUser` as
  deleting an account: the exercise photos, then the user, whose rows go with it through their
  foreign keys and whose chat photos go through the queue of ADR 0063. A guest that fails is
  tried again on a later run.
- **`pg_cron` calls the function every hour, as it calls `purge-coach-media`** (ADR 0063).
  `request_inactive_guest_removal()` sends a request through `pg_net` only while there are
  inactive guests, with the project URL and secret key it reads from Vault, and skips the call
  with a warning while they are not set. It also warns while a guest has been inactive for over
  91 days, as the removal then keeps failing. 20 guests an hour is 480 a day.
- **Only the service role finds inactive guests, and only the secret key opens the function.**
  Clients cannot call `inactive_guests()`, `last_active_at()` or the request function; the
  function's JWT check is off, as the key is no JWT, and it accepts only the project's secret key.

## Alternatives considered

- **Deleting guests from SQL in the cron job,** as `remove_unconfirmed_users()` does: no Edge
  Function, but their exercise photos would stay in storage with nothing left to name them.
- **Age instead of inactivity:** simpler, but it would delete guests who use the app every day,
  which ADR 0005 ruled out.
- **`last_sign_in_at` alone:** it is set only when the guest is created, so every guest would look
  inactive 90 days after their first start, however often they use the app.
- **A shorter period, such as 30 days:** less data kept, but a guest on a month's break would
  lose their history. **A longer one, such as a year:** data nobody can reach is kept far longer
  than it needs to be.
- **Expiring guests' sessions instead,** with Supabase's inactivity timeout: it would end guests'
  sessions but not remove their data, and it applies to every account.

## Consequences

- A guest's data no longer stays forever: at most about 90 days after it was last used it is
  removed, with all that is theirs.
- A guest who returns after 90 days finds their session ended: the app's refresh fails, and it
  shows that the session ended and starts over as a new guest, as it does for any session it lost.
- A guest who becomes active, or creates an account, in the seconds between being found and being
  deleted is still deleted. A guest inactive for 90 days is unlikely to return at that moment.
- The removal reads and deletes through `auth.users` and `auth.sessions`, which Supabase owns; a
  change to their columns would break `last_active_at()`, and the database tests would show it.
- Like the photo purge, it needs `project_url` and `secret_key` in the project's Vault; without
  them it only warns. The scheduled Monitor workflow (ADR 0067) does not check it yet.
