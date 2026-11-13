# 0130. Keep dependencies current with Dependabot

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Nothing kept the versions of the dependencies current (#538). The app and the website pin theirs in pnpm lockfiles, the Edge Functions took ranges such as `npm:@supabase/server@^1` in `deno.json`, which checks every request's token, and the workflows pin actions to commits. A fixed release reached the project only when someone noticed it. Expo pins the versions of its SDK packages, and of the React and React Native packages that go with them, to fit each other.

## Decision

- **Dependabot opens version updates each week** for the app's packages, the website's, the Edge Functions' imports (`deno`) and the workflows' actions (`.github/dependabot.yml`). CI checks them as any other pull request.
- **A version must have been out for 7 days** (`cooldown`) before it is proposed, beyond pnpm's own `minimumReleaseAge`, so a compromised release is usually found and pulled first; this also keeps every proposed version installable under that setting.
- **The packages Expo pins are left out**, with the React and React Native packages versioned alongside them. They move together with Expo, with `pnpm expo install --fix`; `docs/development.md` says which they are and when the list grows.
- **The Edge Functions' imports are pinned to exact versions in `deno.json`.** A range already took each fix within it, which left Dependabot nothing to propose and kept `deno.lock` on the version it had.
- **Updates are grouped where they move together:** the app's development tools within a major version, and on the website Astro with `vite`, which follows Astro's (ADR 0129).

## Alternatives considered

- **Renovate:** it can group an Expo SDK upgrade, but it needs a GitHub App installed and configured; Dependabot is built into GitHub.
- **No cooldown:** a release would be proposed the day it is published, when a compromised one is most likely still out.
- **Letting Dependabot update the packages Expo pins, or checking them with `pnpm expo install --check` in CI:** an update of one alone would not fit the rest of the SDK, and `--check` compares against the newest fixes Expo has published, so it would fail CI whenever Expo publishes one.

## Consequences

- Expo's fixes within an SDK arrive only when someone runs `pnpm expo install --check` and takes them (`docs/development.md`).
- GitHub announced Dependabot's Deno support for version updates; whether its security updates cover Deno too is not settled by GitHub's own pages, so the weekly version updates are what is relied on.
- A package Expo starts to pin, but which the list does not name, would be updated on its own until it is added.
- Security updates, which skip the cooldown, are a repository setting apart from this file.
