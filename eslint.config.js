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
      // A mutation that fails is reported under its name (ADR 0151); without one, every failure
      // would read "Could not save a change".
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name='useMutation'] > ObjectExpression:not(:has(> Property[key.name='meta']))",
          message: "Give the mutation a meta: { where: 'Could not …' }, which names it in reports.",
        },
        {
          selector:
            "CallExpression[callee.name='useMutation'][arguments.0.type!='ObjectExpression']",
          message: 'Pass useMutation its options as an object, so that its meta can be checked.',
        },
      ],
    },
  },
  prettierConfig,
]);
