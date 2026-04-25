// Jest setup file — runs before every test suite. Applies RN native-
// module mocks that jest-expo doesn't cover out of the box.

// AsyncStorage — the community mock lives inside the package itself.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Supabase client — tests that touch network must mock their own paths.
// This bare stub just prevents import-time crashes when a module under
// test does `import { supabase } from '@/lib/supabase'` without actually
// calling it.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(),
    rpc: jest.fn(),
    storage: { from: jest.fn() },
    functions: { invoke: jest.fn() },
  },
}));

// Sentry — tests should never hit the real Sentry transport.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
}));
