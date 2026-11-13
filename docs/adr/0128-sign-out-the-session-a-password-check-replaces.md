# 0128. Sign out the session a password check replaces

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

The app checks a password by signing in with it from the phone, before deleting the account (ADR 0127) and before changing the password (ADR 0093). A sign-in starts a new session, which replaces the phone's on the device only. The one before stays valid on the server, and no device holds it any more. A deleted account takes its sessions with it, and saving a new password ends every other session (ADR 0093, checked against Auth). But when deleting then fails, as for a password changed in the last day, or the new password cannot be saved, as one too weak or a session too old for `secure_password_change`, each check leaves one such session behind (#532).

## Decision

- **After a right password, the app signs out the session the sign-in replaced.** It reads that session's access token before signing in, and then has Auth sign out that session alone (`auth.admin.signOut(token, 'local')`, which calls `/logout?scope=local` with the old token and the publishable key). A sign-in always starts a session of its own, so the new one is never the one signed out.
- **The app does not wait for it, and a failure is left alone.** It only tidies up: the password was right, so deleting the account or changing the password goes on at once. If the sign-out fails, the old session stays, as before; Auth sets no time limit on sessions here, but no device holds its refresh token any more.
- **A wrong password signs nothing out.** The phone keeps its session.

## Alternatives considered

- **Signing out before signing in:** a wrong password would leave the phone signed out, with neither session.
- **Signing out every other session (`scope: 'others'`):** it would also sign out the user's other devices, which a password check gives no reason to do.
- **Leaving it, as ADR 0127 did:** each check left a session that anyone holding its refresh token could keep using.

## Consequences

- A password check leaves no session behind, whether deleting then succeeds or fails (#532).
- Each right password costs one more request to Auth. After a password change saved, it signs out a session Auth has ended already, which does no harm.
- A session whose sign-out fails stays valid, as every replaced session did before.
