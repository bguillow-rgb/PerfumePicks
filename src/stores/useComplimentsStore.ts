import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { isSupabaseConfigured } from '@/lib/supabase';
import { syncWrite } from '@/src/lib/sync/syncWrite';

export interface ComplimentEntry {
  id: string;
  fragrance_id: string;
  context?: string | null;  // e.g. "work", "date", "gym"
  created_at: string;
  _unsynced?: boolean;
}

let _currentUserId: string | null = null;
export function setComplimentsUserId(uid: string | null) { _currentUserId = uid; }

interface ComplimentsState {
  entries: ComplimentEntry[];
  hydrate: (rows: ComplimentEntry[]) => void;
  add: (fragrance_id: string, context?: string) => string;
  forFragrance: (fragrance_id: string) => ComplimentEntry[];
  totalFor: (fragrance_id: string) => number;
}

export const useComplimentsStore = create<ComplimentsState>()(
  persist(
    (set, get) => ({
      entries: [],

      hydrate: (rows) => set({ entries: rows }),

      add: (fragrance_id, context) => {
        const id = Crypto.randomUUID();
        const entry: ComplimentEntry = {
          id, fragrance_id,
          context: context?.trim() || null,
          created_at: new Date().toISOString(),
        };
        set((s) => ({ entries: [entry, ...s.entries] }));
        if (isSupabaseConfigured && _currentUserId) {
          const { _unsynced: _, ...row } = entry;
          syncWrite('compliments_log', { ...row, user_id: _currentUserId }, 'id').then((r) => {
            if (!r.ok) set((s) => ({
              entries: s.entries.map((e) => e.id === id ? { ...e, _unsynced: true } : e),
            }));
          });
        }
        return id;
      },

      forFragrance: (fragrance_id) =>
        get().entries.filter((e) => e.fragrance_id === fragrance_id),

      totalFor: (fragrance_id) =>
        get().entries.filter((e) => e.fragrance_id === fragrance_id).length,
    }),
    {
      name: 'perfumepicks-compliments',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
);
