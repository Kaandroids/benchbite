# 0108. Keep the health store's access when another user signs in

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

ADR 0097 decided that when another user signs in, the device forgets its connection to the health store and, on Android, gives up the access that Health Connect allowed. Health Connect applies `revokeAllPermissions` only when the app next starts. Until then, the access still looks allowed. A user who signed in and connected in that time lost their access at the next start, including what they had just allowed, and the app then showed Health Connect as not connected. On the emulator, this happened after switching from one account to another and connecting again.

## Decision

- **When another user signs in, the device only forgets its connection.** The access the phone's store allowed stays. It belongs to the phone's owner, not to a Benchbite account, as on iOS, where only the Health app can take it back.
- **The new user still reads nothing before giving consent.** They start unconnected. Reading begins only after they connect through Benchbite's own consent sheet, with their account's consent. If the store still allows the access, the system's screen may then ask nothing more.
- **Disconnecting in Settings still gives up the access on Android** (ADR 0097). There the user asks for exactly that. Connecting again before the app restarts loses the new access at the next start, and the app then shows Health Connect as not connected, from where the user can connect again.

This amends the part of ADR 0097 about another user signing in.

## Alternatives considered

- **Keep giving up the access, and remember that a revoke is waiting for the next start.** Connecting in that time would then need a screen asking the user to restart Benchbite first. That is a new screen for a rare case, and it would still block the user.
- **Ask for the access again after the next start, when a revoke took what was allowed later.** The system's screen would open without the user doing anything.

## Consequences

- Switching accounts and connecting again works without losing the access.
- After another user signs in, the store's access stays allowed even though no account of Benchbite's is connected. Nothing is read until a user connects, and Health Connect's own settings can still take the access back.
- Disconnecting and connecting again in one run of the app still ends unconnected after the next start.
