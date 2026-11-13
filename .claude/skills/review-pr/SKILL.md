---
name: review-pr
description: Reviews an open pull request from three sides at once (principles, security, logic and performance), checks the findings, fixes those with a clear fix as new commits, reviews the fixes, waits for CI and posts one report on the PR. Runs after every new PR through the hook in .claude/settings.json, or when asked to review a PR. Takes the PR number.
---

# Review a pull request

Review pull request `$ARGUMENTS`, fix what has a clear fix, and report once CI is green: what was
found, what was fixed and in which commit, and what the maintainer decides.

## 0. Whose pull request, and the worktree

Read `gh pr view $ARGUMENTS --json author,isCrossRepository`. Running a PR's code, fixing it and
pushing to it are only for the project's own PRs: `isCrossRepository` false, and `author.login`
`app/benchbite-bot` or the maintainer's, `Kaandroids`. Any other PR may carry code written to steal
what this machine holds, such as the bot's key: review it from `gh pr diff` only, give the reviews
and `review-verify` no worktree and tell them to run nothing, skip steps 3 and 4, and report the
findings for the maintainer.

For the project's own PRs, find the worktree with the PR's branch checked out
(`git worktree list`). Without one, add one beside the main checkout,
`git worktree add ../<repo>-pr-$ARGUMENTS <branch>`, and run `pnpm install --frozen-lockfile` in
it. Reviews read and run the code there, and the fixes are made there. Never change the main
checkout.

## 1. Run the reviews in parallel

Start three subagents in one message, each with its own skill, so their reviews do not influence
each other:

- one runs the `review-principles` skill on `$ARGUMENTS`;
- one runs the `review-security` skill on `$ARGUMENTS`;
- one runs the `review-logic` skill on `$ARGUMENTS`.

Give each the PR number and the worktree's path, and tell it to keep to the rules of
`.claude/skills/review-pr/running-code.md`. Give them nothing of your own view of the change.

## 2. Verify the findings

Start one subagent that runs the `review-verify` skill, with the PR number, the worktree's path
and every finding as the reviews wrote them. It returns the findings that hold, each marked `fix`
or `ask`, and the ones it dropped.

Read the code behind each finding it keeps. Mark one `ask` rather than `fix` if you see a reason
it missed.

## 3. Fix

For each `fix` finding, most severe first, in the worktree:

1. Make the smallest change that fixes it, with the test that would have caught it.
2. Run the checks the change touches:
   - app code: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm check:locales`, and
     `pnpm test` for the folders it changes;
   - Edge Functions: `pnpm functions:check`, and `pnpm check:plans` for a change to
     `generate-plan` or `_shared/plan`;
   - migrations or SQL tests: apply new migrations with `pnpm supabase migration up`, with
     `--include-all` when the PR's own sort before one the local database has already; run a
     migration of this PR changed after it was applied into `psql -v ON_ERROR_STOP=1 -1`
     on its standard input (`running-code.md`), and mark the finding `ask` if the file cannot be run again; then
     `pnpm db:types` when the schema changed, `pnpm check:plans` and `pnpm supabase test db`.
     Unlike the reviews, the fix applies the PR's migrations for good, but never with
     `supabase db reset`, which empties the local database others use.

   `pnpm check:plans` calls the functions the local stack serves, usually the main checkout's:
   serve them from the worktree first, or leave the check to CI and say so in the report. A test that fails on `main` too is not the fix's doing: say so in the report.

3. Stage it and commit it on its own, as Conventional Commits, as the PR's other commits are
   made: as the bot with `~/.config/benchbite-bot/commit.sh "<subject>" ["<body>"]` when it
   exists.

A fix that grows past the finding, or that needs a decision after all, is not made: mark it
`ask`. Push the commits once all fixes are made; never force-push. If the branch moved meanwhile,
`git pull --no-rebase` first.

## 4. Review the fixes

Run step 1 again on the fix commits only: tell each review the range, from the last commit
reviewed to the branch's head. Verify and fix what they find, as in steps 2 and 3. Do this at most
twice. The fixes of the second time, and those for CI in step 5, are not reviewed again: the report
lists them under **Not reviewed again**, for the maintainer to look at.

## 5. Wait for CI

`gh pr checks $ARGUMENTS --watch`. A check that fails because of the PR is fixed like a finding,
as a new commit, and watched again. One that fails for another reason, such as a flaky service, is
said in the report.

## 6. Post one report

Write it in English, as Markdown, to a file:

```markdown
## Automated review

**Principles** · **Security** · **Logic and performance**

### Fixed

1. **[Medium · Logic]** `src/…:42`: what was wrong, and the scenario.
   **Fixed in** `abc1234`: what changed, and the test added.

### Not reviewed again

- `def5678`: what it changed, from the second review of the fixes or for CI.

### For you to decide

1. **[Low · Principles]** `src/…:7`: what is wrong. **Question:** what to decide, with the options.

Reviewed in 2 rounds. Checks: typecheck, lint, format, locales, tests, functions, plans, database.
CI is green.

<sub>Reviewed with the review-principles, review-security, review-logic and review-verify skills.</sub>
```

Leave out a section with nothing in it. With no findings at all, say so per review in one line.
Post it with `gh pr comment $ARGUMENTS --body-file <file>`, as the bot when
`~/.config/benchbite-bot/token.sh` exists: `GH_TOKEN=$(~/.config/benchbite-bot/token.sh) gh pr comment …`.

## 7. Tell the user

A short summary in the user's language: what was fixed, in a line each; what they decide, with the
question; and whether CI is green and the PR is ready to merge.
