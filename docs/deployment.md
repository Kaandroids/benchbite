# Deployment

How the hosted Supabase project and the website are deployed and monitored, and how to install a
release build on an iPhone. To run everything locally, see [Development](development.md).

## Deploy the Supabase project

The hosted Supabase project is deployed by the **Deploy Supabase** workflow in GitHub Actions
([ADR 0030](adr/0030-deploy-supabase-from-github-actions.md)). It links the project, pushes the
settings in `supabase/config.toml`, applies new migrations and deploys the Edge Functions. It reads `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` and
`SUPABASE_DB_PASSWORD` from the repository's `production` environment, with `SMTP_PASSWORD`, the Lettermint project token that sends the account emails ([ADR 0091](adr/0091-confirm-accounts-with-a-code.md)), and `TURNSTILE_SECRET_KEY`, the secret of the Turnstile widget that guards sign-ups and sign-ins ([ADR 0171](adr/0171-check-sign-ups-with-cloudflare-turnstile.md)); deploy the website first, which holds the widget's page. The Edge Functions' own
secrets, such as `GEMINI_BACKEND` and `VERTEX_SERVICE_ACCOUNT` (below) and `LETTERMINT_API_TOKEN` (a Lettermint project token, for the emails Edge Functions send, [ADR 0094](adr/0094-delete-an-account-from-the-website.md)), are set in the Supabase dashboard under Edge Functions → Secrets. Start it from the Actions tab
with **Run workflow**.

Bite calls Gemini on Vertex AI in the EU
([ADR 0153](adr/0153-call-gemini-on-vertex-ai-in-the-eu.md)). To set it up once:

1. In a Google Cloud project with billing, enable the Vertex AI API, and accept the Cloud Data
   Processing Addendum under IAM & Admin → Privacy & Security.
2. Create a service account with the Vertex AI User role alone, and a JSON key for it.
3. Set two Edge Function secrets: `GEMINI_BACKEND` to `vertex`, and `VERTEX_SERVICE_ACCOUNT` to the
   key file as base64 on one line (`base64 -i key.json | tr -d '\n'`). Keep the file out of the
   repository, and delete it once the secret is set.
4. Create a budget for the project under Billing → Budgets & alerts. It warns and stops nothing:
   the project's own spend limit does
   ([ADR 0134](adr/0134-pause-bite-at-the-providers-spend-limit.md)).

To replace a key that may have leaked, delete it in Google Cloud, create another and set the
secret again.

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

## Supported versions and the texts' versions

The app asks the server when it opens which versions of it are still supported and which version
of the terms and of each consent is current
([ADR 0156](adr/0156-keep-what-a-build-holds-to-on-the-server.md)). Both change in the dashboard's
SQL editor, without a deploy or a release:

```sql
-- Builds below 1.4.0 are no longer supported on iOS.
update public.supported_app_versions set lowest_version = '1.4.0' where platform = 'ios';

-- New terms, announced now and applying in 30 days, with what changed in each language.
insert into public.agreement_versions (agreement, version, applies_at, summary)
values ('terms', '2027-02-01', now() + interval '30 days',
  '{"en": "…", "de": "…", "tr": "…"}');
```

The agreements are `terms`, `health_consent` and `ai_consent`. Publish the new text on the website
before its row: the app links to it. New terms are then asked of every user who finished the
onboarding ([ADR 0158](adr/0158-ask-again-when-the-terms-or-a-consent-change.md)): until the day
they apply with "Later", which brings the question back the next day, and from that day until they
accept. Write the summary in every language of the app; it is what the screen shows as "What
changed".

A new version of `health_consent` stops every user at their next start until they agree again or
withdraw, and one of `ai_consent` closes Bite and meal photos for each user until they consent
again at their next use
([ADR 0159](adr/0159-ask-for-the-consents-again-where-they-are-needed.md)). A consent's wording is
shown by the app itself: add the row only once the build with the new wording is in the stores,
and raise the lowest supported version to that build.

Raise the lowest supported version only once the newer build is in the stores. A build below it
shows "Update Benchbite" in place of the app, with a button to its store (#687), and the backend
refuses its requests (ADR 0157). Until a version is declared unsupported this way, every backend
change has to keep working for it. The button needs the app's page: set `ios.appStoreUrl` and
`android.playStoreUrl` in `app.json` once the app has one, before the first release; until then it
opens the App Store's front on iOS.

## What the app declares to Apple

`app.json` says that the app uses no encryption beyond what is exempt
(`ios.config.usesNonExemptEncryption`) and holds its privacy manifest (`ios.privacyManifests`): the
reasons it uses certain system APIs, the data it collects, and that it does not track
([ADR 0155](adr/0155-declare-encryption-and-data-use-to-apple.md)). The watch app's manifest is
`targets/watch/PrivacyInfo.xcprivacy`. React Native's merging of the libraries' manifests into the
app's is off (`privacyManifestAggregationEnabled` in `app.json`): it links the app's manifest into
the watch app beside the watch's own, which fails the build, and for a library built from source it
would add reasons the app left out on purpose. Nothing adds a library's reasons by itself, so a
new library with native code is checked by hand. To see what a build carries, run
`APP_VARIANT=production pnpm expo prebuild --platform ios --no-install` and read
`ios/Benchbite/PrivacyInfo.xcprivacy`; the libraries' own manifests are under `ios/Pods` after
`pod install`. A module Expo ships precompiled may carry an SDK on Apple's list with neither a
manifest nor a signature: build such a module from source, in `expo.autolinking.ios.buildFromSource`
in `package.json` ([ADR 0174](adr/0174-build-the-image-manipulator-from-source.md)), and check the
built app with `find <Benchbite.app> -name PrivacyInfo.xcprivacy`. Keep the manifest, the privacy policy and the stores' privacy details in step.

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
   `https://<project-ref>.supabase.co/functions/v1`, where the forms of the delete, withdraw
   and export pages post ([ADR 0094](adr/0094-delete-an-account-from-the-website.md),
   [ADR 0146](adr/0146-withdraw-a-consent-from-the-website.md),
   [ADR 0148](adr/0148-export-a-users-data-from-the-website.md)). The workflow stops without it.

The token reaches the whole Netlify account, so replace it if it may have leaked. Before the site
goes live, replace the placeholder texts and remove the `X-Robots-Tag` line from `website/public/_headers`, which keeps search
engines away.

## Monitoring

The app's crashes and errors go to the `benchbite-app` project in Sentry's EU region
(`https://benchbite.sentry.io`), without personal data
([ADR 0149](adr/0149-report-crashes-and-errors-to-sentry.md)).

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
- The AI spend ([ADR 0134](adr/0134-pause-bite-at-the-providers-spend-limit.md)): it fails once
  all users' AI calls this month cost 80 % of the provider's monthly limit, and once they reach it,
  when Bite pauses for everyone until the next month. Its log says only which, never how much.
  The limit is kept in `ai_spend_limit`, in dollars; when the provider's limit changes, change it
  there with a migration.

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
   EXPO_PUBLIC_SENTRY_DSN=https://<key>@<org>.ingest.de.sentry.io/<project>
   ```

   The URL is the project's root, without `/rest/v1`. The DSN is the `benchbite-app` project's, from
   Sentry's project settings under Client Keys ([ADR 0149](adr/0149-report-crashes-and-errors-to-sentry.md));
   without it the build reports nothing. This file takes precedence over `.env.local`, which still
   points at the local stack. Never put a secret key in it: everything in it ends up in the app.

   For stack traces Sentry can read, put an auth token, from Sentry's settings under Auth Tokens,
   in `.env.local` as `SENTRY_AUTH_TOKEN=...`: the build uploads its source maps and debug symbols
   with it. It is a secret, and never ends up in the app; without it the build still works, and
   Sentry cannot read its stack traces.

2. Connect the iPhone, trust the Mac, and turn on **Developer Mode** (Settings → Privacy & Security).
3. Build and install
   ([ADR 0161](adr/0161-build-the-app-with-scripts-in-the-repository.md)):

   ```bash
   pnpm build:ios:release                  # the one iPhone that is connected
   pnpm build:ios:release --device <udid>  # that one, when more are: xcrun devicectl list devices
   pnpm build:ios:release --no-install     # only build
   ```

   It builds Benchbite itself, not the development build, which has a name and bundle ID of its
   own ([ADR 0096](adr/0096-develop-with-a-development-build.md)), and stops with what to do when
   the file of step 1 is missing, does not name the hosted project over https, or holds a key that
   is not the publishable one; when no iPhone, more than one, or not the one named with `--device`
   is connected; or when the built app does not name the hosted project's server. Unlock the iPhone
   before it installs. The `ios/` folder (ignored by Git) is generated for one of the two builds,
   so the command makes it anew for the release; `pnpm native:dev` makes it for development again
   afterwards. Run the command again to install a newer version.
