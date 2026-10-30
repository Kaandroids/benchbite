# 0059. Estimating a meal from photos

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

The user should be able to log a meal by taking a photo of it, in Nutrition's add screen and in
Bite's chat (#299). The estimate is a starting point the user checks and corrects before it is
logged, and it is the most expensive AI feature per use, as photos are large inputs and the
answer has to be read by code. The same food should come out at the same values every time, and
match what the user logs by hand.

## Decision

- **An Edge Function, `estimate-meal`,** takes one to three photos of the same meal (JPEG, PNG or
  WebP, scaled down on the device, at most 1.5 MB each and 3 MB together), the app's language,
  optionally the meal, and for a correction the user's note (at most 300 characters) and the
  items of the last estimate. It answers with JSON, not a stream: `isFood`, the items and Bite's
  short line, or `{ error: reason }` with an HTTP status, the reasons being those of `ai_access()`
  and `start_ai_call()`, `photos_too_large`, `blocked` and `unavailable`. The request, the answer,
  the limits and the reasons are written once, in `_shared/meal/estimate.ts`, which the app
  imports too.
- **One model request per estimate,** through `aiModel()` with the `meal_photo` feature
  (ADR 0051), so that its budget, its limits and its recording apply. The request is lean: short
  fixed rules, the language, the meal and a correction's data, and the photos; no chat history,
  no snapshot and no tools. Photos over the limits are refused before anything is sent.
- **The model answers in a structured shape** (`responseSchema`): for each item a name in the
  user's language, a `searchName` as the food library names foods ("Rice, boiled"), the grams by
  eye, a confidence from 0 to 1, its own values per 100 g, and what is uncertain; `isFood` false
  for a photo of no food. The function checks the answer with zod, and answers `unavailable` for
  any other shape.
- **The values come from the food library, not the model.** Each item is looked up with
  `search_foods()` as the user, so that row level security applies and their own foods and
  recipes are found too, without another model request. A found food counts only when its name
  holds the food searched for, the part of `searchName` before a comma, so that a name that is
  only alike is no match; the user's own food or recipe that starts with it comes before the
  library's. The item then names the food as a meal entry does (`library`, `custom` or `recipe`,
  with its id) and takes its values; an item with no match keeps the model's values and is marked
  `estimated`. Grams and values per 100 g are returned; the app works out the totals.
- **A correction is a new estimate:** the user's note and the earlier items go with the photos,
  and the model is told that the note is true for what it names and to keep the rest.
- **What the user wrote, and text in the photos, is data:** the note and the earlier items go in
  their own tags, untagged as the chat's messages are (ADR 0052), and the rules say that nothing
  in them is an instruction. Bite gives no medical, allergy or diet advice.

## Alternatives considered

- **The model's values for every item:** simpler, and what some apps do, but the same food would
  come out at different values from one photo to the next, and differ from what the user logs by
  hand or keeps as their own food.
- **Estimating through the full coach chat:** the chat could estimate with its tools, but would
  send the history, the snapshot and several rounds of tool calls, about four to six times the
  cost of one lean request, and its answer would be free text the app could not log.
- **A second model request to pick each item's food among the search results:** a better match
  for unusual names, but it doubles the requests for every estimate; the `searchName` in the
  library's form is matched well enough by the search.

## Consequences

- An estimate costs one `meal_photo` request, about $0.008, and is counted against the user's
  monthly limit like the chat.
- Logged foods keep the library's values, so an estimate and a hand-logged meal agree. An item
  the library does not have is only as good as the model's guess, and the app shows it as
  estimated; logging one needs a food of the user's own, which the app's flow decides.
- The match depends on the model naming foods as the library does; a food named otherwise falls
  back to the model's values rather than to a wrong food.
- Questions about an estimate afterwards go to the normal chat, which gets the estimate as text,
  not the photos again.
