# 0056. A model call's input is counted after its place is taken

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

Every request to a model goes through `aiModel()` (ADR 0051): it counts what it sends with the
provider, starts a call with `start_ai_call()`, which sets the most the call may cost aside and
allows one call per user and feature at a time (`call_in_progress`), then calls the model.
Counting came first, so a user's parallel requests each reached the provider's token count
before the one place stopped them; one user could use up the project's rate with the provider
for everyone (#329).

## Decision

- **`aiModel()` takes the place first:** `start_ai_call()` with no input, which only sets the
  answer's most aside and holds the user's place for the feature. Parallel requests stop there,
  before anything goes to the provider.
- **Then it counts,** within 10 seconds, and gives the count to `count_ai_call()`. It decides as
  `start_ai_call()` does, with one rule both share (`ai_call_refusal()`): within the feature's
  input limit, a priced model, and room in the budget for the call with that input. It sets the
  call's reservation to match, once per call, or, when it refuses, gives the place up without a
  record, as the call never reached the model.
- **A count that fails** with the provider, or takes too long, or cannot be set, records the call
  at nothing, which frees the place.
- **`start_ai_call()` still takes a count,** as its tests and any caller that knows the count at
  once rely on, and a call started with one is counted already; `aiModel()` gives none.

## Alternatives considered

- **A local estimate of the tokens instead of the provider's count:** no request to the provider
  at all, but an estimate either sets too much aside and refuses early, or too little, and
  images and audio (#298, #299) are hard to estimate.
- **A separate rate limit per user before counting:** a second mechanism beside the one place
  the database already keeps.

## Consequences

A user has at most one count per feature with the provider at a time. Each request makes one
more call to the database, and a count that hangs holds the user's place for at most 10
seconds.
