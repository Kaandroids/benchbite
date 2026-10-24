---
name: review-logic
description: Reviews a pull request for logic errors and performance problems, such as wrong results, races, missed error paths, needless renders and slow queries. Use when asked to check a PR for bugs or performance, or when review-pr runs it. Takes the PR number.
---

# Review a pull request: logic and performance

Review pull request `$ARGUMENTS` for bugs and performance problems: places where the code does
the wrong thing, or does the right thing too slowly. Design and security have their own reviews;
stay on behaviour.

## Read first

1. `gh pr view $ARGUMENTS --json title,body,files` and `gh pr diff $ARGUMENTS`.
2. The changed files in full, and the code they call or that calls them. A bug often sits where
   the change meets code it did not touch.
3. The PR description, to check that the code does what it claims, and its tests, to see which
   cases are covered.

## What to look for

**Logic**

- Wrong results for edge cases: empty lists, one item, the limit itself, `null`, zero, time zones,
  midnight, the turn of the year, units (kg and lb, seconds and minutes).
- Races: two requests or two taps at once, a promise that settles after the screen left, effects
  that run twice, state read before it is set, optimistic updates not rolled back on failure.
- Error paths: a failed request or upload that leaves data half saved, an error shown as success,
  a retry that duplicates work.
- State that gets out of step between the app, the query cache, device storage and the database.
- SQL: constraints and checks that let invalid rows through, `null` in comparisons, missing
  `for update` where a row is read then written, triggers that miss an update path.
- Tests that pass without testing the change: mocks that bypass the code, assertions that cannot
  fail.

**Performance**

- Renders: work in render that belongs in a hook or the server, lists without stable keys, large
  lists not virtualised, images not sized.
- Data: a query per row (N+1), fetching more columns or rows than shown, missing indexes for new
  filters or joins, query keys that refetch too often or never invalidate.
- Startup and bundle: heavy imports on the first screen, new dependencies for small jobs.
- Edge Functions and SQL functions: work repeated per row that could run once.

## Report

Return the findings, most severe first. For each:

- **Severity:** high (wrong data or a crash a user will hit), medium, or low.
- **Where:** `path:line`.
- **What:** one sentence.
- **Scenario:** the concrete input or sequence and what goes wrong.
- **Fix:** the smallest change that fixes it, and the test that would have caught it.

Check each finding against the code before reporting it. Only report what you could show with a
concrete scenario. If the change is sound, say so in one line and report nothing. Do not change
any files.
