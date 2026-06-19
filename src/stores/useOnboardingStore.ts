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
  /**
   * True while an already-onboarded user is re-running the DNA front door (a
   * "retake"). Lets the route guard permit re-entry into `/dna` even though
   * onboarding is complete. Deliberately NOT persisted — a retake never
   * survives a relaunch; an abandoned retake must not trap the user in `/dna`.
   */
  retakeMode: boolean;
  complete: () => void;
  startRetake: () => void;
  endRetake: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasSeenOnboarding: false,
      hydrated: false,
      retakeMode: false,
      complete: () => set({ hasSeenOnboarding: true }),
      startRetake: () => set({ retakeMode: true }),
      endRetake: () => set({ retakeMode: false }),
    }),
    {
      name: STORAGE_KEYS.onboarding,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ hasSeenOnboarding: s.hasSeenOnboarding }),
      onRehydrateStorage: () => (state) => { state && (state.hydrated = true); },
    },
  ),
);
