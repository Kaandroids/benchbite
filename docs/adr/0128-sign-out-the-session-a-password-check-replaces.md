# 0128. Sign out the session a password check replaces

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

The app checks a password by signing in with it from the phone, before deleting the account (ADR 0127) and before changing the password (ADR 0093). A sign-in starts a new session, which replaces the phone's on the device only. The one before stays valid on the server, and no device holds it any more. When deleting then fails, as for a password changed in the last day, or when the password is changed, each check leaves one such session behind (#532).

## Decision

- **After a right password, the app signs out the session the sign-in replaced.** It reads that session's access token before signing in, and then has Auth sign out that session alone (`auth.admin.signOut(token, 'local')`, which calls `/logout?scope=local` with the old token and the publishable key). A sign-in always starts a session of its own, so the new one is never the one signed out.
- **A failure to sign it out is left alone.** The password was right, so deleting the account or changing the password goes on. The old session then stays until it expires, as before.
- **A wrong password signs nothing out.** The phone keeps its session.

## Alternatives considered

- **Signing out before signing in:** a wrong password would leave the phone signed out, with neither session.
- **Signing out every other session (`scope: 'others'`):** it would also sign out the user's other devices, which a password check gives no reason to do.
- **Leaving it, as ADR 0127 did:** each check left a session that anyone holding its refresh token could keep using.

## Consequences

- A password check leaves no session behind, whether deleting then succeeds or fails (#532).
- Each right password costs one more request to Auth.
- Until a failed sign-out's session expires, it stays valid, as every replaced session did before.
