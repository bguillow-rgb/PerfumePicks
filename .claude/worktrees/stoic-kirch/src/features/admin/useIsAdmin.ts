// Admin-role check. Wraps the `is_current_user_admin()` Supabase RPC
// added in migration 016. Fail-closed: any error (network, RPC missing,
// anonymous caller) resolves to `false` so a non-admin surface never
// accidentally renders.
//
// Split into a pure async function (`checkIsAdmin`) and a React hook
// (`useIsAdmin`) so the pure function can be unit-tested without
// hook-renderer infrastructure. The hook wraps it with useState +
// useEffect + a cancellation guard and an auth-state listener so it
// re-checks on sign-in / sign-out.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { captureException } from '@/src/lib/observability';

/**
 * Pure check — no React dependencies. Safe to call from non-hook
 * contexts (server code, tests, background tasks). Resolves to `false`
 * on any error path.
 */
export async function checkIsAdmin(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_current_user_admin');
    if (error) {
      // Report but don't throw — an RPC error should never crash the
      // caller. Possible causes: anon caller (RPC requires auth),
      // network timeout, migration not yet applied in a dev branch.
      captureException(error, { context: 'admin.isCurrentUserAdmin' });
      return false;
    }
    return data === true;
  } catch (err) {
    captureException(err, { context: 'admin.isCurrentUserAdmin.throw' });
    return false;
  }
}

/**
 * Hook for gating UI visibility. Returns `{ isAdmin, loading }`.
 *
 * Consumers should check `loading` before rendering admin-only surfaces
 * to avoid a flash of admin UI on cold start followed by a hide. Most
 * callers render nothing while loading and the admin surface when
 * isAdmin is true.
 *
 * Re-checks on Supabase auth state changes so signing in / out of
 * admin accounts flips the UI without a full app reload.
 */
export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const result = await checkIsAdmin();
      if (!cancelled) {
        setIsAdmin(result);
        setLoading(false);
      }
    };

    // Initial check on mount.
    run();

    // Re-check when the user signs in or out.
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (!cancelled) run();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { isAdmin, loading };
}
