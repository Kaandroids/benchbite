---
name: review-pr
description: Reviews an open pull request from three sides at once (principles, security, logic and performance), checks the findings, fixes those with a clear fix as new commits, reviews the fixes, waits for CI and posts one report on the PR. Runs after every new PR through the hook in .claude/settings.json, or when asked to review a PR. Takes the PR number.
---

# Review a pull request

Review pull request `$ARGUMENTS`, fix what has a clear fix, and report once CI is green: what was
found, what was fixed and in which commit, and what the maintainer decides.

## 0. The worktree

Find the worktree with the PR's branch checked out (`git worktree list`). Without one, add one
beside the main checkout: `git worktree add ../<repo>-pr-$ARGUMENTS <branch>`. Reviews read and
run the code there, and the fixes are made there. Never change the main checkout.

## 1. Run the reviews in parallel

Start three subagents in one message, each with its own skill, so their reviews do not influence
each other:

- one runs the `review-principles` skill on `$ARGUMENTS`;
- one runs the `review-security` skill on `$ARGUMENTS`;
- one runs the `review-logic` skill on `$ARGUMENTS`.

Give each the PR number, the worktree's path and the rules of
`.claude/skills/review-pr/running-code.md`: no changed files, no `git checkout` in the main
checkout, no posts to GitHub, database experiments only in transactions rolled back. Give them
nothing of your own view of the change.

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
   - app code: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm test` for the
     folders it changes;
   - Edge Functions: `pnpm functions:check`;
   - migrations or SQL tests: apply the change to the local database, `pnpm db:types` when the
     schema changed, and `pnpm supabase test db`.

   A test that fails on `main` too is not the fix's doing: say so in the report.

3. Commit it on its own, as Conventional Commits, as the PR's other commits are made (as the bot
   when `~/.config/benchbite-bot/token.sh` exists).

A fix that grows past the finding, or that needs a decision after all, is not made: mark it
`ask`. Push the commits once all fixes are made; never force-push. If the branch moved meanwhile,
`git pull --no-rebase` first.

## 4. Review the fixes

Run step 1 again on the fix commits only: tell each review the range, from the last commit
reviewed to the branch's head. Verify and fix what they find, as in steps 2 and 3. Do this at most
twice; findings still open after the second time go into the report for the maintainer.

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

### For you to decide

1. **[Low · Principles]** `src/…:7`: what is wrong. **Question:** what to decide, with the options.

Reviewed in 2 rounds. Checks: typecheck, lint, format, tests, functions, database. CI is green.

<sub>Reviewed with the review-principles, review-security, review-logic and review-verify skills.</sub>
```

Leave out a section with nothing in it. With no findings at all, say so per review in one line.
Post it with `gh pr comment $ARGUMENTS --body-file <file>`, as the bot when
`~/.config/benchbite-bot/token.sh` exists: `GH_TOKEN=$(~/.config/benchbite-bot/token.sh) gh pr comment …`.

## 7. Tell the user

A short summary in the user's language: what was fixed, in a line each; what they decide, with the
question; and whether CI is green and the PR is ready to merge.
