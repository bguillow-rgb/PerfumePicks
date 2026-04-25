// Tests for checkIsAdmin — the pure async function under useIsAdmin.
// The hook itself is exercised indirectly: if checkIsAdmin is correct,
// the hook's state transitions follow deterministically from the hook
// template (which has no branching logic beyond the async result).

import { checkIsAdmin } from '../useIsAdmin';
import { supabase } from '@/lib/supabase';

// The jest.setup.js already stubs the supabase client shape. We need
// to replace the rpc field per-test so we can simulate different RPC
// outcomes.

describe('checkIsAdmin', () => {
  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockReset();
  });

  it('returns true when the RPC resolves with data=true', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: true,
      error: null,
    });

    await expect(checkIsAdmin()).resolves.toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('is_current_user_admin');
  });

  it('returns false when the RPC resolves with data=false', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: false,
      error: null,
    });

    await expect(checkIsAdmin()).resolves.toBe(false);
  });

  it('returns false when the RPC returns an error object', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'RPC not found', code: '42883' },
    });

    await expect(checkIsAdmin()).resolves.toBe(false);
  });

  it('returns false when the RPC throws', async () => {
    (supabase.rpc as jest.Mock).mockRejectedValue(
      new Error('network lost'),
    );

    await expect(checkIsAdmin()).resolves.toBe(false);
  });

  it('returns false when data is null (edge case of successful but empty RPC)', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(checkIsAdmin()).resolves.toBe(false);
  });

  it('returns false when data is a truthy non-boolean (strict boolean check)', async () => {
    // Supabase client has been known to serialize booleans as strings
    // in some older driver versions. We require strict data === true
    // so any coercion would fail-closed.
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: 'true',
      error: null,
    });

    await expect(checkIsAdmin()).resolves.toBe(false);
  });
});
