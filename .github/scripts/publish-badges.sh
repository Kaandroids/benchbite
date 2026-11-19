#!/usr/bin/env bash
# Publishes the coverage badges' data, the JSON files in the folder `$1` that
# `pnpm coverage:report` wrote, to the `badges` branch, where shields.io reads them for the
# README's badges. The branch holds nothing else, and gets a commit only when a number changed.
# Reads GITHUB_TOKEN and GITHUB_REPOSITORY; BADGES_REMOTE names another remote, for trying it out.
set -euo pipefail

badges_dir=$1
remote=${BADGES_REMOTE:-"https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"}
out=$(mktemp -d)

# The first time there is no branch yet: it starts empty, with no history of main's.
if ! git clone --quiet --depth 1 --branch badges "$remote" "$out" 2>/dev/null; then
  git init --quiet --initial-branch badges "$out"
  git -C "$out" remote add origin "$remote"
fi

cp "$badges_dir"/*.json "$out"/
cd "$out"
git add --all
if git diff --cached --quiet; then
  echo "The badges are up to date."
  exit 0
fi
git -c user.name='github-actions[bot]' \
  -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
  commit --quiet --message 'Update the coverage badges'
git push --quiet origin badges
echo "Published the badges."
