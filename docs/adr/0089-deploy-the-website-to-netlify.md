# 0089. Deploy the website to Netlify

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The website of ADR 0088 needs a host, and has to be reachable for testing before `benchbite.com`
points at it. It is a folder of static files, built the same way each time.

## Decision

- **Netlify hosts the site,** on its `netlify.app` address until the domain is moved.
- **GitHub Actions builds and deploys it, by hand.** The **Deploy website** workflow runs on `main`
  when started, like the Supabase deploy of ADR 0030. Netlify's free plan has 300 credits a month,
  a production deploy spends 15, and the site is paused when they run out, so a deploy should be a
  choice and not a side effect of every merge.
- **The workflow sends a zip to Netlify's API with `curl`, in a job of its own.** A Netlify token is
  tied to the account and not to this site. So one job without secrets installs and builds, and the
  deploy job takes only the built files, with no checkout and no package. Secrets kept to one step
  of the same job would not do, as a package could leave a process or a changed `PATH` behind. The
  token lives in a `website` environment that allows only `main`.
- **The CI workflow checks and builds the site on every pull request,** so that a broken site is
  found before a deploy.
- **Search engines are kept away with `X-Robots-Tag: noindex`** while the legal pages hold
  placeholder text. The header has to go when the text is written and the domain is moved.

## Alternatives considered

- **Netlify's own Git integration and builds:** it would give previews of pull requests, but needs
  access to the repository, builds on every change and spends credits for it.
- **The Netlify CLI:** it adds about 8,500 lines to the lockfile and a native module, only to upload
  one folder.
- **A draft deploy for each pull request:** Netlify documents drafts for deploys listed file by file,
  not for a zip, and that upload would take a script of its own. The `netlify.app` address is a test
  address for now, so deploying there after a merge is enough.

## Consequences

- A pull request has no preview address; its site is seen locally or after merging and deploying.
- About 20 deploys a month are the limit on the free plan.
- Going live still takes moving the domain, replacing the placeholders and removing the header.
- Netlify is another processor of visitors' requests, which the privacy policy has to name.
