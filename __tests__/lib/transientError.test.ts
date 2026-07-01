import { isTransientNetworkFailure } from '@/src/lib/sync/transientError';

describe('isTransientNetworkFailure', () => {
  describe('transient (codeless connectivity blips) → true', () => {
    const transient: [string, unknown][] = [
      ['RN fetch failure', { message: 'TypeError: Network request failed' }],
      ['web fetch failure', new Error('Failed to fetch')],
      ['generic network error', { message: 'Network Error' }],
      ['iOS offline', new Error('The Internet connection appears to be offline.')],
      ['ECONNRESET', { message: 'read ECONNRESET' }],
      ['ETIMEDOUT (node dns/conn)', { message: 'connect ETIMEDOUT' }],
      ['ENOTFOUND', { message: 'getaddrinfo ENOTFOUND jdk.supabase.co' }],
      ['connection reset', { message: 'Connection reset by peer' }],
      ['connection refused', { message: 'Connection refused' }],
      ['connection aborted', { message: 'The connection was aborted' }],
      ['empty-string code + network msg', { code: '', message: 'Network request failed' }],
    ];
    it.each(transient)('%s', (_label, err) => {
      expect(isTransientNetworkFailure(err)).toBe(true);
    });
  });

  describe('actionable (coded server errors) → false, stays loud', () => {
    const actionable: [string, unknown][] = [
      ['23514 check violation', { code: '23514', message: 'new row violates check constraint' }],
      ['42703 undefined column', { code: '42703', message: "column dna does not exist" }],
      ['42501 RLS denial', { code: '42501', message: 'new row violates row-level security policy' }],
      ['57014 statement timeout (THE LANDMINE)', { code: '57014', message: 'canceling statement due to statement timeout' }],
      ['53300 pooler exhaustion', { code: '53300', message: 'remaining connection slots are reserved' }],
      ['PGRST schema-cache miss', { code: 'PGRST204', message: "Could not find the 'dna' column in the schema cache" }],
    ];
    it.each(actionable)('%s', (_label, err) => {
      expect(isTransientNetworkFailure(err)).toBe(false);
    });
  });

  describe('landmine guard: codeless "timeout" is NOT swallowed', () => {
    it('a bare timeout message without a code stays loud (over-report beats swallow)', () => {
      // We deliberately removed bare "timeout" matching. A statement/gateway
      // timeout that somehow arrives without a code must still be captured.
      expect(isTransientNetworkFailure({ message: 'Request timeout' })).toBe(false);
      expect(isTransientNetworkFailure(new Error('operation timed out'))).toBe(false);
    });
  });

  describe('unknown shapes → false (loud by default)', () => {
    it.each([
      ['plain string', 'something exploded'],
      ['null', null],
      ['undefined', undefined],
      ['number', 500],
      ['empty error', new Error('')],
    ])('%s', (_label, err) => {
      expect(isTransientNetworkFailure(err)).toBe(false);
    });
  });
});
