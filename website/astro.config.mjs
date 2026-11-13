import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

import { functionsUrl } from './src/functions-url.mjs';

// Where the forms post to, read as the pages read it: from the environment and the .env files,
// which the config is not given otherwise. `vite` is a dependency only for loadEnv; keep its range
// on the Vite that Astro brings, so that an Astro upgrade moves both.
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'PUBLIC_');
const functionsOrigin = new URL(functionsUrl(env.PUBLIC_FUNCTIONS_URL)).origin;

export default defineConfig({
  site: 'https://benchbite.com',
  devToolbar: { enabled: false },
  // The site has no code blocks, and Shiki's inline styles would not pass the policy below.
  markdown: { syntaxHighlight: false },
  // A Content-Security-Policy in each page, with hashes of what Astro emits inline (#537,
  // ADR 0129). What a <meta> cannot set, as frame-ancestors, is in public/_headers.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "base-uri 'none'",
        "object-src 'none'",
        `form-action 'self' ${functionsOrigin}`,
      ],
      styleDirective: {
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
      },
    },
  },
  vite: {
    // Files outside this tsconfig's `include`, such as those of packages, would otherwise go by the
    // app's tsconfig one folder up, which needs the app's dependencies to be installed.
    tsconfig: 'tsconfig.json',
  },
});
