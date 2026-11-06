import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://benchbite.com',
  output: 'static',
  devToolbar: { enabled: false },
  vite: {
    // Files outside this tsconfig's `include`, such as those of packages, would otherwise go by the
    // app's tsconfig one folder up, which needs the app's dependencies to be installed.
    tsconfig: 'tsconfig.json',
  },
});
