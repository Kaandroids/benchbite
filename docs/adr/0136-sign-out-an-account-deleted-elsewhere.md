# 0136. Sign out an account deleted elsewhere, and say why a session ended

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

An account deleted on the website stayed signed in on the phone (#590). The phone's access token
works for up to an hour after the deletion, and every read in that hour comes back empty under row
level security. Once the token expired, refreshing it failed with `refresh_token_not_found`. The
app then took the lost session for a guest's (ADR 0031) and showed "Your guest session ended" with
"Start again", although the user had an account. The same screen showed when an account was
signed out by a password change elsewhere (ADR 0128).

## Decision

- **The app asks whether its user still exists** with `getUser()` when it opens and whenever it
  comes to the foreground. When Auth answers `user_not_found`, it signs out on this device
  (`scope: 'local'`). Any other error, such as being offline, changes nothing.
- **The device remembers whether its last user had an account**, beside the user's id. A session
  that ends says why (`EndedReason`):
  - `deleted`: an account found deleted while its token still worked. The screen says "Your
    account was deleted", with **Continue as guest** and **Create an account**.
  - `account`: an account's session that ended otherwise. This device cannot tell why once the
    token is gone, so the screen says "You're signed out on this device", may have been deleted or
    signed out elsewhere, with **Log in** and **Continue as guest**.
  - `guest`: a guest's session, as before. A guest removed after 90 days (ADR 0131) ends this way
    too, even when found deleted.
- **The three screens show their icon in danger's colours,** as what was there is lost.

## Alternatives considered

- **Keep a record of deleted accounts on the server**, for the app to ask once its token is gone:
  it would say "deleted" every time, but needs a table, a retention period and a function that
  answers without a session. Most deletions are found while the token still works, and the
  `account` screen stays honest about the rest.
- **Sign out at once on any failed refresh, without a screen:** the user would land in a new guest
  without knowing that their data is out of reach.

## Consequences

- An account deleted on the website signs out the next time the app opens or comes to the
  foreground, within the hour that its token lasts. Later, it shows the `account` screen.
- Each open and each return to the foreground costs one request to Auth.
- An account signed out by a password change elsewhere is told to log in, rather than to start
  again as a guest.
