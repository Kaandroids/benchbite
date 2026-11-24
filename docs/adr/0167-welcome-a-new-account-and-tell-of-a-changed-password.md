# 0167. Welcome a new account and tell of a changed password

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

ADR 0093 has Auth email the owner whenever their password is saved, so that a change made without the current password is noticed. Auth sends that notice for an account's first password too, which is set right after its address is confirmed (ADR 0091). A new user then gets "Your Benchbite password was saved", which reads as a mistake, or as a sign that someone else did something to their account (#481). Auth's template cannot tell the first password from a later one.

This amends the part of ADR 0093 about Auth's email.

## Decision

- **The database tells the first password from a later one.** A trigger on `auth.users` runs when an account with an address saves a password: the account had none before its first one, as ADR 0091 forgets a password given before the address is confirmed.
- **It asks the Edge Function `send-password-email` to email the owner,** through `call_scheduled_function()`, which reads the project URL and secret key from Vault (ADR 0131); it now takes a body and a timeout too. The request goes once the change is committed. Without the keys, or on any failure, the password is still saved, without its email.
- **A first password welcomes the account:** it is ready, and its plan, workouts, meals and progress are kept with it, also on a new phone. **A later one says the password was changed,** with how to reset it, as ADR 0093's notice did.
- **Both are sent like the other account emails,** through Lettermint, in the layout of `_shared/account_email.ts`, in the language the account was made in.
- **Auth's own notice is off.** Its template goes.

## Alternatives considered

- **Auth's Send Email Hook:** Auth would hand every email to a function, the codes too, which would then have to send them all; a fault there would stop every sign-up. ADR 0091 turned it down for the same reason.
- **Sending both emails from the app:** the app cannot tell of a change made through the API without it, which is what the notice is for.
- **Keeping Auth's notice and adding a welcome:** a new account would still get both emails.

## Consequences

- A change made outside the app is told, as before, as the trigger runs on the server.
- The emails depend on `pg_net`, Vault and the function: when one fails, the password is saved and no email goes, as with Auth's notice when the sender failed. The function's errors show in its logs.
- Locally, the emails need the Vault secrets (`pnpm vault:local`) and the functions served; Mailpit shows them.
- A new account still uses two emails of the sender: its code and the welcome.
