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
  force and stores the cost, so a change of price leaves past calls as they were. A call is priced
  by the model asked for, not the version the provider says answered.
- **The limit is $4 per user and calendar month in UTC,** in `ai_settings`.
- **`ai_access()` is the one place that decides on the limit,** with the budget, what is used and
  when it resets. Guests may not call a model, as AI needs an account; a user who has reached the
  limit may not until the month resets.
- **Start before, record after:** a function runs every call of a model through `withAiCall()`
  (`_shared/ai_usage.ts`), which starts it with `start_ai_call()` and the user's token, and
  records it afterwards with what it used, also when it failed part-way, as the provider bills
  that too. Starting refuses what the limit refuses, a model without a price, so that no call
  goes uncounted, and a second call of a feature while one runs, so that requests sent at once go
  over the limit by one call at most per feature. Each call holds its place by its own id, and a
  call that never recorded gives the place up after ten minutes, longer than a function may run.
- **The features are the model interface's tasks:** a function names one `ai_feature`, which
  picks the model (ADR 0049) and is what its usage is recorded under.
- **This log is what counts.** The tokens kept on Bite's messages (ADR 0050) only record what an
  answer used.

## Alternatives considered

- **Counting tokens instead of dollars:** simpler, but models differ in price by ten times, and
  a limit in tokens would mean something different per feature.
- **Prices in the Edge Functions:** no table, but a price change would need a deploy, and every
  function would carry its own copy.
- **Reserving the cost before the call:** keeps the limit exactly, but the cost is only known
  after the answer; one call at a time per feature bounds how far over it can go instead.
- **The provider's own budget alerts:** they cap the project, not a user.

## Consequences

- A new model needs a price in a migration before a function may use it.
- The premium plan changes `ai_access()` only; the callers stay the same.
- Prices are the Gemini Developer API's; Vertex AI (ADR 0049) gets its own rows when it comes.
