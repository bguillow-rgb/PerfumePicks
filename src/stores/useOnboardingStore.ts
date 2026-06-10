import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/src/lib/storageKeys';

/**
 * Tracks whether the first-run onboarding overlay has been shown. Persisted so
 * the tap-through intro only appears once per install. `hydrated` lets the UI
 * wait for AsyncStorage before deciding whether to show the overlay (avoids a
 * flash on launch for returning users).
 */
interface OnboardingState {
  hasSeenOnboarding: boolean;
  hydrated: boolean;
  complete: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasSeenOnboarding: false,
      hydrated: false,
      complete: () => set({ hasSeenOnboarding: true }),
    }),
    {
      name: STORAGE_KEYS.onboarding,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ hasSeenOnboarding: s.hasSeenOnboarding }),
      onRehydrateStorage: () => (state) => { state && (state.hydrated = true); },
    },
  ),
);
