import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

import { functionsUrl } from './src/functions-url.mjs';

// Where the forms post to, read as the pages read it: from the environment and the .env files,
// which the config is not given otherwise.
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'PUBLIC_');
const functionsOrigin = new URL(functionsUrl(env.PUBLIC_FUNCTIONS_URL)).origin;

export default defineConfig({
  site: 'https://benchbite.com',
  devToolbar: { enabled: false },
  // The site has no code blocks, and Shiki's inline styles would not pass the policy below.
  markdown: { syntaxHighlight: false },
  // A Content-Security-Policy in each page (#537). Astro hashes the inline styles and the one
  // script it emits, so nothing else runs; everything else comes from the site itself. The forms
  // post only to the Edge Functions, which answer by sending the browser back to the site
  // ('self'), a redirect form-action checks too. The style attributes the components set from
  // their props, such as a day's colours, are let through: they cannot run code. What a <meta>
  // cannot set, as frame-ancestors, is in public/_headers. ADR 0129 has the reasons.
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
