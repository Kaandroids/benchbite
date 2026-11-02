# 0078. A premium plan with a seven-day trial

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

The AI features were built to need a plan (ADR 0051): `ai_access()` refuses with `plan_required`
while a user has no AI budget. The workout limits come from the database so that a plan can raise
them (ADR 0018). Neither knows yet what a plan is, what it gives, or what it may cost.

Every AI call costs money, and `ai_usage` records what each one cost. Measured in development, an
answer from Bite costs about $0.005 with its lookups, and a meal estimated from a photo about
$0.0025. Tracking workouts and meals costs nothing per use.

## Decision

### What each plan gives

Tracking is free; intelligence and room to grow are premium.

|                    | Free                                                 | Premium                                 |
| ------------------ | ---------------------------------------------------- | --------------------------------------- |
| Tracking           | Logging, the streak, history and progress            | The same                                |
| Onboarding         | The onboarding and its starter plan, which use no AI | The same                                |
| Workouts           | 3, each with up to 20 exercises                      | Up to 500, each with up to 20 exercises |
| Alternatives       | 1 in all: one workout may have a second version      | Up to 5 versions per workout            |
| Bite               | None; earlier chats can be read                      | Chat, voice, photos, cards and notebook |
| Meals from a photo | 2 a week                                             | Within the AI budget                    |

- **What is new:** the free limit on alternatives, 1 in all where every workout had 5 versions.
  The 3 workouts of ADR 0019 and the 20 exercises of ADR 0018 are the free limits as they were. Versions above the new limit
  when it comes wait for premium, as when premium ends.
- **Archived workouts count,** so that archiving is no way around the limit, as ADR 0018 decided.
- **Which versions count:** as ADR 0061 keeps them, adding the first alternative makes the
  workout's own exercises version 1, so a free user's one alternative is two versions of one
  workout. `workout_limits()` gives the versions a workout may have and the alternatives a user may
  add across all workouts.
- **Nothing is deleted when premium ends:** what is above the free limits waits for premium, and
  comes back with it. How it waits, and how that differs from what the user archived, is recorded
  in its own ADR, with the change that builds it.
- **The numbers live in one table,** a row per plan (free, trial and premium) with its limits,
  budgets and quotas, which `workout_limits()` and the AI functions read. ADR 0018 rejected such a
  table while there were two limits and no premium; there are now about ten, for three plans.

### Who is premium

- **Our database decides:** a `subscriptions` table holds each user's plan, whether it is a trial,
  which picks the trial's row of the plan table, its billing period, and its source. `has_premium()` reads it, and `ai_access()`,
  `start_ai_call()` and `workout_limits()` ask it. A plan ends an hour after its period does,
  whatever was last recorded about it: a renewal reaches us a little after the store makes it, and
  in between Bite should not close. The app reads the plan and never decides it, and users may
  read only their own row.
- **RevenueCat keeps the purchases,** which the stores report to it, and our database keeps a copy,
  as the limits are checked on every call and must not depend on another service being reachable.
  How the copy is kept is recorded in its own ADR, with the change that builds it.
- **A plan given by hand:** until the store products exist, a plan can be given with the service
  role, with a start and an end, so that premium is used for real before it is sold.

### The trial

- **Seven days, as the stores offer it:** an introductory free trial on the subscription, which
  App Store and Google Play run, with the payment method given at the start.
- **It needs an account,** as AI does: a guest signs up first.
- **It is a budget period of its own,** with $1.50 for AI. What it spends does not count toward the
  first paid one.

### The AI budget

- **Premium has $4 a budget period,** so that a premium user can never cost more than that in one.
  A budget period is the monthly subscription's billing period, from one renewal to the next,
  whatever its length; a yearly subscription is divided into months, month _n_ starting _n_ months
  after it began, on the same day, or the month's last day when it has fewer. A yearly price must
  then cover twelve of them.
- **And at most $1.50 a week,** about 300 answers from Bite: weeks are counted in 7-day steps from
  the start of each budget period, and begin again with every one, so that they do not drift. The
  days left after the fourth week are a short week of their own. The weekly cap spreads the budget
  over the period; the period's $4 is what bounds the cost.
- **A free user's AI is counted, not priced:** two meals estimated from a photo a week, in 7-day
  steps from when the account was made. Only an estimate given counts: one refused, broken off or
  closed unfinished does not. A guest has none, as AI needs an account. `start_ai_call()` counts
  calls in flight toward it, so that two requests sent at once cannot both pass, and records on
  each call whether it was made without premium. `estimate-meal` marks a call as an estimate given
  once it has parsed one, through a function only the service role may call; a call that ends
  without that mark frees its place.
- **Behind the count, a small budget:** calls that do not count still cost, so a free week also has
  $0.10 for AI, checked against what its calls made without premium did cost, never against what a
  call sets aside: that is more than one photo may cost, and would refuse the first. Once it is
  spent, photos wait for the next week.
- **One function counts the windows:** a user's budget period, week and free week are steps from a
  start date, the period's or the account's. One internal function gives them, and what was used
  in each, and `ai_access()`, `start_ai_call()` and `count_ai_call()` all read it.
- **`ai_access()` decides by feature,** and when it refuses, `resets_at` is when AI opens again:
  the later of the windows that refuse.

### Selling and price

- **The limits lead to the plan:** reaching a free limit, or `plan_required`, shows what premium
  adds, with a design approved first. The stores' rules apply: the price, that it renews,
  restoring purchases, and the terms and privacy links.
- **The price follows the measured cost:** it is set once `ai_usage` shows what real use costs a
  budget period, with the stores' fee and VAT taken off, and it covers the $4 a period may cost.

## Alternatives considered

- **A trial in the app, without a payment method:** more people would try premium, but fewer would
  pay, and a new account would give a new trial.
- **The stores' own purchase APIs, without RevenueCat:** no fees, but receipts, renewals, refunds
  and trial eligibility would each be written and checked on the server for two stores.
- **Asking RevenueCat on every call:** no copy to keep, but every message to Bite and every new
  workout would wait for another service, and fail with it.
- **Charging for tracking:** it is what people come for and compare apps by; behind a plan, they
  would leave before seeing what Bite adds.
- **Calendar months and weeks:** simpler to count, but a period bought mid-month could draw on two
  months' budgets, and a fixed weekly reset treats subscribers unevenly.
- **Counting every free call that reaches the model:** a cap on cost by itself, but a photo the
  model could not read, or a call that broke off, would use up one of the week's two estimates.
- **Keeping everything usable after premium ends:** kinder, but there would be little reason to
  stay premium; kept and waiting, the user's work brings them back instead.

## Consequences

- `ai_budgets` is dropped: the budget follows from `subscriptions`, the trial and the free quotas,
  in one place, and in development a plan is given by hand instead. This amends ADR 0051, whose budget was monthly and set by
  `ai_budgets`, and whose callers did not pass a feature.
- `workout_limits()` depends on the plan, as ADR 0018 foresaw, and gives a limit per user as well
  as per workout, from the table ADR 0018 rejected. This amends ADR 0018 and the 5 versions per
  workout of ADR 0061. The plan builder's `FREE_WORKOUTS` and `FREE_WORKOUT_EXERCISES` mirror the
  free row, and a test checks them against it.
- `start_ai_call()` and `count_ai_call()` check the free quota by count for counted features, and
  the budget by cost for the rest.
- The purchases need a development build, as RevenueCat's SDK is native; Expo Go cannot buy.
- The plan's numbers are database values, so changing a limit, a budget or a quota takes a
  migration, not an app release.
