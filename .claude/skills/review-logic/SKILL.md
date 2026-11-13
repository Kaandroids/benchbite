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
4. Every other place that writes or reads what the PR changes: for each table, column, SQL
   function, Edge Function, query key or stored value it touches, search the codebase for its
   other users, such as the notebook editing the notes a new tool changes. Bugs hide where an
   existing flow meets the new one at the same moment or in the other order.

When `review-pr` names a range of commits, as for the fixes of an earlier round, review what those
commits change and how it meets the rest, not the whole PR again.

Run the code where reading leaves doubt, as `.claude/skills/review-pr/running-code.md` describes.

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

**Compatibility and deploy**

- Apps already installed: an older app talking to the new database or Edge Function, or the new
  app to the old one until the deploy, such as a new kind of card it does not show.
- Migrations: their order, enum values used in the migration that adds them, data the change
  leaves behind or needs to move, and whether it can be deployed in place.
- Shared code: a change to `supabase/functions/_shared` or to a SQL function others call, and
  every caller it reaches.

**Tests**

- Each new branch, refusal and error code of the change has a test: pgTAP for SQL, Deno for Edge
  Functions, Jest for the app.
- The cases that matter most are tested: the limit itself, another user, a row changed meanwhile.

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
