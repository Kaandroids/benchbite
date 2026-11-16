// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
// Turns off ESLint rules that conflict with Prettier; formatting is checked by Prettier itself.
const prettierConfig = require('eslint-config-prettier/flat');

// Edge Functions run on Deno and are linted with `deno lint`. The website is its own package.
module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*', 'supabase/functions/*', 'website/*']),
  expoConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // Only the app's own modules: following every package's imports takes minutes.
      'import/no-cycle': ['error', { ignoreExternal: true }],
    },
  },
  prettierConfig,
]);
