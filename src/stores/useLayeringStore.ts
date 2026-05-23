import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { isSupabaseConfigured } from '@/lib/supabase';
import { syncWrite, syncDelete } from '@/src/lib/sync/syncWrite';

export interface LayeringEntry {
  id: string;
  /** Canonical ordering: a_id < b_id alphabetically */
  fragrance_a_id: string;
  fragrance_b_id: string;
  note?: string | null;
  created_at: string;
  _unsynced?: boolean;
}

let _currentUserId: string | null = null;
export function setLayeringUserId(uid: string | null) { _currentUserId = uid; }

interface LayeringState {
  entries: LayeringEntry[];
  hydrate: (rows: LayeringEntry[]) => void;
  add: (a_id: string, b_id: string, note?: string) => string;
  remove: (id: string) => void;
  forFragrance: (fragrance_id: string) => LayeringEntry[];
}

export const useLayeringStore = create<LayeringState>()(
  persist(
    (set, get) => ({
      entries: [],

      hydrate: (rows) => set({ entries: rows }),

      add: (a_id, b_id, note) => {
        // Enforce canonical ordering
        const [fa, fb] = a_id < b_id ? [a_id, b_id] : [b_id, a_id];
        const id = Crypto.randomUUID();
        const entry: LayeringEntry = {
          id,
          fragrance_a_id: fa,
          fragrance_b_id: fb,
          note: note?.trim() || null,
          created_at: new Date().toISOString(),
        };
        set((s) => ({ entries: [entry, ...s.entries] }));
        if (isSupabaseConfigured && _currentUserId) {
          const { _unsynced: _, ...row } = entry;
          syncWrite('layering_entries', { ...row, user_id: _currentUserId }, 'id').then((r) => {
            if (!r.ok) set((s) => ({
              entries: s.entries.map((e) => e.id === id ? { ...e, _unsynced: true } : e),
            }));
          });
        }
        return id;
      },

      remove: (id) => {
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
        if (isSupabaseConfigured) syncDelete('layering_entries', id);
      },

      forFragrance: (fragrance_id) =>
        get().entries.filter(
          (e) => e.fragrance_a_id === fragrance_id || e.fragrance_b_id === fragrance_id,
        ),
    }),
    {
      name: 'perfumepicks-layering',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
);
