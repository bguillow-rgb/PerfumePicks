// Counts scans against the durable device id so the quota follows the user
// across Guest → signup → Guest again, not per-user (which would reset on
// every anonymous sign-in).
//
// Policy:
//   TOTAL_SCAN_LIMIT    — absolute cap for any caller on this device.
//   GUEST_SCAN_LIMIT    — anonymous users block here; must sign in to go further.
//   Pro / comped users  — bypass both caps entirely (unlimited scans).
//                         Both the client gate below and the server quota
//                         block in supabase/functions/identify-cigar
//                         honor this so the rule stays in sync on both
//                         sides of the wire. Without this bypass, a Pro
//                         user still sees the "used all free scans" gate
//                         because the count query doesn't care about
//                         entitlement.

import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/deviceId';
import { useProStore } from '@/src/stores/useProStore';
import { captureException } from '@/src/lib/observability';

export const TOTAL_SCAN_LIMIT = 10;
export const GUEST_SCAN_LIMIT = 5;

interface ScanCountState {
  count: number | null;
  isAnonymous: boolean | null;
  limit: number;
  remaining: number | null;
  limitReached: boolean;
  guestLimitReached: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useScanCount(): ScanCountState {
  const [count, setCount] = useState<number | null>(null);
  const [isAnonymous, setIsAnonymous] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const { data: { user } } = await supabase.auth.getUser();
      const anonymous = user?.app_metadata?.provider === 'anonymous' || !!user?.is_anonymous;
      setIsAnonymous(!!anonymous);

      const { count: c } = await supabase
        .from('scan_images')
        .select('id', { count: 'exact', head: true })
        .eq('device_id', deviceId);
      setCount(c ?? 0);
    } catch (err) {
      // Keep previous count on failure; don't wipe state mid-session.
      // Report so on-call can see paywall-adjacent RLS / network errors.
      captureException(err, { context: 'scanCount.refresh' });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => { refresh(); });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  // Pro / comped users bypass the quota. Reading from the store here keeps
  // the hook reactive — as soon as the session's comp-check flips isPro
  // true, any screen gated on `limitReached` re-renders with it cleared.
  const isPro = useProStore((s) => s.isPro);
  const hasProHydrated = useProStore((s) => s.hasHydrated);

  const effectiveLimit = isAnonymous ? GUEST_SCAN_LIMIT : TOTAL_SCAN_LIMIT;
  // Hide the gate entirely for Pro users. Until the Pro store has
  // hydrated we fail-open (treat as Pro) so we never flash the "used
  // all scans" screen during cold-boot, which would be a worse bug than
  // briefly letting a non-Pro user tap through.
  const bypassQuota = isPro || !hasProHydrated;

  const guestLimitReached =
    !bypassQuota && isAnonymous === true && count !== null && count >= GUEST_SCAN_LIMIT;
  const limitReached = !bypassQuota && count !== null && count >= TOTAL_SCAN_LIMIT;

  return {
    count,
    isAnonymous,
    limit: effectiveLimit,
    remaining: bypassQuota
      ? Infinity
      : count !== null
      ? Math.max(0, effectiveLimit - count)
      : null,
    limitReached,
    guestLimitReached,
    loading,
    refresh,
  };
}
