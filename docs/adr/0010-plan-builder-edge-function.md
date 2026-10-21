# 0010. Build the starter workout plan in an Edge Function from fixed rules

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

The onboarding ends with a workout plan built from the user's goal, experience, training days,
equipment and session length. It is the first piece of server-side logic that is easier to
express in code than in SQL, and the project's first Edge Function. Personal, adaptive plans
are planned later with AI coaching; the starter plan has to be good, safe and predictable.

## Decision

- **Where:** an Edge Function, `generate-plan`, returns the plan without saving it. The
  onboarding saves it together with the profile.
- **Structure:** the rules are pure TypeScript in `supabase/functions/_shared/plan/`, without
  database or network access; the function only validates the request with zod, reads the
  catalogue and calls them. All functions share one import map, `supabase/functions/deno.json`,
  and the database types are copied into `_shared`.
- **Security:** `withSupabase` from `@supabase/server` requires a user JWT, anonymous users
  included, and `verify_jwt` stays on, so the platform checks the token first. The catalogue is
  read with the user's token, so no service role key is involved. CORS is off, because only the
  native app calls the function.
- **Rules:**
  - Split by training days: full body for one or two days, and for three days for beginners;
    push, pull, legs for three days otherwise; upper and lower for four; both for five; push,
    pull, legs twice for six. Seven days are not allowed, so there is always a rest day.
  - Each session type is an ordered list of slots, movement patterns such as a squat or a
    horizontal pull. Each slot takes the first exercise from the catalogue (ADR 0008,
    `plan_slot_exercises`) that the user's setup and experience allow; a repeated session type
    takes the next one. Slots without a possible exercise are left out.
  - Sets, a rep range or a time, and rest follow the goal, the experience and whether the slot
    is a main exercise or an accessory. Exercises that record reps get a rep range, holds a time.
  - Slots are filled in order while the session length allows, with fewer sets before a slot is
    dropped; 30-minute sessions take one set less of everything. A session counts five minutes
    of warm-up, the sets, the rest between them and a minute to set up each exercise.
  - Fat loss sessions end with five or ten minutes of conditioning.
  - The same answers always give the same plan.
- **Tests:** Deno unit tests run the rules against a small catalogue. `pnpm check:plans` calls the
  function on the local stack for all 864 combinations of answers and checks every plan against
  the real catalogue. Both run in CI.

## Alternatives considered

- **A Postgres function:** keeps everything in the database, but rules with this many branches
  are much harder to read and test in SQL.
- **Choosing exercises by muscle from the whole library:** no list to maintain, but the library
  contains many unusual exercises that do not belong in a starter plan.
- **Randomised plans:** more variety, but harder to test and to explain. Variety will come from
  swapping exercises and from AI coaching.
- **Calling the rules in the app:** the plan would be shown instantly, but business logic lives
  in Supabase, and AI coaching will replace the rules on the server later.

## Consequences

- The plan builder depends on the catalogue: a slot without candidates for a setup is silently
  left out, so the catalogue tests guard the essential slots.
- The time estimate is rough; it is meant to keep sessions within the chosen length, not to
  predict them to the minute.
- Changing the rules changes the plans of new users only; saved plans stay as they are.
