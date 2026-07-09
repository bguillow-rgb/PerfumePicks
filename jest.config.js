module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  testMatch: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/web/',
    '/docs/',
    // Anchored to rootDir so `npx jest` still works when run FROM a worktree
    // (an unanchored '/.claude/worktrees/' matches every path inside one).
    '<rootDir>/.claude/worktrees/',
  ],
  moduleNameMapper: {
    // Specific @/ mocks MUST precede the generic '^@/(.*)$' alias — Jest uses
    // the FIRST matching mapper, so listing them after made them dead entries.
    '^@/src/lib/sync/syncWrite$': '<rootDir>/__mocks__/src/lib/sync/syncWrite.js',
    '^@/src/lib/observability/errors$': '<rootDir>/__mocks__/src/lib/observability/errors.js',
    '^@/lib/supabase$': '<rootDir>/__mocks__/lib/supabase.js',
    '^@/(.*)$': '<rootDir>/$1',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/@react-native-async-storage/async-storage.js',
    '^expo-crypto$': '<rootDir>/__mocks__/expo-crypto.js',
    '^expo-haptics$': '<rootDir>/__mocks__/expo-haptics.js',
    '^@sentry/react-native$': '<rootDir>/__mocks__/@sentry/react-native.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@sentry/.*)',
  ],
  roots: ['<rootDir>/__tests__'],
};
