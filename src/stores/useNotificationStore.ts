import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/src/lib/storageKeys';

export type PermissionStatus = 'undetermined' | 'granted' | 'denied';

interface NotificationState {
  /** iOS permission status — persisted so we don't re-prompt after grant/deny. */
  permissionStatus: PermissionStatus;
  /** Whether the custom in-app prompt has been shown once. */
  onboardingPromptShown: boolean;
  /** User toggle: daily 8am Scent of the Day notification. */
  sotdEnabled: boolean;
  /** User toggle: one-time 48h add-bottles reminder. */
  addBottlesEnabled: boolean;
  /** Expo notification identifier for the scheduled SOTD job (null = not scheduled). */
  sotdScheduledId: string | null;
  /** Expo notification identifier for the add-bottles one-shot (null = fired or cancelled). */
  addBottlesScheduledId: string | null;

  setPermissionStatus: (status: PermissionStatus) => void;
  setOnboardingPromptShown: () => void;
  setSotdEnabled: (enabled: boolean) => void;
  setAddBottlesEnabled: (enabled: boolean) => void;
  setSotdScheduledId: (id: string | null) => void;
  setAddBottlesScheduledId: (id: string | null) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      permissionStatus: 'undetermined',
      onboardingPromptShown: false,
      sotdEnabled: true,
      addBottlesEnabled: true,
      sotdScheduledId: null,
      addBottlesScheduledId: null,

      setPermissionStatus: (status) => set({ permissionStatus: status }),
      setOnboardingPromptShown: () => set({ onboardingPromptShown: true }),
      setSotdEnabled: (enabled) => set({ sotdEnabled: enabled }),
      setAddBottlesEnabled: (enabled) => set({ addBottlesEnabled: enabled }),
      setSotdScheduledId: (id) => set({ sotdScheduledId: id }),
      setAddBottlesScheduledId: (id) => set({ addBottlesScheduledId: id }),
    }),
    {
      name: STORAGE_KEYS.notifications,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
