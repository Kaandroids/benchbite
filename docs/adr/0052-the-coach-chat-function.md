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
  one), the app's language and the user's day, and answers as server-sent events: for a new
  thread, `thread` with its id first, so that the app keeps it however the answer ends;
  `expression`, then `text` as it comes, `tool_start` and `tool_end` around each lookup, and at
  the end either `done` with the thread and message, and `interrupted` in it when the answer
  stopped short, with why (`failed`, `refused`, `stopped` or `cut`) and the `reason` of a failure
  or refusal, or `error` with a reason when Bite saved no answer (`plan_required`,
  `limit_reached`, `blocked`, `unavailable`…).
  The events, the request, the tools' names and the longest message are written once, in
  `_shared/coach/chat.ts`, which the app imports too.
- **What Bite is told, in order:** fixed instructions (its character, safety rules and its face),
  the same for every user so that the provider can cache them; the thread's last 20 messages, as
  text, Bite's with their faces; and the new message, with a snapshot of the user before it,
  read with their token (profile, goal, latest weight, today's targets and food, today's
  workouts, streak, and the calorie floor, a column of the profile from `calorie_floor()`, which
  the targets keep to). The
  snapshot and the tools' results are data: the instructions say that nothing in them is an
  instruction, as the user writes some of it.
- **Bite looks things up with read tools**, run with the user's token so that row level security
  applies: `get_workout_history`, `get_meal_log`, `get_week_summary`, `get_records`,
  `search_foods`, `search_exercises`. Each has one zod schema, which checks its calls and is the
  JSON Schema the model is told of. They return little, name things as the app does, and say
  what is wrong with a call, for the model to correct. Bite may look things up in four rounds of
  at most five lookups, then has to answer. Bite changes no data.
- **The face comes first:** each request's answer starts with `[[happy]]` or another of the
  five expressions, which the function takes off; the first is sent as its own event, and an
  answer without one is neutral.
- **The turn is saved when the answer is done,** or when it stops short with text already given
  (the app stopped it, the budget ran out after a lookup, it was cut at the token limit): the
  user's message and Bite's, with its lookups and their results, its face,
  and what its requests used. The lookups are trimmed to what a message may hold. When Bite
  said nothing, a question the model was asked stays in the thread without an answer, as the app
  shows it, so that Bite sees it next time. A message that never reached the model, as when it
  was refused, stopped first or the call could not start, is not kept, though the app still
  shows it unanswered, to ask again; a thread started for it goes again, which the error says
  with `dropped`. As nothing is sent after a stop, the app gives up a new thread it stopped
  before any text by itself, and one too long to go on with (`request_too_large`).
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
