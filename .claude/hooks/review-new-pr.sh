#!/usr/bin/env bash
# PostToolUse hook for Bash: after `gh pr create` opens a pull request, asks Claude to review it
# with the review-pr skill. Other commands pass through untouched.
set -euo pipefail

input=$(cat)
command=$(jq -r '.tool_input.command // ""' <<<"$input")
[[ "$command" == *"gh pr create"* ]] || exit 0

# gh prints the new pull request's URL on a line of its own on stdout, before anything a command
# chained after it prints. A URL in an error, in other output or with a fragment such as
# #issuecomment-… is not a new pull request.
output=$(jq -r '.tool_response.stdout? // (.tool_response | strings)? // ""' <<<"$input")
number=$(grep -E '^https://github\.com/[^/ ]+/[^/ ]+/pull/[0-9]+$' <<<"$output" | head -n 1 | grep -oE '[0-9]+$' || true)
[[ -n "$number" ]] || exit 0

jq -n --arg number "$number" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("Pull request #" + $number + " was just opened. Review it now with the review-pr skill: /review-pr " + $number)
  }
}'
