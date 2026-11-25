# 0171. Check sign-ups with Cloudflare Turnstile

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Every sign-up and every new code sends an email, and the email limit of Supabase Auth is shared by
all users (ADR 0091). Without a captcha one client could use it up with random addresses and stop
sign-ups for up to an hour, spend the sender's monthly volume and hurt its reputation; guest
sessions, which send no email, could be made by the thousand (#455).

Supabase Auth checks hCaptcha or Cloudflare Turnstile. When it is on, it asks every request of
these for a token: signing up, guests too (`/signup`), signing in with a password (`/token`),
sending a code (`/resend`, `/otp`, `/magiclink`) and a password reset (`/recover`). Confirming a
code, refreshing a session and changing the user, as a guest's address, need none.

## Decision

- **Cloudflare Turnstile,** on Cloudflare's free plan, in its managed mode with the widget shown
  only when it needs a tap. hCaptcha's free plan has no mode that most people never see.
- **A page of our own on the website,** `/captcha/`, which runs the widget and posts its tokens to
  the app. Turnstile has no native SDK, so the app opens the page in `react-native-webview`, unseen.
  The packages that do this for React Native load the widget through their author's domain.
- **One token per request,** asked for by `captchaToken()` one request at a time, as a token is
  used once. When Turnstile needs a tap, a sheet shows over the app, the splash screen too: on a
  form the person may close it, which ends the request without a message; at first launch, which
  needs a guest session, they cannot. When no token comes, the form says so, and a first launch
  shows its screen for no connection.
- **Keys:** the site key is public and held by the page alone; a development build of the
  app names Cloudflare's test key, the only kind of key the page takes from it. The secret key is the repository's secret `TURNSTILE_SECRET_KEY`, which
  the deploy workflow adds to the settings it pushes, as it does the email sender. The local stack
  checks no captcha, so tests, scripts and end-to-end flows run as before.

## Alternatives considered

- **hCaptcha:** its React Native package is official, but its free plan shows the challenge more
  often, and its quiet mode is paid.
- **The page as HTML inside the app, with the website as its origin:** no page to host, but a
  React Native package that tried it moved to a hosted page over the widget's cookies, and
  Cloudflare's own guide loads a hosted page.
- **A captcha only when a client looks suspicious:** Supabase Auth checks a token on every request
  or on none.
- **No captcha, lower limits:** the shared limit is what an attacker uses up; a lower one stops
  real people sooner.

## Consequences

- Cloudflare learns the IP address and browser details of whoever signs up or in; the privacy
  policy names it as a processor (#726).
- A guest's email change (`PUT /user`) needs no token, and Supabase Auth cannot be made to ask for
  one there; it also sends the email before it writes to the database, so no trigger can stop it.
  So the shared limit goes up from 30 to 500 emails an hour and `max_frequency` from one to two
  minutes: one guest sends at most 30 an hour, and using the limit up needs many guests, each with
  a token. Limits per account and per address, before an email is sent, need Supabase's Send Email
  Hook, which is left for later.
- Builds older than this one cannot sign up, sign in or start a guest session once the hosted
  project checks the captcha. Only the maintainer's builds are that old.
- The website must be deployed with the page before the hosted project checks the captcha.
