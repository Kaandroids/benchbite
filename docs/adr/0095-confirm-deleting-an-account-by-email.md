# 0095. Confirm deleting an account by email

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

The app deletes an account after two steps on the phone, with no password or email (ADR 0087): the open session was proof enough, and a forgotten password could not be reset. Anyone holding an unlocked phone could therefore delete the account. Accounts now confirm their email address (ADR 0091), the app can send email (ADR 0094), and passwords can be reset (ADR 0092).

## Decision

- **An account proves its owner asks, with a code from its email or its password.** `delete-account` takes `code` or `password` from an account, and refuses without one. Guests have neither, so they keep the steps of ADR 0087.
- **`send-deletion-code` emails a 6-digit code to the account's address,** in the app's language. It works for 15 minutes and for 5 wrong tries, and a new one can be sent once a minute, replacing the last. Only its hash is kept, with the user in it.
- **The password is for an address that can no longer be opened.** Auth checks it, by signing in on a client of its own; on the service role's client the session would replace the service role. Auth limits signing in per IP, and the function's IP is everyone's, so `delete-account` also allows a user 5 tries in 15 minutes.
- **The app asks for the code and deletes only when the button is pressed,** not when the last digit is typed, so a code typed by mistake deletes nothing.
- **The email says what to do if someone else asked:** change the password, as whoever has the phone has the session.

## Alternatives considered

- **A link in the email, as on the website:** the link would open a browser, away from the app that asked, while a code is typed where the deletion was started, as the other account codes are (ADR 0091, ADR 0092).
- **Only the password:** an account confirmed by email could then not be deleted by someone who has forgotten it, without resetting it first.
- **Only the code:** an address that can no longer be opened would keep its account for good, as the website's link goes to the same address.
- **Checking the password in Postgres against Auth's hash:** it would need no sign-in, but would rely on how Auth stores passwords, and the password would reach the database, whose logs could show it.

## Consequences

- An app older than this change can no longer delete an account, only a guest.
- A password tried and found right leaves a session, which goes with the user.
