import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncWrite, notifySyncFailure } from '@/src/lib/sync/syncWrite';
import { checkAndAwardBadges } from '@/src/lib/badges';

/**
 * Local wear-log store. Persisted to AsyncStorage. Mirrors the v1 schema's
 * `wear_logs` table (supabase/migrations/001_initial_schema.sql) so the
 * mock-to-Supabase migration is a 1:1 field mapping.
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
  is_public?: boolean;
  created_at: string;
  /** See useWardrobeStore.WardrobeItem._unsynced. */
  _unsynced?: boolean;
}

interface WearLogState {
  logs: WearLog[];
  /**
   * Has this store been hydrated from the server in this session?
   * Same semantics as `useWardrobeStore.hydrated` — UIs should check this
   * before showing empty-state copy on a freshly-signed-in user.
   */
  hydrated: boolean;
  /** Replace the local list wholesale with rows from Supabase. */
  hydrate: (rows: WearLog[]) => void;
  add: (input: Omit<WearLog, 'id' | 'created_at'>) => string;
  /** Patch an existing wear log entry (partial update). */
  update: (id: string, patch: Partial<Omit<WearLog, 'id' | 'fragrance_id' | 'created_at'>>) => void;
  remove: (id: string) => void;
  /** All logs for one fragrance, newest first. */
  forFragrance: (fragrance_id: string) => WearLog[];
  /** All logs across all fragrances, newest first. */
  recent: (limit?: number) => WearLog[];
  /** Aggregate map: fragrance_id -> count, for "most-worn" rollups. */
  countByFragrance: () => Record<string, number>;
}

/** uuid v4 generator; see useWardrobeStore.clientId for rationale. */
function clientId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const useWearLogStore = create<WearLogState>()(
  persist(
    (set, get) => ({
      logs: [],
      hydrated: false,
      hydrate: (rows) => set({ logs: rows, hydrated: true }),
      add: (input) => {
        const id = clientId();
        const log: WearLog = { ...input, id, created_at: new Date().toISOString() };
        set((s) => ({ logs: [log, ...s.logs] }));
        syncWrite({ op: 'insert', table: 'wear_logs', row: log }).then((r) => {
          if (!r.ok) {
            set((s) => ({
              logs: s.logs.map((l) => (l.id === id ? { ...l, _unsynced: true } : l)),
            }));
            notifySyncFailure('Wear log', r.error);
          }
        });
        return id;
      },
      update: (id, patch) => {
        set((s) => ({
          logs: s.logs.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        }));
        syncWrite({ op: 'update', table: 'wear_logs', id, patch }).then((r) => {
          if (!r.ok) {
            set((s) => ({
              logs: s.logs.map((l) => (l.id === id ? { ...l, _unsynced: true } : l)),
            }));
            notifySyncFailure('Wear log update', r.error);
          }
        });
      },
      remove: (id) => {
        set((s) => ({ logs: s.logs.filter((l) => l.id !== id) }));
        syncWrite({ op: 'delete', table: 'wear_logs', id }).then((r) => {
          if (!r.ok) notifySyncFailure('Wear log delete', r.error);
        });
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
    }),
    {
      name: STORAGE_KEYS.wearLog,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ logs: s.logs }),
    },
  ),
);
