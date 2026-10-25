# 0030. Deploy Supabase from GitHub Actions

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

Until now the app ran against the local Supabase only. To use it on a phone away from the computer,
the database, its settings and the Edge Functions have to run on a hosted Supabase project, and stay
in step with `main` as pull requests are merged. The repository is public, so the credentials that
deploy must not appear in it or in its logs.

## Decision

A GitHub Actions workflow, `.github/workflows/deploy.yml`, deploys to the hosted project with the
Supabase CLI from the repository's dev dependencies, the same version the checks use:

1. links the project,
2. pushes the settings in `supabase/config.toml` (`config push`), such as guest sign-ins and email
   sign-ups,
3. applies the migrations the project does not have yet (`db push`),
4. deploys the Edge Functions,
5. on request, uploads the exercise images to storage (`seed buckets`).

It needs three secrets, kept in the `production` environment of the repository: an access token
scoped to the project, the project id and the database password. The `service_role` key is not
needed and is not stored. The environment allows deployments from `main` only and waits for the
maintainer's approval, without a bypass for administrators, and the job itself runs only on `main`.
Only the deploying steps get the secrets, not the install of the dependencies.

`db push` refuses a migration dated before the newest one already applied. So that pull requests
made in parallel cannot block a deploy, the checks fail when a pull request adds a migration that
does not sort after every migration on the branch it merges into; it is renamed before merging.

Because `supabase/config.toml` is pushed, it holds only values that are safe in production. Expo
Go's `exp://` redirects are not allowed, as any Expo Go project could then receive a sign-in token.

For now the workflow runs only when started by hand. Once it has deployed reliably, it will run on
every push to `main` after the checks pass, optionally with an approval on the environment.

The app's project URL and publishable key are not secrets, as they ship inside the app. They stay out
of the repository in an untracked env file for local builds.

## Alternatives considered

- **Deploying by hand from a computer** with `supabase login`: quick to start, but every merge would
  need a manual step, and what runs in production would depend on one machine.
- **Supabase's GitHub integration:** it can apply migrations on its own, but it does not push the
  settings or upload storage files, and its steps are less visible than a workflow in the repository.
- **Repository secrets instead of an environment:** simpler, but every workflow, including the checks
  of pull requests, could read them.
- **`db push --include-all`** to apply out-of-order migrations: it would hide that a migration was
  written against an older schema than production has.

## Consequences

- What is merged can be deployed with one click, and soon on its own.
- Settings in `supabase/config.toml` now affect the hosted project, so local-only values there must
  stay harmless when pushed.
- The access token expires and has to be renewed in the environment.
- A migration that fails halfway stops the deploy; the next run applies what is left.
- Each deploy needs the maintainer's approval in GitHub before it starts.
