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
    '^@/modules/(.*)$': '<rootDir>/modules/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/supabase/functions/_shared/$1',
  },
  // Packages that ship untranspiled code, with pnpm's .pnpm folder in front.
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|standard-navigation))',
  ],
  // Node scripts and Edge Functions have their own tests (node, deno test, pgTAP).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/scripts/', '<rootDir>/supabase/'],
  // With --coverage, as CI runs it: every file of the app counts, a file no test imports too, and
  // falling under the thresholds, set just under the coverage of 2026-11-18, fails (#542).
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/test/**',
    '!src/**/*.d.ts',
    '!src/lib/database.types.ts',
  ],
  coverageReporters: ['text-summary'],
  coverageThreshold: {
    global: { statements: 90, branches: 85, functions: 87, lines: 91 },
  },
};
