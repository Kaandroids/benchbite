# 0154. Count a request's tools by their size on Vertex AI

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Before a call, the Edge Functions ask the provider how many tokens the request sends; the database
refuses one too large for its feature and sets the most the call may cost aside from the user's
budget ([ADR 0051](0051-ai-usage-and-a-monthly-limit.md)). A call that ends without saying what it
used is charged at that.

On Vertex AI ([ADR 0153](0153-call-gemini-on-vertex-ai-in-the-eu.md)) the count is low for a
request's tools, which ADR 0153 accepted from a try with one small tool. Measured with the chat's
sixteen tools, it is low by far: Vertex AI counted 1,120 tokens for a request it then billed 3,216
for, and 754 against 2,027 for ten of the tools. A request that forbids tool calls was billed for
no tools at all, yet counted with them.

## Decision

- **On Vertex AI, a request is counted without its tools,** and their tokens are added from their
  size: one for each four characters of the declarations as JSON (`_shared/llm/vertex.ts`). The
  calls were billed a token for each 4.2 to 4.7 characters, so the count is the higher by a tenth
  or so: 3,750 against 3,216 for the chat's tools.
- **A request that forbids tool calls adds nothing for them,** as it is billed.
- **The endpoint says what its count leaves out** (`uncounted` of `GeminiEndpoint`). The Developer
  API has none, and counts as before.

## Alternatives considered

- **Accepting the low count,** as ADR 0153 did: a call with tools set aside two thousand tokens
  too few, and the limit on a request's size saw as many too few.
- **A fixed number of tokens per task:** exact on the day it is measured, but to be measured again
  with every change to a tool, and for every task that gets tools.
- **Setting the feature's largest input aside, without counting:** no count to be wrong, but a
  user near the end of their budget is refused a small request, and a call left half-way is
  charged at the most.
- **Counting by size for the whole request:** photos and audio have no size in characters to
  count by.

## Consequences

- What is set aside for a call with tools is a little high rather than far too low; what the call
  used is recorded after it, as before.
- A long chat reaches the limit on its size some two thousand tokens sooner than Vertex AI's own
  count let it.
- The ratio is measured, not promised: a change in how Vertex AI bills tools shows as a count that
  drifts from what calls are billed, which nothing checks by itself.
