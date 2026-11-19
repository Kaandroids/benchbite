# 0152. Check the Edge Functions' coverage and show both coverages

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

CI fails when the coverage of the app's tests falls under its thresholds (#542). The Edge
Functions have several hundred tests of their own, but how much of the functions they run was never
measured, so a function could lose its tests unnoticed. The app's coverage only showed as a line in
the log of a run, and nowhere outside it.

## Decision

- **The Edge Functions' tests run with coverage:** `pnpm functions:check` gives `deno test` a
  folder for it, `coverage/functions`, where Deno also writes an lcov file.
- **`pnpm coverage:report` checks and shows both** (`scripts/coverage-report.ts`). It reads Jest's
  summary of the app and Deno's lcov, prints lines, functions and branches for each with a
  breakdown by folder, and writes that to the summary of a CI run. It fails when the Edge Functions
  fall under their thresholds, set just under the coverage when they were added, as the app's were.
  The app's thresholds stay in `jest.config.js`, where Jest checks them with the tests.
- **Only files a test loads count for the Edge Functions,** as Deno measures. That leaves out each
  function's `index.ts`, which only joins its handler to the runtime.
- **The README shows `main`'s coverage with two badges.** After the Checks job on `main`, a job
  writes two small JSON files to a `badges` branch (`.github/scripts/publish-badges.sh`), which
  shields.io reads. The branch holds nothing else and gets a commit only when a number changes.
  The job alone has `contents: write`, runs only on pushes to `main`, and runs nothing but that
  script; `main` stays protected, as its ruleset covers the default branch.

## Alternatives considered

- **Codecov or a like service:** shows more, such as the coverage of a pull request's own lines,
  but needs an account, a token and the coverage sent to a third party.
- **A gist written with a personal token:** the usual way without a service, but the token is one
  more secret that can do more than the badges need.
- **A static badge of the thresholds:** needs nothing, but does not move with the coverage.
- **Checking the functions' thresholds in the workflow with shell:** Deno has no threshold option;
  a script that also draws the table reads the same numbers once.

## Consequences

- A pull request that takes tests away from the Edge Functions fails.
- The badges show nothing until the job has run on `main` once, and are as fresh as its last run.
- The thresholds are in two places, Jest's config for the app and the script for the functions.
