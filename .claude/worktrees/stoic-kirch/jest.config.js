// Jest config using the official jest-expo preset. Covers RN module
// resolution, transform setup, and the 'react-native' testEnvironment
// that ships with Expo SDK 54.
//
// Scope intentionally narrow for now: only `src/` and `app/` test files.
// `scripts/` has its own Node-style entry points and isn't RN-runtime.

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  moduleNameMapper: {
    // Mirror the path alias from tsconfig so `@/...` imports resolve.
    '^@/(.*)$': '<rootDir>/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-clone-referenced-element|@react-native-community|expo(nent)?|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))',
  ],
};
