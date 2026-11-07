# 0093. Change a password with the current one

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

An account could not change its password. Someone who has the phone, or a session left open on it, should not be able to change the password without knowing it, as that would lock the owner out.

## Decision

- **Settings has "Change password", which asks for the current password and a new one.** The current one is checked by signing in with it, and the new one is saved after that. Auth's `current_password` parameter is not used: the version we run accepts it but does not check it.
- **Auth only lets a recent session change a password (`secure_password_change`).** A session older than 24 hours is refused, so a session left open cannot change the password without it. Signing in with the current password, a confirmation code and a reset code each start a new session, so the steps of ADR 0091 and ADR 0092 still work.
- **"Forgot your password?" on the same screen resets it with a code,** as on the log-in screen (ADR 0092).

## Alternatives considered

- **Checking the current password in the app only:** a session could still change the password through the API without it.
- **Auth's reauthentication code by email instead of the current password:** a second email and code for something the person can type.
- **Changing the email address too:** not needed for now, and it needs a code for each address.

## Consequences

- Changing the password signs in again on this phone, with the same user, so nothing else changes.
- An app that saves a password more than a day after its session started, without signing in again, is refused with `reauthentication_needed`.
