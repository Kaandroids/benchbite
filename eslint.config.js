// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
// Turns off ESLint rules that conflict with Prettier; formatting is checked by Prettier itself.
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([globalIgnores(['dist/*', '.expo/*']), expoConfig, prettierConfig]);
