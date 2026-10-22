// https://docs.expo.dev/develop/unit-testing/
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup-after-env.ts'],
  resolver: '<rootDir>/jest/resolver.js',
  // Metro resolves the tsconfig paths in the app; Jest needs them spelled out.
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/supabase/functions/_shared/$1',
  },
  // Packages that ship untranspiled code, with pnpm's .pnpm folder in front.
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|standard-navigation))',
  ],
  // Node scripts and Edge Functions have their own tests (node, deno test, pgTAP).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/scripts/', '<rootDir>/supabase/'],
};
