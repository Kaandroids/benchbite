// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
// Turns off ESLint rules that conflict with Prettier; formatting is checked by Prettier itself.
const prettierConfig = require('eslint-config-prettier/flat');

// Edge Functions run on Deno and are linted with `deno lint`.
module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*', 'supabase/functions/*']),
  expoConfig,
  prettierConfig,
]);
