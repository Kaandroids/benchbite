# 0153. Call Gemini on Vertex AI in the EU

- **Status:** Accepted, amended by ADR-0154
- **Date:** 2026-11-19

## Context

Bite sends what a user writes, photographs and says to Gemini, with their weight, steps and
workouts: health data, which the GDPR lets a processor handle only under a contract and which Apple
and Google let an app share only with care. The Edge Functions called Gemini through the Gemini
Developer API with an API key ([ADR 0049](0049-gemini-behind-our-own-model-interface.md)), meant
for development: it promises no place of processing, and its free tier lets Google use what is
sent. ADR 0049 named Vertex AI in the EU as what must replace it before the release, and refused
`GEMINI_BACKEND=vertex` until then (#549).

## Decision

- **The hosted project calls Gemini on Vertex AI,** in a Google Cloud project of Benchbite's own,
  under the Google Cloud terms and their Cloud Data Processing Addendum, which the account
  accepted. Under them Google processes the data on Benchbite's instructions and does not train
  its models with it.
- **At the EU multi-region, `eu`,** whose endpoint keeps the machine learning processing within EU
  member states. The models Bite uses are offered there and at the global endpoint, not in single
  EU regions; the global endpoint takes the same requests but may process them anywhere, so the
  location is fixed in the code (`_shared/llm/vertex.ts`), not left to the environment.
- **As a service account with the Vertex AI User role alone.** Its key file is an Edge Function
  secret, `VERTEX_SERVICE_ACCOUNT`, as base64. The function signs a claim with it (a JWT, RS256,
  with Web Crypto) and exchanges it at Google's token endpoint for an access token of an hour,
  kept in the worker's memory and renewed five minutes before it ends. No SDK, as for the requests
  themselves (ADR 0049).
- **`GeminiModel` takes where it calls as an endpoint:** the address of a model's method, the
  headers that sign a request and the body of a token count. The Developer API and Vertex AI are
  the two; the requests and answers are the same, which a try against Vertex AI with tools, tool
  results, a response schema and a stream confirmed.
- **`GEMINI_BACKEND` still has no default.** `vertex` needs `VERTEX_SERVICE_ACCOUNT`; `studio`
  stays for development, with test data only.
- **The prices are Vertex AI's** away from its global endpoint, a tenth above the Developer API's,
  from a migration; calls in development are counted at them too.

## Alternatives considered

- **The Developer API's paid tier:** the same code as before, and no training on what is sent, but
  no promise of where it is processed.
- **Vertex AI's global endpoint:** the cheaper one, with higher availability, but with no place of
  processing either.
- **A single EU region:** the narrowest place, but the models Bite uses are not offered in one.
- **Google's Gen AI SDK or an auth library:** they sign in for us, but add a large dependency to
  every function for some forty lines of signing.
- **An API key for Vertex AI:** simpler than a service account, but a key that never ends in place
  of tokens of an hour, and no role to narrow it by.
- **Another provider with EU hosting:** a change of models, prompts and prices; the interface
  allows it later.

## Consequences

- Health data sent to Bite is processed in the EU by a processor under contract. The privacy
  policy has to name Google Cloud, and the consent text what is sent (#290, #654).
- Google still keeps some of it for a while within the EU: inputs in a cache for up to 24 hours,
  for faster answers, and prompts its abuse classifiers flag for up to 90 days, which its staff
  may read. The cache can be turned off for the project, at the price of slower and dearer
  answers; it is left on for now.
- Each call costs a tenth more than on the global endpoint.
- The Developer API's monthly spend limit, which the project's own was set under
  ([ADR 0134](0134-pause-bite-at-the-providers-spend-limit.md)), is gone: Google Cloud warns at a
  budget but stops nothing by default, so the limit in `ai_spend_limit` is the only stop.
- Vertex AI counts the tools of a request lower before the call than it then bills, so the cost
  set aside for a call with tools is a low estimate; what the call used is recorded after it, as
  before.
- A key file is one more secret to keep and to replace when it may have leaked: delete the key in
  Google Cloud, make another and set the secret again.
- The first request of a worker waits for a token, a tenth of a second or so.
