# 0088. A static website in the repository

- **Status:** Accepted, amended by ADR-0090
- **Date:** 2026-11-07

## Context

The app links to a privacy policy at `benchbite.com/privacy`, and the App Store and Google Play ask
for a privacy policy, a support page and a way to request deletion without the app. German law also
asks for an imprint. None of these pages exist yet. The site has six pages in three languages, and
no page needs a server, an account or anything from the database.

## Decision

- **The site lives in `website/` as its own package.** It has its own dependencies and lockfile, so
  that it builds without the app's and neither can break the other's install. The app's TypeScript,
  ESLint and Prettier leave out what does not belong to them.
- **Astro builds it to plain HTML and CSS.** Pages share one layout and one set of translations,
  and the result is a folder of files that any static host can serve.
- **Nothing on the site calls a third party.** There is no tracking, the font is served from the
  site itself, and the pages run no JavaScript, so that opening them shares no one's address with
  anyone else and no cookie banner is needed.
- **One light theme, for now.** The landing page is built from fixed, colourful sections, where a
  second theme would change little. A dark theme can follow from the same tokens.
- **The legal text is a visible placeholder until it is written.** Text in brackets stands in for
  the imprint's name and address and for the privacy policy and the terms, and has to be replaced
  before the site goes live.
- **English has the short addresses,** as the app's links do, and other languages sit below their
  code: `/privacy`, `/de/privacy`, `/tr/privacy`.

Where the site is hosted, and how it is deployed, is ADR 0089.

## Alternatives considered

- **Plain HTML files:** the simplest output, but the header, the footer and every text would be
  repeated in eighteen files.
- **Next.js:** its server features would go unused, and a server is what this site does not need.
- **Expo web, sharing code with the app:** it would send far more JavaScript for pages that are
  mostly text, and React Native's layout is a poor fit for a page of this kind.
- **A pnpm workspace with the app:** one lockfile, but a change to the site would touch the app's
  lockfile, and a host building the site would install the app's dependencies too.

## Consequences

- The site's dependencies have to be updated apart from the app's.
- Astro's `tsconfig` lookup climbs to the app's `tsconfig.json`, which needs the app's dependencies,
  so `website/astro.config.mjs` names the site's own file.
- `tsc` checks the translations but not the `.astro` files, whose errors surface in the build.
- Screenshots on the landing page are English in all three languages until they are made per
  language.
