import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { isSupabaseConfigured } from '@/lib/supabase';
import { syncWrite, syncDelete } from '@/src/lib/sync/syncWrite';
import { scheduleLivingDnaRecompute } from '@/src/lib/sync/recomputeScheduler';

/**
 * Wear-log store. Persisted to AsyncStorage; writes through to `wear_logs`
 * when Supabase is configured and a user is signed in.
 */

export type Occasion =
  | 'office' | 'date' | 'casual' | 'evening' | 'formal' | 'workout' | 'travel';

export type Weather =
  | 'hot-humid' | 'hot-dry' | 'warm' | 'cool' | 'cold' | 'rainy';

export interface WearLog {
  id: string;
  fragrance_id: string;
  worn_on: string;            // ISO yyyy-mm-dd
  occasion?: Occasion | null;
  weather?: Weather | null;
  rating?: number | null;     // 0..5
  would_wear_again?: boolean | null;
  note?: string | null;
  is_public?: boolean;        // share to SOTD feed — default false
  created_at: string;
  _unsynced?: boolean;
}

let _currentUserId: string | null = null;
export function setWearLogUserId(uid: string | null) { _currentUserId = uid; }

interface WearLogState {
  logs: WearLog[];
  /** Hydrate from Supabase on sign-in; call with [] on sign-out. */
  hydrate: (rows: WearLog[]) => void;
  add: (input: Omit<WearLog, 'id' | 'created_at' | '_unsynced'>) => string;
  update: (id: string, patch: Partial<Omit<WearLog, 'id' | 'fragrance_id' | 'created_at'>>) => void;
  remove: (id: string) => void;
  /** All logs for one fragrance, newest first. */
  forFragrance: (fragrance_id: string) => WearLog[];
  /** All logs across all fragrances, newest first. */
  recent: (limit?: number) => WearLog[];
  /** Aggregate map: fragrance_id -> count, for "most-worn" rollups. */
  countByFragrance: () => Record<string, number>;
  unsyncedCount: () => number;
}

export const useWearLogStore = create<WearLogState>()(
  persist(
    (set, get) => ({
      logs: [],

      hydrate: (rows) => set({ logs: rows }),

      add: (input) => {
        const id = Crypto.randomUUID();
        // Default _unsynced: true so hydrateWearLogs preserves this log even
        // if the Supabase write hasn't happened yet (user not signed in, or
        // write fails due to FK/RLS on a non-wardrobe fragrance).
        const log: WearLog = { ...input, id, created_at: new Date().toISOString(), _unsynced: true };
        set((s) => ({ logs: [log, ...s.logs] }));
        if (isSupabaseConfigured && _currentUserId) {
          const { _unsynced: _, ...row } = log;
          syncWrite('wear_logs', { ...row, user_id: _currentUserId }, 'id').then((r) => {
            // Clear _unsynced flag only on success; leave it on failure so
            // hydrateWearLogs can preserve it across restarts.
            set((s) => ({
              logs: s.logs.map((l) => l.id === id ? { ...l, _unsynced: !r.ok } : l),
            }));
          });
        }
        scheduleLivingDnaRecompute('wear');
        return id;
      },

      update: (id, patch) => {
        set((s) => ({
          logs: s.logs.map((l) => l.id === id ? { ...l, ...patch } : l),
        }));
        if (isSupabaseConfigured && _currentUserId) {
          // Upsert the FULL merged row, never a partial patch — Postgres checks
          // NOT NULL constraints on the proposed insert tuple before ON CONFLICT
          // resolution, so a patch missing fragrance_id/worn_on throws 23502
          // even when the row already exists (same bug as useWardrobeStore).
          const merged = get().logs.find((l) => l.id === id);
          if (merged) {
            const { _unsynced: _, ...row } = merged;
            syncWrite('wear_logs', { ...row, user_id: _currentUserId }, 'id').then((r) => {
              set((s) => ({
                logs: s.logs.map((l) => l.id === id ? { ...l, _unsynced: !r.ok } : l),
              }));
            });
          }
        }
        scheduleLivingDnaRecompute('wear');
      },

      remove: (id) => {
        set((s) => ({ logs: s.logs.filter((l) => l.id !== id) }));
        if (isSupabaseConfigured) {
          syncDelete('wear_logs', id);
        }
      },

      forFragrance: (fragrance_id) =>
        get().logs
          .filter((l) => l.fragrance_id === fragrance_id)
          .sort((a, b) => b.worn_on.localeCompare(a.worn_on)),

      recent: (limit = 20) =>
        [...get().logs]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, limit),

      countByFragrance: () => {
        const out: Record<string, number> = {};
        for (const l of get().logs) {
          out[l.fragrance_id] = (out[l.fragrance_id] ?? 0) + 1;
        }
        return out;
      },

      unsyncedCount: () => get().logs.filter((l) => l._unsynced).length,
    }),
    {
      name: STORAGE_KEYS.wearLog,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ logs: s.logs }),
    },
  ),
);
