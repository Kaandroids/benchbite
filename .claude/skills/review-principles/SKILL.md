---
name: review-principles
description: Reviews a pull request against SOLID, DRY and KISS and the architecture rules of this project. Use when asked to review a PR's design or structure, or when review-pr runs it. Takes the PR number.
---

# Review a pull request: principles

Review pull request `$ARGUMENTS` for its design: whether the code is easy to change, free of
needless repetition and as simple as the problem allows. Correctness and security have their own
reviews (review-logic, review-security); stay on design.

## Read first

1. `gh pr view $ARGUMENTS --json title,body,files` and `gh pr diff $ARGUMENTS`.
2. The changed files in full where the diff alone does not show how a change fits, and the code
   they call or that calls them.
3. `CLAUDE.md` (architecture rules, project structure) and the ADRs in `docs/adr/` that the
   change touches.

## What to look for

**SOLID**

- A module, hook or screen that does several unrelated jobs, such as a screen that also fetches,
  transforms and saves data that a hook should own.
- Code that has to be edited for every new case, where a table or a map would let the case be
  added.
- Dependencies pointing the wrong way: shared code (`src/components`, `src/lib`) importing from a
  feature folder, or one feature reaching into another's internals.
- Props or parameters a caller has to pass but the callee does not need.

**DRY**

- The same logic, query, SQL check or UI pattern written a second time instead of reused.
  Search the codebase for an existing helper before calling something new.
- Copies that have already started to drift apart.
- Repetition that is only similar in shape and would be harder to read if merged is fine; say
  so rather than forcing an abstraction.

**KISS**

- Abstractions with one user, options nobody passes, layers that only forward.
- State, effects or memoisation the code does not need. The React Compiler is on.
- Clever code where a plain loop or a plain condition reads better.

**Project rules**

- Business logic lives in Supabase: atomic or multi-table work in Postgres functions called with
  `rpc()`, side effects in triggers, secrets and third-party calls in Edge Functions.
- Schema changes only through migrations; generated database types never edited by hand.
- Routes only in `src/app/`; components, hooks and other code elsewhere.
- Comments, names and copy in English, matching the density and tone of the surrounding code.

## Report

Return the findings, most important first. For each:

- **Severity:** high (will make the next change hard or wrong), medium, or low.
- **Where:** `path:line`.
- **What:** one sentence.
- **Why it matters:** one or two sentences, concrete to this code.
- **Suggestion:** the smallest change that fixes it.

Only report what you can point at in the diff or the code around it. If the change is sound, say
so in one line and report nothing. Do not change any files.
