# 0051. What AI costs, and a limit per user and month

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

Bite's chat, voice, meal photos and reviews call a language model (ADR 0049), which is billed by
the token. One user, by mistake or on purpose, could otherwise run up a bill without end. Later
the AI features will be for premium users, with a limit from their plan.

## Decision

- **Every call is recorded** in `ai_usage`: the user, the feature, the model and its tokens (input,
  cached input, output and the reasoning within it), and what it cost. Users read their own rows;
  only Edge Functions write them, with the service role, through `record_ai_usage()`.
- **Only the database knows prices.** `ai_model_prices` holds each model's price per million
  tokens from a date on, filled by migrations; `record_ai_usage()` prices a call at the price in
  force and stores the cost, so a change of price leaves past calls as they were. A model without
  a price is refused (BB033), so it is noticed rather than counted as free.
- **The limit is $4 per user and calendar month in UTC,** in `ai_settings`.
- **`ai_access()` is the one place that decides** whether the user may call a model, with the
  budget, what is used and when it resets. Guests may not, as AI needs an account; a user who has
  reached the limit may not until the month resets.
- **Check before, record after:** a function asks `ai_access()` with the user's token, calls the
  model, and records the call (`_shared/ai_usage.ts`). Two calls at the same moment may go a
  little over the limit, which is accepted.
- **This log is what counts.** The tokens kept on Bite's messages (ADR 0050) only record what an
  answer used.

## Alternatives considered

- **Counting tokens instead of dollars:** simpler, but models differ in price by ten times, and
  a limit in tokens would mean something different per feature.
- **Prices in the Edge Functions:** no table, but a price change would need a deploy, and every
  function would carry its own copy.
- **Reserving the cost before the call:** keeps the limit exactly, but the cost is only known
  after the answer, and a failed call would have to give its reservation back.
- **The provider's own budget alerts:** they cap the project, not a user.

## Consequences

- A new model needs a price in a migration before a function may use it.
- The premium plan changes `ai_access()` only; the callers stay the same.
- Prices are the Gemini Developer API's; Vertex AI (ADR 0049) gets its own rows when it comes.
