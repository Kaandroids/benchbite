# 0090. Check the website's Astro files

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

ADR 0088 says that `tsc` does not check `.astro` files and that their errors surface in the build. They do not: a missing text, a wrong prop and a wrong type all passed `tsc` and `astro build`, and the pages were written. Most of the site's code is in these files. `astro check` is made for them, but crashed at start, as an optional peer range picked a beta of `@emnapi/runtime`.

ADR 0088 also says that the app's Prettier leaves out what does not belong to it. The root `format:check` does cover the site's `.ts`, `.css` and `.json` files, and nothing formats `.astro` files.

## Decision

- **`pnpm check` in `website/` runs `astro check` and `tsc`,** and CI runs it on every pull request.
- **`@emnapi/runtime` is pinned to a stable version** with a pnpm override in `website/pnpm-workspace.yaml`, until the range no longer picks the beta.
- **Prettier stays as it is:** the root formats the site's other files, and `.astro` files are kept by hand.

## Alternatives considered

- **Correcting the sentence and leaving the files unchecked:** typos in page names and texts would go on reaching the site, as nothing else looks at them.
- **`@astrojs/ts-content-mapper`:** experimental, and made for TypeScript 7.1 and later, while the site and the app use 6.
- **`prettier-plugin-astro`:** it would have to be a dependency of the app, as the root runs Prettier, for a package the app does not use.

## Consequences

- A wrong text, prop, page name or Bite face now fails CI.
- The override has to go when `@astrojs/check` no longer needs it.
- The formatting of `.astro` files is not enforced.
