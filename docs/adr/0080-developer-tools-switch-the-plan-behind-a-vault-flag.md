# 0080. Developer tools switch the plan behind a Vault flag

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

The app looks and works differently on each plan (ADR 0078): what waits for premium (ADR 0079),
the limits, Bite and meal photos. To try it on each, a developer gives their local account a plan
by hand, with `give_plan()` in Studio's SQL editor, or deletes the subscription to be free again.
That is slow when the plan changes many times in one sitting, and it is easy to forget that a
plan given by hand ends after its period.

Users may only read their own subscription, and only the service role may give a plan, so the app
cannot change one by itself. Whatever lets it must never work in production.

## Decision

- **`dev_set_plan(plan)` switches the caller's own plan,** called via `rpc()` from a **Plan**
  section of the developer tools: free deletes the subscription, the trial is its seven days from
  now and premium a month from now, both as plans given by hand (source `manual`). It writes
  `subscriptions` as any change does, so that its trigger applies the plan's limits at once.
- **It works only where the Vault holds `dev_tools` set to `on`,** and refuses with `BB053`
  otherwise, before anything else. `pnpm vault:local` sets it on a local stack, beside the secrets
  it already stores there. A hosted project never has it, so the function is there in production
  but does nothing.
- **It needs an account:** a guest has no plan, as the trial needs one. Only `authenticated` may
  call it.
- **The app shows the section only in development against a local Supabase,** as it shows the dev
  account (`canUseDevAccount()`), and only to a signed-in account. The server's flag is what
  guards it; the app's check only keeps the section out of the way.

## Alternatives considered

- **A dev-only Edge Function with the service role:** it would need its own guard all the same,
  such as an environment variable that production must not have, plus CORS and JWT checks, and a
  deploy left out of production. A Postgres function is one migration, tested with pgTAP like the
  rest of the plan.
- **Giving plans by hand in SQL, as before:** no new server path, but it is slow to repeat and
  needs the account's email each time; it stays possible for a longer plan.
- **Leaving the function out of production's migrations:** migrations run the same everywhere, and
  keeping some only local would make the schemas differ. A flag that only a local Vault has keeps
  them alike.
- **Guarding by the database's name or a setting such as `app.settings`:** a hosted project's
  names and settings are not ours to rely on, and Vault is where this project already keeps what
  differs between stacks (ADR 0063).

## Consequences

- Trying the app on each plan takes a tap, and what waits for premium, the limits and the AI
  budgets update as they would for a real change of plan.
- Production has a function that only refuses; were `dev_tools` ever stored in its Vault, anyone
  signed in could give themselves premium. Nothing writes it there, and the name says what it is.
- `pnpm vault:local` must be run once, and again after `pnpm supabase db reset`, before the
  switcher works; until then it says so.
