# 0129. A content security policy for the website

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

The website is static. It runs one script, which puts the token from the link to delete an account into the form, and its forms post to Edge Functions that answer with a redirect back to the site (ADR 0094). Its only security headers kept other sites from framing it (#537). A policy that allows only what the site uses would limit what an injected tag could do.

## Decision

- **The policy is a `<meta>` in each page, made by Astro's `security.csp`.** Astro hashes the inline `<style>` blocks and the script it emits, so `script-src` allows those hashes and the site's own files, and nothing inline otherwise.
- **Everything else comes from the site itself (`default-src 'self'`),** with `base-uri 'none'` and `object-src 'none'`.
- **Forms post only to the site and the Edge Functions.** `form-action` names `'self'`, as it also checks the redirect back to the site, and the functions' origin. That origin is read from `PUBLIC_FUNCTIONS_URL` in `src/functions-url.mjs`, which both the pages and the config use. The config reads it with Vite's `loadEnv`, so a `.env` file counts as it does for the pages.
- **Style attributes are allowed (`style-src-attr 'unsafe-inline'`).** The components set some from their props, such as a day's colours. A style attribute cannot run code, and hashing each would need `'unsafe-hashes'` and a new hash whenever a colour changes.
- **What a `<meta>` cannot set stays in `public/_headers`:** `frame-ancestors 'none'` and `X-Frame-Options`. They are joined by `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a `Permissions-Policy` that turns off the camera, microphone, location, payment and USB.
- **Shiki is off.** The site has no code blocks, and its inline styles would not pass the policy.

## Alternatives considered

- **A policy in the `Content-Security-Policy` header:** a header cannot carry the hashes, which change with each build, so it would need `'unsafe-inline'` for scripts. A header policy and a `<meta>` policy both apply, so a header cannot restrict scripts beside the `<meta>` either.
- **Nonces:** they need a server to make one for each request; the site is static.

## Consequences

- A new script, style or embed works only if Astro emits it, as it hashes those, or it comes from the site. Anything from another origin needs its source added to the directives in `astro.config.mjs`.
- Inline event handlers, such as `onclick`, are blocked; scripts go in `<script>` tags.
- Code blocks need Prism, not Shiki, if the site ever has them.
- The policy cannot be tried in `astro dev`; `pnpm build` and `pnpm preview` show it.
- `vite` is a dev dependency of the website only for `loadEnv`, and its range follows the Vite that Astro brings.
