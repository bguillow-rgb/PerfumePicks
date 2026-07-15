import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ProState {
  /**
   * The single flag every screen reads. Derived: `rcPro || serverPro`.
   * A user is Pro if EITHER a RevenueCat entitlement OR the server flag
   * (profiles.is_pro — set by the RC webhook OR a redeemed promo code) is on.
   */
  isPro: boolean;
  /** RevenueCat entitlement (set by useRevenueCat / _layout sync). */
  rcPro: boolean;
  /** Server profiles.is_pro (RC webhook OR promo grant), read via my_pro_status(). */
  serverPro: boolean;
  purchasedAt: string | null;
  /** True once AsyncStorage has rehydrated — gate Pro-conditional UI on this to avoid flash. */
  hasHydrated: boolean;
  /** Activate Pro from a RevenueCat purchase/restore. */
  activate: () => void;
  /** Clear the RevenueCat entitlement (refund / no active RC sub). Does NOT touch a promo grant. */
  deactivate: () => void;
  setHasHydrated: (v: boolean) => void;
  /**
   * Sync the server source of truth (profiles.is_pro, incl. promo grants).
   * Called by useAppSync on sign-in via my_pro_status(). Independent of the
   * RevenueCat flag so the two can't clobber each other.
   */
  syncFromServer: (serverIsPro: boolean) => void;
}

/** Recompute the derived flag + purchasedAt from the two entitlement sources. */
function derive(rcPro: boolean, serverPro: boolean, purchasedAt: string | null) {
  const isPro = rcPro || serverPro;
  return {
    rcPro,
    serverPro,
    isPro,
    // Keep the first time we saw Pro; clear it only when both sources are off.
    purchasedAt: isPro ? (purchasedAt ?? new Date().toISOString()) : null,
  };
}

export const useProStore = create<ProState>()(
  persist(
    (set) => ({
      isPro: false,
      rcPro: false,
      serverPro: false,
      purchasedAt: null,
      hasHydrated: false,
      activate: () => set((s) => derive(true, s.serverPro, s.purchasedAt)),
      deactivate: () => set((s) => derive(false, s.serverPro, s.purchasedAt)),
      setHasHydrated: (v) => set({ hasHydrated: v }),
      syncFromServer: (serverIsPro) =>
        set((s) => derive(s.rcPro, serverIsPro, s.purchasedAt)),
    }),
    {
      name: STORAGE_KEYS.pro,
      storage: createJSONStorage(() => AsyncStorage),
      // hasHydrated is runtime-only — don't serialize it. Persist both entitlement
      // sources so a promo grant unlocks instantly + offline on the next launch,
      // before the RC check or my_pro_status() round-trips resolve.
      partialize: (state) => ({
        isPro: state.isPro,
        rcPro: state.rcPro,
        serverPro: state.serverPro,
        purchasedAt: state.purchasedAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
