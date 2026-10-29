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
  tokens from a date on, filled by migrations; `record_ai_usage()` prices a call by the model it
  was started on, at the price in force when it started, and stores the cost, so a change of
  price leaves past calls as they were.
- **A user's limit is their budget per calendar month in UTC,** in `ai_budgets`, which their plan
  will set. Without one it is nothing: AI comes with a plan. In development, a budget is set by
  hand.
- **The bill as a whole is capped at the provider,** with a budget on the Google Cloud project,
  not in the database: per-user budgets of nothing by default already keep new accounts from
  adding to it.
- **`ai_access()` is the one place that decides on the limit,** with the budget, what is used and
  when it resets. Guests may not call a model, as AI needs an account; a user without a budget may
  not, as it needs a plan; a user who has reached the limit may not until the month resets.
- **A call is one request to a model, and the most it may cost is set aside before it runs.** A
  function calls a model only through `aiModel()` (`_shared/ai_usage.ts`), the model for one
  task. Before each request it counts what the request sends with the provider
  (`countTokens()`, which costs nothing), and `start_ai_call()`, with the user's token, refuses
  it if that is more than the feature allows (`ai_feature_limits`), if the model has no price, if
  a call of the feature is still running, or if the budget left cannot pay for it at its most:
  what it sends, and the most it may answer. That most is kept in `ai_calls_in_flight` as spent
  until the call is recorded, so requests sent at once cannot go over the budget, and the answer
  is cut at the feature's `max_output_tokens`. A chat that calls tools makes one call per request.
- **Every call is recorded, however it ends:** at what it used when the answer came whole, at
  nothing when the provider refused the request, and at its most when what it used is not known:
  a stream left or broken off before its end, which also stops the request, or a call that never
  recorded, as when its function was stopped, once ten minutes have passed. A call that records
  after all replaces its most with what it did cost.
- **The features are the model interface's tasks:** a function names one `ai_feature`, which
  picks the model (ADR 0049) and is what its usage is recorded under.
- **This log is what counts.** The tokens kept on Bite's messages (ADR 0050) only record what an
  answer used.

## Alternatives considered

- **Counting tokens instead of dollars:** simpler, but models differ in price by ten times, and
  a limit in tokens would mean something different per feature.
- **Prices in the Edge Functions:** no table, but a price change would need a deploy, and every
  function would carry its own copy.
- **Checking the budget before a call and counting it only after:** simpler, but calls sent at
  once all pass before any is counted, and a call that never records is never counted.
- **The provider's own budget alerts:** they cap the project, not a user.

## Consequences

- A new model needs a price in a migration before a function may use it.
- A new feature needs its limits in a migration, and a new task starts with the `ai_feature`
  enum, which the model interface's tasks are.
- Each request to a model waits for a count of its tokens first, a call to the provider of about
  a tenth of a second.
- A call near the end of a budget may be refused although it would have cost less than the most
  set aside for it.
- The premium plan changes `ai_access()` only; the callers stay the same.
- Prices are the Gemini Developer API's; Vertex AI (ADR 0049) gets its own rows when it comes.
