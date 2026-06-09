import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/src/lib/storageKeys';

/** Free tier daily scan cap. */
export const FREE_DAILY_SCAN_LIMIT = 10;

interface ScanState {
  dailyScanCount: number;
  dailyScanDate: string;
  recordScan: () => void;
  getRemainingScans: () => number;
  isAtLimit: () => boolean;
}

export const useScanStore = create<ScanState>()(
  persist(
    (set, get) => ({
      dailyScanCount: 0,
      dailyScanDate: '',

      recordScan: () => {
        const today = new Date().toLocaleDateString('en-CA');
        set((s) => ({
          dailyScanCount: s.dailyScanDate === today ? s.dailyScanCount + 1 : 1,
          dailyScanDate: today,
        }));
      },

      getRemainingScans: () => {
        const today = new Date().toLocaleDateString('en-CA');
        const s = get();
        const count = s.dailyScanDate === today ? s.dailyScanCount : 0;
        return Math.max(0, FREE_DAILY_SCAN_LIMIT - count);
      },

      isAtLimit: () => {
        const today = new Date().toLocaleDateString('en-CA');
        const s = get();
        const count = s.dailyScanDate === today ? s.dailyScanCount : 0;
        return count >= FREE_DAILY_SCAN_LIMIT;
      },
    }),
    {
      name: STORAGE_KEYS.scan,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ dailyScanCount: s.dailyScanCount, dailyScanDate: s.dailyScanDate }),
    },
  ),
);
