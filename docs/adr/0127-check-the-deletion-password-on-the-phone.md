# 0127. Check the password for deleting an account on the phone

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

An account confirms deleting itself with a code from its email or its password (ADR 0095). `delete-account` checked the password by signing in with it. Auth limits signing in per IP, 30 in 5 minutes, and the function's IP is the same for every user, so ADR 0095 gave all users together 20 password tries in 5 minutes. A few accounts could use those up with wrong passwords, again and again, and keep every other user from confirming with theirs (#531). Each right password also left a session behind, which was never signed out if deleting then failed (#532).

## Decision

- **The app checks the password by signing in with it, from the phone.** Auth then counts the tries against the phone's IP, as for any sign-in, and the function never sees the password.
- **`delete-account` takes a recent sign-in with the password as proof.** The app asks for it with `{ signedIn: true }`. The function reads when the token's session signed in with a password from its `amr` claim, and takes it within a minute: the app calls the function right after signing in, and any sign-in counts, an ordinary one too, so a longer time would only give more to whoever takes the session after it. Auth keeps that time as the token is refreshed, so an older session does not become new by refreshing it. The flag keeps a request sent without proof, just after an ordinary sign-in, from deleting the account.
- **A password changed in the last day is still refused** (ADR 0095). `password_changed_lately()` answers it in place of `take_account_deletion_password_try()`, which counted the tries and goes.
- **The code is unchanged.**

## Alternatives considered

- **Counting tries per user, with a high limit for everyone as a backstop:** Auth's limit for the function's IP would still be shared by all users, so a few accounts could still block the rest, only with more tries.
- **Raising Auth's limit per IP:** it limits every sign-in, so it would give guesses at any account more room from each IP.
- **Checking the password in the function against Auth's hash:** it would need no sign-in, but would rely on how Auth stores passwords and bypass Auth's own limits (ADR 0095).
- **Auth's reauthentication with a nonce:** it sends a code by email, which the code path already does.

## Consequences

- One user's wrong passwords no longer keep others from deleting their accounts, and the function leaves no session behind (#531, #532).
- Signing in replaces the phone's session with a new one of the same user; the one before stays valid on the server until it expires, as when the password is changed (ADR 0093).
- An app older than this change sends the password itself, which the function no longer takes; its users can still use the code.
- The `password` kind of `account_deletion_tries` is no longer recorded. Old rows go within a day.
