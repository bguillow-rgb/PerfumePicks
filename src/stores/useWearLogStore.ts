import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  created_at: string;
}

interface WearLogState {
  logs: WearLog[];
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

function clientId(): string {
  return `wl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useWearLogStore = create<WearLogState>()(
  persist(
    (set, get) => ({
      logs: [],
      add: (input) => {
        const id = clientId();
        const log: WearLog = { ...input, id, created_at: new Date().toISOString() };
        set((s) => ({ logs: [log, ...s.logs] }));
        return id;
      },
      update: (id, patch) =>
        set((s) => ({
          logs: s.logs.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),
      remove: (id) =>
        set((s) => ({ logs: s.logs.filter((l) => l.id !== id) })),
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
