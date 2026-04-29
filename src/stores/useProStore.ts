import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ProState {
  isPro: boolean;
  purchasedAt: string | null;
  /** True once AsyncStorage has rehydrated — gate Pro-conditional UI on this to avoid flash. */
  hasHydrated: boolean;
  /** Activate Pro (called after successful IAP or restore) */
  activate: () => void;
  /** Deactivate Pro (for testing / refund) */
  deactivate: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useProStore = create<ProState>()(
  persist(
    (set) => ({
      isPro: false,
      purchasedAt: null,
      hasHydrated: false,
      activate: () => set({ isPro: true, purchasedAt: new Date().toISOString() }),
      deactivate: () => set({ isPro: false, purchasedAt: null }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: STORAGE_KEYS.pro,
      storage: createJSONStorage(() => AsyncStorage),
      // hasHydrated is runtime-only — don't serialize it
      partialize: (state) => ({ isPro: state.isPro, purchasedAt: state.purchasedAt }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
