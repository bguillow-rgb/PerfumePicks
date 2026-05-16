/**
 * Scan quota hook — device-scoped, not user-scoped.
 * Mirrors Pour Picks' useScanCount.ts architecture.
 *
 * Policy:
 *   TOTAL_SCAN_LIMIT — absolute cap for any caller on this device.
 *   GUEST_SCAN_LIMIT — anonymous users block here; must sign in to go further.
 */

import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';

import { getDeviceId } from '@/src/lib/deviceId';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

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
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setCount(0);
      setIsAnonymous(true);
      return;
    }
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const anonymous =
        user?.app_metadata?.provider === 'anonymous' || !!(user as any)?.is_anonymous;
      setIsAnonymous(!!anonymous);

      const { count: c } = await supabase
        .from('scan_images')
        .select('id', { count: 'exact', head: true })
        .eq('device_id', deviceId)
        .eq('refunded', false);
      setCount(c ?? 0);
    } catch {
      // Keep previous count on failure.
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
    if (!isSupabaseConfigured) return;
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const effectiveLimit = isAnonymous ? GUEST_SCAN_LIMIT : TOTAL_SCAN_LIMIT;
  const guestLimitReached =
    isAnonymous === true && count !== null && count >= GUEST_SCAN_LIMIT;
  const limitReached = count !== null && count >= TOTAL_SCAN_LIMIT;

  return {
    count,
    isAnonymous,
    limit: effectiveLimit,
    remaining: count !== null ? Math.max(0, effectiveLimit - count) : null,
    limitReached,
    guestLimitReached,
    loading,
    refresh,
  };
}
