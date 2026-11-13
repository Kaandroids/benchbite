import { defineConfig } from 'astro/config';

// Where the forms post to, as src/functions.ts reads it: the deploy sets it, and a build without it
// posts to the local stack.
const functionsOrigin = new URL(
  process.env.PUBLIC_FUNCTIONS_URL || 'http://127.0.0.1:54321/functions/v1',
).origin;

export default defineConfig({
  site: 'https://benchbite.com',
  devToolbar: { enabled: false },
  // A Content-Security-Policy in each page (#537). Astro hashes the inline styles and the one
  // script it emits, so nothing else runs; everything else comes from the site itself. The forms
  // post only to the Edge Functions, which answer by sending the browser back to the site
  // ('self'), a redirect form-action checks too. The style attributes the components set from
  // their props, such as a day's colours, are let through: they cannot run code. What a <meta>
  // cannot set, as frame-ancestors, is in public/_headers.
  // The site has no code blocks, and Shiki's inline styles would not pass the policy.
  markdown: { syntaxHighlight: false },
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
