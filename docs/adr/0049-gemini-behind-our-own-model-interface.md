# 0049. Gemini behind our own language model interface

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

Bite, the AI coach (#38), talks with the user by text and voice, estimates a meal from a photo and
writes weekly reviews. Each of these calls a language model from an Edge Function, which keeps the
key and checks the user's limit (#288). Models and their prices change often, so the provider should
be a choice made in one place, not spread over every function.

Gemini covers all of it from one provider: text and tools, photos and audio in the request itself,
structured output, and live voice. It is cheap enough for a limit of a few dollars per user and
month, and it runs in the EU on Vertex AI.

## Decision

- **The Edge Functions call a language model of our own** (`supabase/functions/_shared/llm/`):
  messages of text, images, audio, tool calls and their results; tools as JSON Schema; an optional
  schema for JSON answers; `generate()` for a whole answer and `stream()` for one as it comes. Each
  call reports its tokens, with the reasoning and cached input apart, for the usage limit (#288).
- **Gemini is the provider**, behind that interface, over its REST API with `fetch` rather than an
  SDK. Photos and audio go inline, in base64, rather than through an upload API.
- **Each task has its model in one place** (`config.ts`): chat on Gemini 3.5 Flash-Lite, a meal
  photo and the reviews on Gemini 3.8 Flash, each with how much it reasons. `LLM_MODEL_<TASK>`
  overrides a model without a change to the code.
- **Two backends.** `GEMINI_BACKEND=studio` uses the Gemini Developer API with `GEMINI_API_KEY`,
  for development, with test data only. `vertex`, Vertex AI in an EU region, must replace it
  before the app is released; until then it is refused.
- **The key is an Edge Function secret**: `supabase/functions/.env` locally, ignored by Git, and
  the project's Edge Function secrets in the hosted one. It never reaches the app.
- **Tests never call a model**: they use `FakeModel`, which answers from a script, or stub
  `fetch`.

## Alternatives considered

- **Calling Gemini directly from each function:** less code now, but every function would know
  Gemini's request shape, and a change of provider or model would touch all of them.
- **Google's Gen AI SDK:** it covers both backends, but adds a large dependency to every function
  that uses it, for requests that are a few lines of JSON.
- **Another provider, such as OpenAI or Anthropic:** as able for chat, but Gemini's cheapest
  models take photos and audio, and its live voice and EU region come from the same provider. The
  interface keeps the choice open.
- **Vertex AI from the start:** where the app has to be, but it needs a Google Cloud project and a
  service account before anything can be tried; the interface makes the switch a change of
  backend.

## Consequences

- A new function asks `languageModel()` for the model and names its task; it never names a
  provider.
- Real user data must not go to the Gemini Developer API: the Vertex backend is a release blocker.
- Gemini 3 returns a signature with its tool calls that it needs back on the next turn; the
  interface carries it on the part, so stored conversations keep it.
- Live voice (#300) uses Gemini's own WebSocket API, which this interface does not cover yet.
