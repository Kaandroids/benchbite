# 0031. Create accounts with an email address and a password

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

Everyone starts as an anonymous guest (ADR 0005). A guest's data is lost with their session, and
the app is now being installed on real phones against the hosted project, so people need an
account that keeps their data and lets them sign in again. The first account type has to work
without a domain, a website or a custom email sender, none of which exist yet.

## Decision

The first way to create an account is an email address with a password.

- **Creating an account** adds the email address and the password to the signed-in guest with one
  `updateUser` call. The user id stays the same, so all data stays with it. When there is no
  session, as after a guest session ended, `signUp` creates a new user instead.
- **Signing in** uses `signInWithPassword`. A guest who signs in leaves their guest data behind for
  good; it is not merged into the account. The screens warn about this before the sign-in.
- **Signing out** is offered to accounts only. It signs out this device alone (`scope: 'local'`)
  and starts over as a new guest, so the app always has a signed-in user. The device forgets the
  last user first, so the app does not report the session as lost (ADR 0005). Signing out needs a
  session that is still valid: offline with an expired one, it fails and the account stays signed
  in. When only revoking the session on the server fails, it is removed from the device anyway.
- **What the device keeps for its user**, the workout in progress and the workout reminders,
  belongs to one user. The device records that user as its owner. When another user signs in, or a
  new guest replaces one, the previous user's workout and reminders go. The same user signing in
  again keeps them. This is done in one place (`src/account/device-owner.ts`), so each new way to
  sign in gets it without extra work.
- **The onboarding** of an account that has not finished it on this device waits for the server's
  answer, because the account most likely finished it elsewhere. Guests never wait.
- For now, email addresses are not confirmed and passwords need 6 characters
  (`supabase/config.toml`).

The data layer is in `src/account/account.ts`; the screens follow in a separate change.

## Alternatives considered

- **A magic link or a one-time code by email**: no password to remember, but every sign-in sends an
  email. Supabase's built-in sender is only for testing, and a link needs a domain or deep links that
  are not set up yet. It can be added later next to the password.
- **Sign in with Apple and Google** (#132, #133): the most convenient on phones, but both need
  provider setup and developer console configuration. They follow as their own changes.
- **Merging the guest's data into the account on sign-in**: keeps everything, but needs rules for
  conflicting profiles, plans and limits. Someone signing in on a new device rarely has guest data
  worth keeping.

## Consequences

- Guests can keep their data and use it on another device.
- Without confirmation, anyone can create an account with an address that is not theirs. Before
  others use the app, confirmations are turned on with a custom email sender and the password rules
  are tightened (#56).
- A forgotten password cannot be reset yet; that needs email as well.
- Account deletion, which the App Store requires once accounts exist, is still to do (#134).
