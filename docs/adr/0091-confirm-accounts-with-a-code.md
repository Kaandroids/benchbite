# 0091. Confirm accounts with a code

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

ADR 0031 creates accounts without confirming the email address, because no domain or email sender existed. So anyone could take an address that is not theirs, and nothing could be sent for a forgotten password. `benchbite.com` now has a sender.

## Decision

- **An account's email address is confirmed with a 6-digit code typed into the app,** not a link, as a code does not depend on a link opening the app. It works for 15 minutes, and another can be asked for after a minute.
- **A guest stays a guest until the code is confirmed.** `updateUser` adds the address as a pending change, and leaving loses nothing. Asking for it again is what sends a new code, as `resend` does not find a pending address. The user id stays the same, so all data stays with it (ADR 0005). Without a session, `signUp` creates the user, and the code confirms it.
- **The password is set right after every confirmed code.** Auth refuses one for a guest before that. Auth also keeps the first password given for an unconfirmed address, so someone who signed up with another person's address would otherwise know the password of that person's account. A trigger on `auth.users` therefore forgets the password when an address is first confirmed. If only this step fails, trying again does not use the code twice, and the screen offers no way back: no back button, no swipe and no Android back button.
- **A sign-up nobody confirmed is removed a day after its last code,** by a `pg_cron` job. It would otherwise hold its address for good, and with it someone else's address that nobody proved.
- **Passwords have at least 8 characters.** This applies when one is set, so existing ones keep working.
- **Email goes through SMTP, from `no-reply@benchbite.com`.** The templates are in `supabase/templates/`. One template holds all three languages, chosen with the `locale` the app stores in the user's metadata, in the subject too. An Auth Hook was not needed for this.
- **The SMTP settings are added to `supabase/config.toml` by the deploy workflow.** Locally, email stays in Mailpit, with no password to set and nothing leaving the machine.

## Alternatives considered

- **A link in the email:** one tap, but it needs universal and app links, which depend on the website, and mail scanners open links.
- **A guest setting their password first:** Auth refuses it for a user with no confirmed address.
- **`[remotes]` in `config.toml` for the hosted SMTP settings:** it needs the project's id in a public file, and the deploy could not be tried from a local machine.
- **The Send Email Hook:** full control of the email, but a function to write, deploy and keep running for what templates already do.

## Consequences

- A sign-up on the hosted project needs a working sender: if email fails, nobody can finish creating an account.
- An account can have an address but no password, if the app stops right after the code is confirmed. A password reset will solve that, and until then it only signs in on the same session.
- Without a session, the app leaves the screen as soon as the code is confirmed. If setting the password fails in that moment, the account has no password until a password reset, but never one given by someone else.
- Confirming an address in the dashboard also forgets the password given before it.
- Someone can hold another person's address for up to a day, by signing up with it and not confirming.
- Auth sends a user one code a minute, so a guest who corrects their address right away is asked to wait.
- The email limit of `supabase/config.toml` is shared by all users and there is no captcha yet, so one client can use it up and stop sign-ups for up to an hour.
- Local tools that sign up need the code, or confirm the user in the database as `pnpm seed:demo` does.
