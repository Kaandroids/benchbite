---
name: review-pr
description: Reviews an open pull request from three sides at once (principles, security, logic and performance) and posts one combined review comment on it. Runs after every new PR through the hook in .claude/settings.json, or when asked to review a PR. Takes the PR number.
---

# Review a pull request

Review pull request `$ARGUMENTS` with the three review skills and post the result on the PR.

## 1. Run the reviews in parallel

Start three subagents in one message, each with its own skill, so their reviews do not influence
each other:

- one runs the `review-principles` skill on `$ARGUMENTS`;
- one runs the `review-security` skill on `$ARGUMENTS`;
- one runs the `review-logic` skill on `$ARGUMENTS`.

Give each only the PR number and its skill, not your own view of the change.

## 2. Check the findings

Before posting, read the code behind every finding yourself:

- Drop findings that the code already handles, that repeat another finding, or that are about
  code this PR did not change and does not affect.
- Merge findings two reviews made about the same thing.
- Keep the severity a review gave, unless checking the code shows it is wrong.

## 3. Post one comment

Write the comment in English, as Markdown:

```markdown
## Automated review

**Principles** · **Security** · **Logic and performance**

### Findings

1. **[High · Logic]** `src/…:42`: what is wrong.
   Scenario or reason. **Fix:** what to change.
2. …

No findings: say so per review in one line.

<sub>Reviewed with the review-principles, review-security and review-logic skills.</sub>
```

Post it with `gh pr comment $ARGUMENTS --body-file <file>`. When `~/.config/benchbite-bot/token.sh`
exists, post as the bot: `GH_TOKEN=$(~/.config/benchbite-bot/token.sh) gh pr comment …`.

## 4. Tell the user

Give a short summary in the user's language: how many findings per review, the important ones in
a line each, and whether you suggest fixing any before merging. Do not fix anything unless the
user asks; then address each finding with a new commit on the PR's branch.
