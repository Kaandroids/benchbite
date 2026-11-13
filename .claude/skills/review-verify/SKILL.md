---
name: review-verify
description: Checks the findings of the review skills on a pull request against the code, drops what does not hold, merges duplicates and decides which ones Claude fixes and which the maintainer decides. Use when review-pr runs it. Takes the PR number, the worktree path and the findings.
---

# Verify review findings

Check the findings the review skills made on pull request `$ARGUMENTS`. You get the findings as
the reviews wrote them, and the path of a worktree with the PR's branch. You did not write them:
try to prove each one wrong before you keep it.

## For each finding

1. Read the code it points at, and the code around it that could already handle it.
2. Build the scenario it describes. Where reading leaves doubt, run it, as
   `.claude/skills/review-pr/running-code.md` describes.
3. Decide:
   - **Holds:** you could show the scenario, or the design problem is plain in the code.
   - **Does not hold:** the code already handles it, it is about code the PR did not change and
     does not affect, or it rests on a guess you could not confirm.
4. Merge findings that are about the same thing, keeping the most precise one, and note which
   reviews made it.
5. Keep the severity the review gave, unless the code shows it is wrong; then say why.

## Who acts on it

Mark each finding that holds:

- **fix:** Claude fixes it on the branch. The fix is clear and stays within the PR's topic: a bug
  with one right answer, a missing check or test, repeated code, a stale comment or doc.
- **ask:** the maintainer decides. The fix changes what the product does or how it looks, goes
  against an ADR or needs a new one, trades one good against another (safety and ease, cost and
  speed), has more than one reasonable answer, or reaches beyond the PR's topic.

When in doubt, mark it **ask**.

## Report

Return the findings that hold, most severe first. For each:

- **Severity** and **review**: `High · Logic`, `Low · Principles + Logic`.
- **Where:** `path:line`.
- **What:** one sentence.
- **Scenario or reason:** what you showed, in one or two sentences.
- **Fix:** the change to make, concrete enough to do without asking.
- **Acts:** `fix` or `ask`; for `ask`, the question to put to the maintainer.

Then list the findings you dropped, each with one line on why. Do not change any files.
