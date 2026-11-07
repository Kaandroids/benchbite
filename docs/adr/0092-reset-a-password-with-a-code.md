# 0092. Reset a password with a code

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

Someone who forgot their password had no way back into their account, and an account confirmed without its password being saved has none (ADR 0091). Accounts already confirm their email address with a code from Lettermint.

## Decision

- **A forgotten password is reset with a 6-digit code,** as accounts are confirmed: "Forgot your password?" on the log-in screen asks for the email address and sends the code. It works for 15 minutes, like the confirmation code. Auth answers the same for an address without an account, so the screen says that a code is on its way if the address has one.
- **The code signs in to the account, and the app then asks for a new password before anything else.** Auth reports this as a password recovery. The session provider keeps that, as it stays while the app starts again for the account, and the root shows the new password's screen until it is saved. It has no way back: the code is used, and the old password is the one forgotten.
- **The email has its own template,** `supabase/templates/password-code.html`, in the three languages, as the confirmation's.

## Alternatives considered

- **A link in the email:** the reasons of ADR 0091 hold here too.
- **Asking for the new password with the code, on one screen:** Auth checks the code only by using it, so a wrong code would be found only after the password was typed.
- **Keeping the new password's step in the log-in screen:** the app starts again for the account the code signed in to, which would remove that screen.

## Consequences

- If the app stops before the new password is saved, the person stays logged in on this phone without a password they know, and can reset it again.
- A guest who resets the password of their account leaves their guest data behind, as when logging in; the screen warns them as the log-in screen does.
- Someone could try codes for another person's address. Auth limits how many codes one IP address can check, 30 every 5 minutes, and a code works for 15 minutes; many IP addresses together could still try more. A captcha (#455) would make it harder to ask for codes. Codes stay 6 digits, as on most services, rather than 8, which would make guessing a hundred times harder.
- Changing a password while logged in is a separate step, with the current password.
