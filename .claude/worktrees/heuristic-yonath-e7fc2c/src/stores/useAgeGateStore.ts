import { useEffect } from 'react';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@stickpicks/age_verified';

/**
 * Age-gate state. Only "verified" is persisted to AsyncStorage — "blocked"
 * is in-memory only, so if the user taps No by mistake they just have to
 * relaunch (or tap Go Back on the blocked screen) to retry.
 */
type Status = 'loading' | 'unknown' | 'verified' | 'blocked';

interface AgeGateState {
  status: Status;
  hydrate: () => Promise<void>;
  confirmVerified: () => Promise<void>;
  markBlocked: () => void;
  reset: () => void;
}

export const useAgeGateStore = create<AgeGateState>((set) => ({
  status: 'loading',

  hydrate: async () => {
    try {
      const v = await AsyncStorage.getItem(KEY);
      set({ status: v === 'true' ? 'verified' : 'unknown' });
    } catch {
      set({ status: 'unknown' });
    }
  },

  confirmVerified: async () => {
    set({ status: 'verified' });
    try {
      await AsyncStorage.setItem(KEY, 'true');
    } catch {
      // Non-blocking — worst case they get asked again next launch
    }
  },

  markBlocked: () => {
    // Session-only: do NOT persist. Relaunching restores them to 'unknown'.
    set({ status: 'blocked' });
  },

  reset: () => {
    set({ status: 'unknown' });
  },
}));

/** Convenience hook that hydrates once on mount. */
export function useHydrateAgeGate() {
  const hydrate = useAgeGateStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
}
