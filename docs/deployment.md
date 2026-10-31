# Deployment

How the hosted Supabase project is deployed and monitored, and how to install a release build on an
iPhone. To run everything locally, see [Development](development.md).

## Deploy the Supabase project

The hosted Supabase project is deployed by the **Deploy** workflow in GitHub Actions
([ADR 0030](adr/0030-deploy-supabase-from-github-actions.md)). It links the project, pushes the
settings in `supabase/config.toml`, applies new migrations and deploys the Edge Functions; it uploads
the exercise images when asked. It reads `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` and
`SUPABASE_DB_PASSWORD` from the repository's `production` environment. The Edge Functions' own
secrets, such as `GEMINI_API_KEY`, are set in the Supabase dashboard under Edge Functions → Secrets. Start it from the Actions tab
with **Run workflow**.

The scheduled photo purge reads the project URL and a secret API key from the project's Vault
([ADR 0063](adr/0063-purge-chat-photos-from-a-queue.md)). Set them once, in the dashboard's
SQL editor, with the project's reference and its `default` secret key from Project Settings →
API Keys, which `purge-coach-media` accepts:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<default secret key>', 'secret_key');
```

After rotating the key, update it with
`select vault.update_secret(id, '<new key>') from vault.secrets where name = 'secret_key';`.

## Monitoring

The **Monitor** workflow checks the hosted project's scheduled jobs once a day and fails, which
sends GitHub's usual email, when one stops working
([ADR 0067](adr/0067-check-scheduled-jobs-from-github-actions.md)). For now it checks the
photo purge: it fails when a deleted chat's folder has waited over an hour and a run failed to purge
it or no call succeeded in the last 15 minutes, or when the latest call to `purge-coach-media` was
not answered with a 2xx while folders are queued. Its log shows only counts, ages and status codes; a
401 usually means the secret key in Vault is outdated. It reads `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_PROJECT_ID` from the repository's `monitoring` environment, which holds the same values as
`production`, allows only main and needs no approval. Start it from the Actions tab with **Run
workflow** to check at once.

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
   pnpm expo run:ios --device <udid> --configuration Release
   ```

   The first build generates the `ios/` folder (ignored by Git). If it changes the `ios` and
   `android` scripts in `package.json`, undo that change. Run the command again to install a newer
   version.
