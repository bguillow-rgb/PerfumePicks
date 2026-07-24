import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/src/lib/storageKeys';

/**
 * Free-tier LIFETIME scan cap (was a daily cap of 10). A daily reset never
 * created a real decision point — the wall reopened every morning, so scanning
 * essentially never paywalled. A lifetime cap makes the identify feature a
 * genuine "try it a few times, then decide" surface (the model that converts
 * on Pour, which uses a 10-lifetime cap). 5 lets a free user feel the magic a
 * handful of times before the permanent wall.
 *
 * Client-side UX guard only (AsyncStorage) — resets on reinstall. Real
 * enforcement, if needed, belongs in a server counter (fast-follow).
 */
export const FREE_LIFETIME_SCAN_LIMIT = 5;

interface ScanState {
  /** Total scans ever recorded on this install (free-tier lifetime counter). */
  lifetimeScanCount: number;
  recordScan: () => void;
  getRemainingScans: () => number;
  isAtLimit: () => boolean;
}

export const useScanStore = create<ScanState>()(
  persist(
    (set, get) => ({
      lifetimeScanCount: 0,

      recordScan: () => set((s) => ({ lifetimeScanCount: s.lifetimeScanCount + 1 })),

      getRemainingScans: () => Math.max(0, FREE_LIFETIME_SCAN_LIMIT - get().lifetimeScanCount),

      isAtLimit: () => get().lifetimeScanCount >= FREE_LIFETIME_SCAN_LIMIT,
    }),
    {
      name: STORAGE_KEYS.scan,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ lifetimeScanCount: s.lifetimeScanCount }),
      // v0 persisted { dailyScanCount, dailyScanDate }. Seed the lifetime
      // counter from whatever the old daily counter held so existing users
      // aren't handed a fresh 5 on update.
      version: 1,
      migrate: (persisted: unknown, version: number) => {
        if (version === 0 && persisted && typeof persisted === 'object') {
          const old = persisted as { dailyScanCount?: number };
          return { lifetimeScanCount: old.dailyScanCount ?? 0 } as ScanState;
        }
        return persisted as ScanState;
      },
    },
  ),
);
