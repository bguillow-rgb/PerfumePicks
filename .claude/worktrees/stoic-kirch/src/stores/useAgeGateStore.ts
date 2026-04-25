import { useEffect } from 'react';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@stickpicks/age_verified';
const BLOCKED_AT_KEY = '@stickpicks/age_blocked_at';
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Age-gate state. "verified" and the "blocked" timestamp are both persisted
 * to AsyncStorage. Tapping "No" starts a 24-hour cooldown that survives app
 * restarts — required for Apple 1.1/1.4.3. After 24h the user can retry.
 */
type Status = 'loading' | 'unknown' | 'verified' | 'blocked';

interface AgeGateState {
  status: Status;
  blockedUntil: number | null; // epoch ms; set when status === 'blocked'
  hydrate: () => Promise<void>;
  confirmVerified: () => Promise<void>;
  markBlocked: () => Promise<void>;
  reset: () => Promise<void>;
}

export const useAgeGateStore = create<AgeGateState>((set) => ({
  status: 'loading',
  blockedUntil: null,

  hydrate: async () => {
    try {
      const v = await AsyncStorage.getItem(KEY);
      if (v === 'true') {
        set({ status: 'verified', blockedUntil: null });
        return;
      }
      const rawTs = await AsyncStorage.getItem(BLOCKED_AT_KEY);
      const ts = rawTs ? Number(rawTs) : NaN;
      if (Number.isFinite(ts) && Date.now() - ts < COOLDOWN_MS) {
        set({ status: 'blocked', blockedUntil: ts + COOLDOWN_MS });
        return;
      }
      if (rawTs) {
        // Expired — clean up so we don't re-check forever.
        try { await AsyncStorage.removeItem(BLOCKED_AT_KEY); } catch {}
      }
      set({ status: 'unknown', blockedUntil: null });
    } catch {
      set({ status: 'unknown', blockedUntil: null });
    }
  },

  confirmVerified: async () => {
    set({ status: 'verified', blockedUntil: null });
    try {
      await AsyncStorage.setItem(KEY, 'true');
      await AsyncStorage.removeItem(BLOCKED_AT_KEY);
    } catch {
      // Non-blocking — worst case they get asked again next launch
    }
  },

  markBlocked: async () => {
    const now = Date.now();
    set({ status: 'blocked', blockedUntil: now + COOLDOWN_MS });
    try {
      await AsyncStorage.setItem(BLOCKED_AT_KEY, String(now));
    } catch {
      // Non-blocking — worst case cooldown is only session-long on this device
    }
  },

  reset: async () => {
    set({ status: 'unknown', blockedUntil: null });
    try {
      await AsyncStorage.removeItem(BLOCKED_AT_KEY);
    } catch {}
  },
}));

/** Convenience hook that hydrates once on mount. */
export function useHydrateAgeGate() {
  const hydrate = useAgeGateStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
}
