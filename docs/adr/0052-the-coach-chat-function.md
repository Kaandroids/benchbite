# 0052. Bite answers in a stream of events, from a prompt, a snapshot and read tools

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

Bite's chat (#292) answers the user's message with what it knows of them: who they are, their
goal, today's food and plan, and, when asked, their history, records and the food and exercise
libraries. The app shows the answer as it comes, with Bite's face first and a status line while
Bite looks something up, and the conversation goes on in its thread (ADR 0050). Every request to
the model is limited and counted (ADR 0051).

## Decision

- **An Edge Function, `coach-chat`,** takes the message, the thread to go on with (none for a new
  one), the app's language and the user's day, and answers as server-sent events: `expression`,
  then `text` as it comes, `tool_start` and `tool_end` around each lookup, and `done` with the
  thread and message, or `error` with a reason (`plan_required`, `limit_reached`,
  `unavailable`…).
- **What Bite is told, in order:** fixed instructions (its character, safety rules and its face),
  the same for every user so that the provider can cache them; a snapshot of the user, read with
  their token (profile, goal, latest weight, today's targets and food, today's workouts, streak);
  the thread's last 20 messages, as text only; and the new message.
- **Bite looks things up with read tools**, run with the user's token so that row level security
  applies: `get_workout_history`, `get_meal_log`, `get_week_summary`, `get_records`,
  `search_foods`, `search_exercises`. They return little and say what is wrong with a call, for
  the model to correct. Bite may look things up four times, then has to answer. Bite changes no
  data.
- **The face comes first:** the answer starts with `[[happy]]` or another of the five
  expressions, which the function takes off and sends as its own event; an answer without one is
  neutral.
- **The turn is saved when the answer is done,** or when the app stops it with text already
  given: the thread, if new, the user's message, and Bite's, with its lookups and their results,
  its face, and what its requests used. A refused or failed answer with no text saves nothing.
- **The answer is in the app's language,** which the app sends, whatever language the data is in.

## Alternatives considered

- **Returning the whole answer at once:** simpler, but the user waits for the slowest part of a
  long answer, and lookups would show nothing.
- **The face as a structured field or a tool:** cleaner to read, but structured output does not
  stream as text, and a tool call costs another request before the answer.
- **Sending the whole thread, lookups included:** the model would see what it looked up before,
  but each message would grow with old results the snapshot or a new lookup gives better.
- **A summary of older messages:** keeps long threads cheap; left for later, as threads are short
  now.

## Consequences

- The consent to process health data with AI (#290) is checked by `ai_access()` once it exists,
  so this function does not change for it; until then, AI needs a budget, which only development
  accounts have.
- A message to Bite costs one request, and one more for each round of lookups; each is limited
  and counted on its own (ADR 0051).
- Notes Bite keeps (#296) and proposals the user applies (#297) add to the snapshot and the tools.
