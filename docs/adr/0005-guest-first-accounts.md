# 0005. Let people start as guests with anonymous sign-ins

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

A sign-up form before the first screen is one of the most common reasons people abandon an
app. Benchbite should open with a short onboarding and be usable right away; creating an account
should be optional and can happen later, for example to keep data safe or use it on another
device.

At the same time, the data model is built on Supabase: tables are protected by Row Level
Security based on the signed-in user, and business logic runs in Postgres and Edge Functions.

## Decision

When the app starts without a stored session, it signs in anonymously with Supabase Auth. An
anonymous user is a real user with an ID and the `authenticated` role, so their data is stored
in Supabase and protected by the same Row Level Security policies as everyone else's.

Creating an account later links an email address or an identity provider to the same user, so
the ID and all data stay the same.

Features that must only be available to permanent accounts, such as anything shared with other
people, check the `is_anonymous` claim in the JWT in a restrictive policy.

## Alternatives considered

- **Requiring an account up front**: the simplest model, but it puts the barrier this decision
  is meant to remove in front of every new user.
- **Keeping guest data only on the device until an account is created**: works offline, but
  needs a second data store in the app, duplicates business logic outside Supabase and requires
  migrating the data when the account is created. Offline support is tracked separately in
  [#6](https://github.com/Kaandroids/benchbite/issues/6).

## Consequences

- Every screen can assume a signed-in user, and data is written to Supabase from the first
  launch.
- The first launch needs a network connection. The app shows a retry screen when the sign-in
  fails; later launches work with the stored session.
- An anonymous user cannot sign in again. Losing the session (uninstalling the app, clearing its
  data, switching devices) means losing access to the data, so the app has to encourage guests
  to create an account. See ADR 0004 for how the session is stored.
- Signing out is only offered to permanent accounts.
- Anyone can create users without credentials. Supabase rate-limits anonymous sign-ins per IP
  address; CAPTCHA protection is to be evaluated for hosted projects.
- Anonymous users who never come back accumulate and must be removed by a scheduled cleanup
  job, based on inactivity rather than age.
