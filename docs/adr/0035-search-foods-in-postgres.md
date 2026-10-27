# 0035. Search foods in Postgres, by name in the user's language and in English

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

Logging a meal starts with finding the food (#201). People type a few letters, in German,
Turkish or English, often with a typo, and expect the right food at the top. The library has
about 350 foods with three names each (ADR 0033). Later, people's own foods (#203) and recipes
(#204) should show up in the same results.

## Decision

- **A Postgres function, `search_foods(query, language)`,** called with `rpc()`. It returns up to
  30 foods with their values per 100 g and their default portion, so a result can show a portion
  and its calories, and a food can be added from it without another request.
- **Names in two languages:** the query is matched against the names in the user's language and
  in English. Each food is shown with its name in the user's language, or in English where it
  has none.
- **Ranking:** a name whose first word is the query comes first (so "Ei" finds "Ei, roh" before
  "Eistee"), then names that start with it, then names that contain it, then names with a word
  close to it. Ties go to the shorter name.
- **Typos:** `pg_trgm`'s `strict_word_similarity` of at least 0.4, for queries of 4 or more
  characters. Shorter ones have too few trigrams to compare reliably.
- **No index for now:** at about a thousand names a search scans them in about a millisecond. A
  trigram index fits once the library or the users' own foods grow much larger.
- **Access:** signed-in users, guests included, may call it. It runs with the caller's rights, so
  row level security still applies, and archived foods are left out.

## Alternatives considered

- **Filtering the library on the device:** simple and works offline, but it could not include
  people's own foods and recipes, and every app version would rank differently.
- **Postgres full-text search:** made for documents. It stems words by language and does not
  handle typos or parts of words, which matter more for short food names.
- **A search service such as Algolia or Meilisearch:** good typo handling, but another service, a
  copy of the data to keep in step and a cost, for a library of a few hundred foods.
- **`ilike` patterns:** the query's `%` and `_` would need escaping; `position` and `starts_with`
  match the text literally.

## Consequences

- Search behaves the same on every device and covers new kinds of foods by extending one function.
- Each keystroke, after a short pause, is one request; the app has to debounce typing.
- Accents are not folded: "kase" does not find "Käse". `unaccent` can be added if people need it.
