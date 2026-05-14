import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local wardrobe store — the user's fragrance collection.
 *
 * Persisted to AsyncStorage so items survive app restarts even before
 * Supabase is wired in. When Supabase auth lands, this becomes the local
 * cache and a hook syncs it with `wardrobe_items` table on auth.
 *
 * Mirrors the v1 schema (supabase/migrations/001_initial_schema.sql →
 * `wardrobe_items` table) so the migration to a real backend is mechanical.
 */

export type WardrobeStatus = 'have' | 'want' | 'tested' | 'sold_on';
export type UnitType = 'bottle' | 'decant' | 'sample';

export interface WardrobeItem {
  /** Stable client id (uuid-style — no need for true uuid in demo). */
  id: string;
  fragrance_id: string;
  status: WardrobeStatus;
  unit_type: UnitType;
  size_ml: number;
  remaining_ml: number;
  reorder_threshold_ml?: number | null;
  purchase_price_cents?: number | null;
  purchase_date?: string | null;     // ISO yyyy-mm-dd
  notes?: string | null;
  created_at: string;                // ISO timestamp
  updated_at: string;
}

interface WardrobeState {
  items: WardrobeItem[];
  /**
   * Has this store been hydrated from the server in this session?
   * False before sign-in completes, true after `hydrate()` runs.
   * UIs that show "empty wardrobe" empty states should check this so
   * a freshly-signed-in user doesn't see "empty" for the half-second
   * before hydration completes.
   */
  hydrated: boolean;
  /**
   * Replace the local list wholesale with rows from Supabase.
   * Called by `useAppSync` after sign-in or on sign-out (with []).
   */
  hydrate: (rows: WardrobeItem[]) => void;
  /** Add a new wardrobe item; returns the new id. */
  add: (input: Omit<WardrobeItem, 'id' | 'created_at' | 'updated_at'>) => string;
  /** Patch an existing item (partial update). */
  update: (id: string, patch: Partial<WardrobeItem>) => void;
  /** Remove an item. */
  remove: (id: string) => void;
  /** Look up the FIRST item for a given fragrance, or undefined. */
  getByFragrance: (fragrance_id: string) => WardrobeItem | undefined;
  /** Convenience: every item the user "has" (excludes want/tested/sold_on). */
  inRotation: () => WardrobeItem[];
  /** Convenience: every item that's running low (<20% remaining). */
  runningLow: () => WardrobeItem[];
}

function clientId(): string {
  // Good enough for local; Supabase generates real uuids server-side later.
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const useWardrobeStore = create<WardrobeState>()(
  persist(
    (set, get) => ({
      items: [],
      hydrated: false,
      hydrate: (rows) => set({ items: rows, hydrated: true }),
      add: (input) => {
        // Deduplicate: if this fragrance is already in the wardrobe, update
        // the existing entry rather than creating a duplicate row.
        const existing = get().items.find((i) => i.fragrance_id === input.fragrance_id);
        if (existing) {
          set((s) => ({
            items: s.items.map((i) =>
              i.id === existing.id ? { ...i, ...input, updated_at: nowIso() } : i
            ),
          }));
          return existing.id;
        }
        const id = clientId();
        const item: WardrobeItem = {
          ...input,
          id,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        set((s) => ({ items: [item, ...s.items] }));
        return id;
      },
      update: (id, patch) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, ...patch, updated_at: nowIso() } : i)),
        })),
      remove: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      getByFragrance: (fragrance_id) =>
        get().items.find((i) => i.fragrance_id === fragrance_id),
      inRotation: () => get().items.filter((i) => i.status === 'have'),
      runningLow: () =>
        get().items.filter(
          (i) =>
            i.status === 'have' &&
            i.size_ml > 0 &&
            i.remaining_ml / i.size_ml < 0.2,
        ),
    }),
    {
      name: STORAGE_KEYS.wardrobe,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);
