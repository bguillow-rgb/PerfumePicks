import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Profile state that lives BEFORE the user has a real account — photo URI,
 * display name, monogram. Persisted to AsyncStorage so the avatar doesn't
 * reset between launches.
 *
 * When Supabase auth is wired up later, sync these fields to the user row
 * and use this store as a local cache. For now it's the source of truth.
 */
interface ProfileState {
  photoUri: string | null;
  displayName: string;
  /** True once the "back up your wardrobe" upsell has been shown to a guest. */
  hasSeenSyncUpsell: boolean;
  setPhotoUri: (uri: string | null) => void;
  setDisplayName: (name: string) => void;
  markSyncUpsellSeen: () => void;
  /** Returns the 1-char monogram derived from displayName (or "?" fallback). */
  getMonogram: () => string;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      photoUri: null,
      displayName: '',
      hasSeenSyncUpsell: false,
      setPhotoUri: (uri) => set({ photoUri: uri }),
      setDisplayName: (name) => set({ displayName: name }),
      markSyncUpsellSeen: () => set({ hasSeenSyncUpsell: true }),
      getMonogram: () => {
        const name = get().displayName.trim();
        return name.length > 0 ? name[0].toUpperCase() : '?';
      },
    }),
    {
      name: STORAGE_KEYS.profile,
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist serializable fields.
      partialize: (s) => ({ photoUri: s.photoUri, displayName: s.displayName, hasSeenSyncUpsell: s.hasSeenSyncUpsell }),
    },
  ),
);
