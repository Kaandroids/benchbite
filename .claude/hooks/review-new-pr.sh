#!/usr/bin/env bash
# PostToolUse hook for Bash: after `gh pr create` opens a pull request, asks Claude to review it
# with the review-pr skill. Other commands pass through untouched.
set -euo pipefail

input=$(cat)
command=$(jq -r '.tool_input.command // ""' <<<"$input")
[[ "$command" == *"gh pr create"* ]] || exit 0

output=$(jq -r '[.tool_response.stdout?, .tool_response.stderr?, (.tool_response | strings)?] | map(select(. != null)) | join("\n")' <<<"$input")
number=$(grep -oE 'github\.com/[^/ ]+/[^/ ]+/pull/[0-9]+' <<<"$output" | tail -n 1 | grep -oE '[0-9]+$' || true)
[[ -n "$number" ]] || exit 0

jq -n --arg number "$number" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("Pull request #" + $number + " was just opened. Review it now with the review-pr skill (/review-pr " + $number + "): it runs review-principles, review-security and review-logic in parallel subagents and posts one combined comment.")
  }
}'
