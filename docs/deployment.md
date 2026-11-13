# Deployment

How the hosted Supabase project and the website are deployed and monitored, and how to install a
release build on an iPhone. To run everything locally, see [Development](development.md).

## Deploy the Supabase project

The hosted Supabase project is deployed by the **Deploy Supabase** workflow in GitHub Actions
([ADR 0030](adr/0030-deploy-supabase-from-github-actions.md)). It links the project, pushes the
settings in `supabase/config.toml`, applies new migrations and deploys the Edge Functions; it uploads
the exercise images when asked. It reads `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` and
`SUPABASE_DB_PASSWORD` from the repository's `production` environment, with `SMTP_PASSWORD`, the Lettermint project token that sends the account emails ([ADR 0091](adr/0091-confirm-accounts-with-a-code.md)). The Edge Functions' own
secrets, such as `GEMINI_API_KEY` and `LETTERMINT_API_TOKEN` (a Lettermint project token, for the emails Edge Functions send, [ADR 0094](adr/0094-delete-an-account-from-the-website.md)), are set in the Supabase dashboard under Edge Functions → Secrets. Start it from the Actions tab
with **Run workflow**.

The scheduled photo purge and the removal of inactive guests read the project URL and a secret
API key from the project's Vault ([ADR 0063](adr/0063-purge-chat-photos-from-a-queue.md),
[ADR 0131](adr/0131-remove-guests-inactive-for-90-days.md)). Set them once, in the dashboard's
SQL editor, with the project's reference and its `default` secret key from Project Settings →
API Keys, which `purge-coach-media` and `remove-inactive-guests` accept:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<default secret key>', 'secret_key');
```

After rotating the key, update it with
`select vault.update_secret(id, '<new key>') from vault.secrets where name = 'secret_key';`.

## Deploy the website

The website is deployed to Netlify by the **Deploy website** workflow in GitHub Actions
([ADR 0089](adr/0089-deploy-the-website-to-netlify.md)). It builds `website/` from `main` and sends
it to Netlify's API. Start it from the Actions tab with **Run workflow**. Each deploy spends 15 of
the free plan's 300 credits a month, and the site is paused when they run out.

To set it up once:

1. In Netlify, create a project without connecting a repository, and copy its **Project ID** from
   Project configuration → General → Project details.
2. In Netlify, under Applications → Personal access tokens, create a token with an expiry date.
3. In GitHub, under Settings → Environments, create the `website` environment, limit it to `main`,
   and add the two values as the secrets `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN`.
   Under Settings → Secrets and variables → Actions → Variables, add `SUPABASE_FUNCTIONS_URL`:
   `https://<project-ref>.supabase.co/functions/v1`, where the delete page's forms post
   ([ADR 0094](adr/0094-delete-an-account-from-the-website.md)). The workflow stops without it.

The token reaches the whole Netlify account, so replace it if it may have leaked. Before the site
goes live, replace the placeholder texts and remove the `X-Robots-Tag` line from `website/public/_headers`, which keeps search
engines away.

## Monitoring

The **Monitor** workflow checks the hosted project's scheduled jobs once a day and fails, which
sends GitHub's usual email, when one stops working
([ADR 0067](adr/0067-check-scheduled-jobs-from-github-actions.md)). It checks two jobs:

- The photo purge: it fails when a deleted chat's folder has waited over an hour and a run failed
  to purge it or no call succeeded in the last 15 minutes, or when the latest call to
  `purge-coach-media` was not answered with a 2xx while folders are queued. A 401 usually means the
  secret key in Vault is outdated.
- The removal of inactive guests
  ([ADR 0131](adr/0131-remove-guests-inactive-for-90-days.md)): it fails when a guest is more than
  a day past the 90 days, or the hourly `remove-inactive-guests` job has not succeeded in the last
  two hours.

Its log shows only counts, ages and status codes. It reads `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_PROJECT_ID` from the repository's `monitoring` environment, which allows only main and
needs no approval ([ADR 0132](adr/0132-monitor-with-a-read-only-token.md)). Its token is not the
deploy's: create it under Account → Access Tokens for this project alone, with no permission but
**Database: Read**, and an expiry, such as a year; the Monitor fails once it expires, and a new one
replaces it. Start it from the Actions tab with **Run workflow** to check at once.

## Install on an iPhone

A release build runs on its own, without the dev server, against the hosted project. It needs a Mac
with Xcode and an Apple Developer account added in Xcode's settings.

> [!WARNING]
> Benchbite is still in development. The hosted database may be reset at any time, and with it every
> account, plan and workout logged in a build that uses it.

1. Create `.env.production.local` (ignored by Git) with the hosted project's values, from the
   Supabase dashboard's project settings:

   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   The URL is the project's root, without `/rest/v1`. This file takes precedence over `.env.local`,
   which still points at the local stack. Never put a secret key in it: everything in it ends up in
   the app.

2. Connect the iPhone, trust the Mac, and turn on **Developer Mode** (Settings → Privacy & Security).
3. Find the iPhone's UDID with `xcrun devicectl list devices`, then build and install:

   ```bash
   pnpm native:release
   APP_VARIANT=production pnpm ios --device <udid> --configuration Release
   ```

   `APP_VARIANT=production` makes it Benchbite itself, not the development build, which has a name
   and bundle ID of its own ([ADR 0096](adr/0096-develop-with-a-development-build.md)). The
   `ios/` folder (ignored by Git) is generated for one of the two, so `pnpm native:release` makes
   it anew; `pnpm native:dev` makes it for development again afterwards. Run the second command
   again to install a newer version.
