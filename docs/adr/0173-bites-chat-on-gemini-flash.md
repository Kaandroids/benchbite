# 0173. Bite's chat on Gemini Flash

- **Status:** Accepted
- **Date:** 2026-11-27

## Context

ADR 0049 put Bite's chat on Gemini 3.5 Flash-Lite, the cheapest model that takes audio, and left
moving it to Flash for when Flash-Lite fell short. It did on 2026-11-27 in the hosted project: from
14:08 UTC every answer in a thread was cut short with no card, though the user asked for a meal to
be logged. Flash-Lite wrote the tool call as text in its answer, as
`<call:default_api:log_meal_card{items:[…]}>`, instead of making it. A call written so does
nothing, the answer was kept as it was, and the next answers in the thread copied it. It also
logged the meal the user named as another dish. The same request on the same code ran correctly
in development, so the failure comes and goes with the model, not with a change of ours.

The chat turns Bite's words into cards through tools (ADR 0058, 0062, 0172), so a model that
writes its calls as text breaks the chat's main use. Gemini 3.8 Flash already reads the meal
photos and writes the reviews. Every AI call is priced and held to the user's budget (ADR 0051,
0078), which bounds what a dearer model can cost.

## Decision

- **Chat runs on Gemini 3.8 Flash,** with low thinking, as the meal photos do. Writing down a voice
  note (`coach_voice`) stays on Flash-Lite, the cheaper model: it calls no tools.
- **A tool call written as text is caught** whatever the model: it and what follows it are neither
  shown nor kept, earlier answers are read without it, and Bite is asked once to make the call.
- **Why an answer ended early is logged,** in the provider's own words, such as
  `MALFORMED_FUNCTION_CALL`, as a message keeps only that it was cut.
- `LLM_MODEL_COACH_CHAT` can still move chat to another priced model without a change to the code,
  so the hosted project can go back to Flash-Lite, or take Flash before this is deployed.

## Alternatives considered

- **Stay on Flash-Lite and only catch the text calls:** each caught call costs a second request
  and the card still depends on the retry; the wrong dish showed the model's weakness beyond tool
  calls.
- **Medium thinking on Flash-Lite:** more reasoning tokens on every answer, with no sign that it
  stops the text calls.
- **Retry without telling the model why:** the same history leads to the same answer.

## Consequences

- An answer costs about twice what it did: in the EU, $0.825 and $4.125 per million input and
  output tokens on Flash against $0.33 and $2.75 on Flash-Lite, so about $0.008 for a typical
  answer of 7,500 tokens in and 500 out, before the cache. From 2027-01-01 Flash costs twice that
  again. The budget of ADR 0078 stays: a user who chats a lot reaches the weekly $1.50 sooner,
  at about 180 such answers a week now and about 90 from 2027.
- A voice message's audio is heard by the chat on Flash now, at Flash's price, as the chat hears
  it itself (ADR 0072); only writing it down stays on Flash-Lite.
- Flash answers somewhat slower than Flash-Lite; the answer streams, so the first words come soon.
- The text-call check is a guard for any model, and its retry is counted like any other request.
