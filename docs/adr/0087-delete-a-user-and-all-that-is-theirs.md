# 0087. Delete a user and all that is theirs

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The App Store and Google Play ask that an account can be deleted from inside the app, and personal
data has to be gone when its owner asks. A guest's data is on the server too. Rows that name a user
cascade from `auth.users`, and the photos of their chats already leave through the queue of ADR 0063,
but nothing removes the photos of their own exercises, and an app cannot delete a user.

## Decision

- **An Edge Function deletes the user the token belongs to.** `delete-account` takes no parameters,
  so a token can only delete its own user. It needs the service role, which stays in the function.
- **Exercise photos first, then the user.** If the photos cannot be removed the user stays and can
  try again; deleting first would leave files that nothing could name. A user already gone counts as
  deleted, so that a try whose answer was lost can be repeated.
- **Guests can delete too,** as "Delete my data", through the same screen and function.
- **Two steps, no password.** A screen says what goes, with keeping it as the main button, and a
  sheet asks once more. The open session proves who is asking, and a forgotten password must not
  stand in the way, as it cannot be reset yet (#173). Confirming by email is left to #438.
- **The app starts over as a new guest,** replacing the session rather than signing out of a user
  that no longer exists.

## Alternatives considered

- **A Postgres function:** it could delete the rows, but not files, which only the Storage API can
  remove, and it would have to run as a role allowed to delete from `auth.users`.
- **Queueing the exercise photos as ADR 0063 queues chats':** it would survive storage being down,
  but takes a new queue and job, while failing here simply leaves the account to try again.
- **Deleting after a grace period:** a mistake could be undone, but the data would stay after the
  user asked for it to go, and the sheet already asks twice.
- **Asking for the password or a typed word:** see the decision for the password; a typed word adds
  a hurdle in every language without proving anything the sheet does not.

## Consequences

- If the user cannot be deleted after their photos were removed, the account stays without those
  photos. Trying again finishes it.
- A subscription in the stores does not end with the account. The screen will say so once purchases
  exist (#434).
- Someone holding an unlocked phone can delete the account, until #438.
- Data already sent to the AI provider and database backups are outside this; the privacy policy has
  to say so (#44).
- Exporting one's data is not part of this.
