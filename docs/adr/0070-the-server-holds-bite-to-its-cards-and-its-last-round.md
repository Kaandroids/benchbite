# 0070. The server holds Bite to its cards and to its last round

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

Bite makes cards with tools: `log_meal_card` and the three proposals (ADR 0052, 0066, 0068).
Measured on the local stack with Gemini 3.5 Flash Lite, the model often wrote the sentence that
comes with a card and ended its round without the call: 10 of 20 answers to a meal to log spoke
of a card that never came (#383), and 3 of 20 answers to a change of targets said a change was
proposed when none was (#386). A higher thinking level did not help.

The last round of a turn, meant to answer with what Bite has, was sent without tools. Gemini
still called one there, taking it from the calls earlier in the conversation, so a turn that
used every round ended without text, as `unavailable` (#387). Function calling mode `NONE` alone
did not stop it either.

## Decision

- **The rules say a card exists only once its tool is called** in the answer: the tool comes
  first, the words about the card after its result, and an answer that cannot make one says why.
  Meal cards then came 20 of 20 times.
- **The server checks what is left:** when a round ends without tool calls, the turn has no card
  and its text speaks of one, Bite is told it made none, to call the tool now, say why it cannot
  or add nothing, and asked once more. The words are matched per language (`CARD_WORDS` in
  `coach-chat/prompt.ts`). This happens once a turn, and only while lookups are left.
- **The last round may not call a tool:** a request can forbid tool calls behind our model
  interface (`toolChoice: 'none'`, function calling mode `NONE` for Gemini), with the tools still
  declared; the results before it say that no lookups are left, which the model heeds better; and
  a call it makes all the same is not run but answered so, with the model asked once more.

## Alternatives considered

- **Only the prompt:** enough for meal cards, not for proposals.
- **Forcing the call** (mode `ANY`) for messages that ask for a card: the most reliable, but it
  needs a way to tell such a message from a question, a classifier of its own.
- **Asking the model whether its answer claims a card:** independent of the language, but a
  request for every answer without a card.
- **The last round without tools, with the lookups written out as text:** the model copied the
  text of the lookups into its answer.

## Consequences

- A turn costs at most one request more for each check, and only when it goes wrong or a word
  matches by chance, as "I propose more sleep"; then Bite adds nothing.
- An answer may come in two parts: the sentence about the card, then the card and a few words.
- The words have to be kept for every language the app gets.
