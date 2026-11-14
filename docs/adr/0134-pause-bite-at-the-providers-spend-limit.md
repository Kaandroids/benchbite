# 0134. Pause Bite at the provider's spend limit, and warn before it

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Each user's AI use is limited by their plan's budget (ADR 0051, ADR 0078). The provider also caps
the project as a whole: the Gemini Developer API has a monthly spend limit of 50 euros, which
resets on the first of the month. Once it is reached, the provider refuses every call, and the app
showed only "Bite couldn't answer just now. Try again.", which trying again cannot fix. Nothing
warned the maintainer before that (#555).

## Decision

- **The month's spend of all users together is counted in `ai_spend_months`,** one row per
  calendar month (UTC). A trigger on `ai_usage` adds what each call costs, and the difference when a
  call is recorded again. It is kept apart from `ai_usage` because those rows go with a deleted
  account while the provider still bills the calls. It also means checking the month needs no sum.
  Calls still running count at their most.
- **The provider's limit is kept in `ai_spend_limit`,** with the share the Monitor warns at: $50
  and 80 % for now. The limit is in dollars, the currency costs are counted in. As long as a euro is
  worth more than a dollar, this stops a little before the provider would. A migration changes it
  when the provider's limit changes.
- **At the limit, `ai_access()` refuses with a new reason, `service_paused`,** after the user's own
  reasons, so a guest still needs an account and a used-up month stays used up. `start_ai_call()`
  asks it, so no call starts until the next month. The app shows "Bite is taking a short break",
  with no amount, percentage or date: users never see what AI costs, only how much of their own
  budget is left, as a share.
- **The Monitor warns** (ADR 0067). Its **AI spend** job runs `ai_spend_status()` with the
  read-only token (ADR 0132). It fails at 80 % of the limit, and again once Bite is paused. Its log
  says only which, never how much, as the log of a public repository is public.

## Alternatives considered

- **Leave the limit to the provider alone:** Bite would stop anyway, but with an error and no
  warning.
- **Map the provider's error to the new reason:** the error for a spent limit is not documented
  apart from rate limits, and a rate limit should be tried again. Stopping at our own count, before
  the provider does, needs no guess.
- **Sum `ai_usage` for the month on every call:** simpler, but it forgets deleted accounts' calls
  and grows with every call of the month.

## Consequences

- At the limit Bite pauses for every user, as it would anyway. Each one is told why, and the
  maintainer hears of it at 80 %.
- Every recorded call also updates the month's one row. That is a point of contention, which is
  fine at this scale.
- The count is ours, from our prices, so it can drift from the provider's bill. A provider's limit
  in another currency, or one that starts its month in another time zone, stops a little early or
  late.
- When Bite moves to Vertex AI (#549), whose budgets only alert, this limit becomes the one that
  stops spending.
