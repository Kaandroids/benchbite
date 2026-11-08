# 0095. Confirm deleting an account by email

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

The app deletes an account after two steps on the phone, with no password or email (ADR 0087): the open session was proof enough, and a forgotten password could not be reset. Anyone holding an unlocked phone could therefore delete the account. Accounts now confirm their email address (ADR 0091), the app can send email (ADR 0094), and passwords can be reset (ADR 0092).

## Decision

- **An account proves its owner asks, with a code from its email or its password.** `delete-account` takes `code` or `password` from an account, and refuses without one. Guests have neither, so they keep the steps of ADR 0087.
- **`send-deletion-code` emails a 6-digit code to the account's address,** in the app's language. It works for 15 minutes; a new one, replacing the last, can be sent once a minute and 5 times an hour. Only its hash is kept, with the user in it.
- **Wrong codes are counted per user, not per code:** 5 in an hour, so a new code brings no new tries and a guess has 5 tries an hour out of a million codes. The answer says whether a code was wrong, expired, or one too many, so the app can offer a new one.
- **The password is for an address that can no longer be opened.** Auth checks it, by signing in on a client of its own; on the service role's client the session would replace the service role. A user gets 5 tries in 15 minutes.
- **A password changed in the last day is refused.** A session that signed in recently can set a new password without the old one (ADR 0093), so whoever holds the phone could set one and use it. A trigger records when each password changes. A new account, whose password was just set, and a reset password therefore take the code for a day.
- **All users together get 20 password tries in 5 minutes.** Auth limits signing in per IP, 30 in 5 minutes, and the function's IP is everyone's: below that, the function asks to wait instead of Auth failing for everyone.
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
