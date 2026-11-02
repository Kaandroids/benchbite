# 0078. A premium plan with a seven-day trial

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

The AI features were built to need a plan (ADR 0051): `ai_access()` refuses with `plan_required`
while a user has no AI budget. The workout limits come from the database so that a plan can raise
them (ADR 0018). Neither knows yet what a plan is, what it costs, or how a user gets or loses one.

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
| Workouts           | 3 active, each with up to 20 exercises               | Up to 500, each with up to 20 exercises |
| Alternatives       | 1 in all: one workout may have a second version      | Up to 5 versions per workout            |
| Bite               | None; earlier chats can be read                      | Chat, voice, photos, cards and notebook |
| Meals from a photo | 2 a week                                             | Within the AI budget                    |

A workout's versions are counted as ADR 0061 keeps them: adding the first alternative makes the
workout's own exercises version 1, so a free user's one alternative is two versions of one
workout. `workout_limits()` gives the versions a workout may have and the alternatives a user may
add across all workouts.

### Who is premium

- **Our database decides:** a `subscriptions` table holds each user's plan, its state, its billing
  period, whether it is a trial, and its source (`revenuecat` or `manual`). `has_premium()` reads
  it, and `ai_access()`, `start_ai_call()` and `workout_limits()` ask it. The app reads the plan
  and never decides it, and users may read only their own row.
- **RevenueCat keeps the purchases:** the stores report purchases, renewals, cancellations,
  billing issues and refunds to RevenueCat, which knows a user by their account's id. Its webhook
  reaches an Edge Function that checks RevenueCat's secret, as it carries no user's token, takes
  the user and the entitlement from the event, and writes `subscriptions`. After a purchase, the
  app also asks for the subscription to be read from RevenueCat at once, so that premium does not
  wait for the webhook. The database is a copy, as the limits are checked on every call and must
  not depend on another service being reachable.
- **A plan given by hand:** until the store products exist, a plan can be given with the service
  role (source `manual`), with a start and an end, so that premium is used for real before it is
  sold.

### The trial

- **Seven days, as the stores offer it:** an introductory free trial on the subscription, which
  App Store and Google Play run, with the payment method given at the start.
- **It needs an account,** as AI does: a guest signs up first.
- **It is a period of its own,** with $1.50 for AI. What it spends does not count toward the first
  paid period.

### The AI budget

- **Premium has $4 a billing period:** the period the store bills, from one renewal to the next,
  whatever its length. A yearly subscription is divided into months from the day it began. A paid
  period can then never cost more than $4.
- **And at most $1.50 a week:** weeks are counted in 7-day steps from the start of each period,
  and begin again at every renewal, so that they do not drift. The days left after the fourth week
  are a short week of their own. The weekly cap spreads the budget over the period; the period's
  $4 is what bounds the cost.
- **A free user's AI is counted, not priced:** two meals estimated from a photo a week, in the same
  7-day steps from when the account was made. Only an estimate given counts; one refused or broken
  off does not. `start_ai_call()` counts calls in flight toward it, as it sets cost aside for the
  budget, so that two requests sent at once cannot both pass.
- **`ai_access()` decides by feature,** and when it refuses, `resets_at` is when the window that
  refuses opens again.

### When premium ends

Nothing is deleted, but what is above the free limits waits for premium:

- **Workouts:** the 3 most recently trained stay active, and the rest are moved to the archive,
  marked as moved there by the plan. The user may choose other 3 at any time. Archived workouts
  come back from the archive only while fewer than 3 are active.
- **Alternatives:** each workout keeps the version in use. The other versions are kept but locked,
  except those of one workout: the most recently trained one with alternatives, which the user may
  choose instead.
- **Bite:** closed. Earlier chats can be read, and the free photo estimates go on.
- **Premium again:** workouts the plan moved to the archive come back, and the locks are lifted.
  Workouts the user archived stay there.

This happens on the server when the subscription ends, as the app may be closed then. The app asks
once which workouts and which alternative to keep.

### Selling and price

- **The limits lead to the plan:** reaching a free limit, or `plan_required`, shows what premium
  adds, with a design approved first. The stores' rules apply: the price, that it renews,
  restoring purchases, and the terms and privacy links.
- **The price follows the measured cost:** it is set once `ai_usage` shows what real use costs a
  period, with the stores' fee and VAT taken off. A premium user can cost at most $4 a period.

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
- **Keeping everything usable after premium ends:** kinder, but there would be little reason to
  stay premium; archived and locked, the user's work waits for them instead.

## Consequences

- `ai_budgets` gives way to the plan: the budget follows from `subscriptions`, the trial and the
  free quotas, in one place. This amends ADR 0051, whose budget was monthly and set by
  `ai_budgets`, and whose callers did not pass a feature.
- `workout_limits()` depends on the plan, as ADR 0018 foresaw, and gives a limit per user as well
  as per workout. This amends ADR 0018 and the 5 versions per workout of ADR 0061.
- `start_ai_call()` and `count_ai_call()` check the free quota by count for counted features, and
  the budget by cost for the rest.
- The purchases need a development build, as RevenueCat's SDK is native; Expo Go cannot buy.
- The plan's numbers are database values, so changing a limit, a budget or a quota takes a
  migration, not an app release.
