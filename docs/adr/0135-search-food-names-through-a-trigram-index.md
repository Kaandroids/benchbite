# 0135. Search food names through a trigram index

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

ADR 0035 left food search without an index: at about a thousand names, a search scanned them all
in about a millisecond. Each search works out `food_name_key()` and, for a typo,
`strict_word_similarity()` for every name in two languages. With the library grown to about 15,000
names per language, 15 searches took about 9 seconds (#545).

## Decision

- **The search key is a stored column,** `food_names.name_key`, generated from
  `food_name_key(name)`. It has a GIN index with `gin_trgm_ops`.
- **`search_foods()` looks only at the names the index finds.** These are the names that hold the
  term, matched with `like` and the term's wildcards escaped by `food_name_pattern()`. For a term of
  4 or more characters, they also include the names with a word close to it, matched with `<<%` at
  the function's `strict_word_similarity_threshold` of 0.4. The scores of ADR 0035 then rank them,
  unchanged.
- **The condition takes the term from the function's arguments, not from a `with`.** The function
  sets the threshold, so it is not inlined. Its plan does not know the arguments, and a term that
  arrives through a join cannot use the index: that plan scanned every name.
- **The user's own foods and recipes are still scanned,** as there are few per user.

## Alternatives considered

- **An expression index on `food_name_key(name)`, without the column:** just as fast, but every
  search would have to repeat the indexed expression exactly.
- **Full-text search:** it finds words, not prefixes or parts of words, and does not take typos
  the way the scores do.

## Consequences

- With the library grown to 15,180 names per language, 15 searches take about 0.5 seconds instead
  of 9. The old and new search give the same rows, in the same order, for 4,254 queries in three
  languages.
- The 0.4 of the typo score and the function's threshold must stay the same, or names the score
  would take are never looked at. A comment beside each says so.
- A pgTAP check plans the function's own body without its arguments, and fails if it stops using
  the index.
