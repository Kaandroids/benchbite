# 0013. Write the onboarding only through a function with its owner's rights

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

`complete_onboarding()` saves the profile, goal, starting weight, consent and workout plan in one
transaction and checks the minimum age, the consent and the plan on the way. It first ran with
the caller's rights, so that row level security applied to its writes. That required the tables
to accept the same writes directly, through the API, from anyone signed in. A guest could create a
profile that claims to be finished, without consent and with any birth year, and skip every check.

## Decision

- `complete_onboarding()` runs with its owner's rights (`security definer`), with an empty search
  path, and writes only rows of the caller, whose id comes from the token.
- Users cannot insert profiles, goals or plans directly, and cannot delete plans. They can update
  the answers settings will let them change, but not whether the onboarding was finished.
- Rules that must hold however a row is written are enforced on the tables: the minimum age by a
  trigger, distinct training days and the length of a policy version by check constraints.
- Errors the app tells apart carry their own SQLSTATE codes (`BB001` and on, listed in the
  migration), so the app never matches error messages.

## Alternatives considered

- **Keeping the caller's rights and adding policies for every rule.** Policies cannot express
  "only together with a consent and a plan", so the checks would stay skippable.
- **Saving through an Edge Function with the service role key.** It works, but moves a database
  transaction out of the database and puts the most powerful key on the path of every new user.

## Consequences

- One place decides what a finished onboarding is; the API cannot create a half-finished one.
- The function bypasses row level security, so every change to it must keep writing the caller's
  rows only. Its tests cover the rejected cases and the rows written.
- Features that change plans later need their own functions, as the plan tables are read-only.
