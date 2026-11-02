# 0078. A premium plan with a seven-day trial

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

The AI features were built to need a plan (ADR 0051): `ai_access()` refuses with `plan_required`
while a user has no AI budget. The workout limits come from the database so that a plan can raise
them (ADR 0018). Neither knows yet what a plan is, what it costs or how a user gets one.

Every AI call costs money, and `ai_usage` records what each one cost. Measured in development, an
answer from Bite costs about $0.005 with its lookups, and a meal estimated from a photo about
$0.0025. Tracking workouts and meals costs nothing per use.

## Decision

- **Tracking is free; intelligence and room to grow are premium.**

  | Free                                                         | Premium                                        |
  | ------------------------------------------------------------ | ---------------------------------------------- |
  | Logging workouts and meals, the streak, history and progress | Everything free has                            |
  | The onboarding and its starter plan, which use no AI         | Bite: chat, voice, photos, cards and notebook  |
  | 3 workouts, each with up to 20 exercises                     | Up to 500 workouts                             |
  | 1 alternative workout in all                                 | Up to 5 alternatives per workout               |
  | 2 meals estimated from a photo a week                        | Meals estimated from photos, within the budget |

- **AI is held to a budget per plan.** Premium has $4 a calendar month and at most $1.50 a week,
  so that a month's budget cannot go in a few days. A free user's AI is counted, not priced: two
  photo estimates a week, and nothing else. `ai_access()` decides by the feature a call is for.
- **A seven-day trial, as the stores offer it:** an introductory free trial on the subscription,
  which App Store and Google Play run, with the payment method given at the start. It needs an
  account, as AI does: a guest signs up first. A trial's AI budget is $1.50, one week's.
- **One place says who is premium:** a `subscriptions` table holds each user's plan, its state,
  when it ends, whether it is a trial, and its source. `has_premium()` reads it, and
  `ai_access()` and `workout_limits()` ask it. The app reads the plan, never decides it.
- **RevenueCat sells the subscriptions:** its SDK makes the purchases in the app, and its webhook
  reaches an Edge Function that writes `subscriptions`. Until the store products exist, a plan can
  be given by hand (source `manual`), with the service role, so that premium is used for real
  before it is sold.
- **The limits lead to the plan:** reaching a free limit, or `plan_required`, shows what premium
  adds, with a design approved first. The stores' rules apply to it: the price, that it renews,
  restoring purchases, and the terms and privacy links.
- **The price follows the measured cost:** it is set once `ai_usage` shows what real use costs a
  week and a month, with the stores' fee and VAT taken off. A premium user can cost at most the
  budget, $4 a month.

## Alternatives considered

- **A trial in the app, without a payment method:** more people would try premium, but fewer would
  pay, and a new account would give a new trial.
- **The stores' own purchase APIs, without RevenueCat:** no fees, but receipts, renewals, refunds
  and trial eligibility would each be written and checked on the server for two stores.
- **Charging for tracking:** it is what people come for and compare apps by; behind a plan, they
  would leave before seeing what Bite adds.
- **A budget per month only:** a few heavy days could use it up and leave Bite closed for weeks.

## Consequences

- `ai_budgets` gives way to the plan: the budget follows from `has_premium()`, the trial and the
  free quotas, in one function.
- `ai_access()` takes the feature it decides for, so the callers pass it.
- Existing users stay within the free limits, or keep what they have above them without adding
  more.
- The purchases need a development build, as RevenueCat's SDK is native; Expo Go cannot buy.
- The plan's numbers are database values, so changing a limit, a budget or a quota takes a
  migration, not an app release.
