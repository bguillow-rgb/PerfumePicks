import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncWrite, notifySyncFailure } from '@/src/lib/sync/syncWrite';
import { FREE_LIMITS } from '@/src/lib/limits';
import { useProStore } from '@/src/stores/useProStore';

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
  /** Stable client id (uuid v4 — same id used locally and on the server). */
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
  /**
   * True when the row hasn't successfully sync'd to Supabase yet.
   * Set by `add`/`update`/`remove` on a failed `syncWrite`. The next
   * foreground or sign-in should surface these in a retry banner
   * (deferred — see M1 plan, Failure Policy section).
   */
  _unsynced?: boolean;
}

/**
 * Sentinel returned by `add()` when the free-tier wardrobe cap is hit.
 * Callers (AddToWardrobeSheet, fragrance detail) check for this and
 * route to the paywall instead of treating it as success.
 */
export const WARDROBE_CAP_HIT = '__cap_hit__' as const;

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
  /**
   * Add a new wardrobe item; returns the new id, OR the literal
   * WARDROBE_CAP_HIT sentinel when a free user has reached FREE_LIMITS.wardrobeItems.
   * Updates to existing rows are NOT counted against the cap (so users
   * can still re-status / edit). Caller MUST check the return value.
   */
  add: (input: Omit<WardrobeItem, 'id' | 'created_at' | 'updated_at'>) => string | typeof WARDROBE_CAP_HIT;
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

/**
 * Generate a uuid v4 client-side so a locally-created row carries the same
 * id all the way to Supabase. Without this, the server regenerates the id
 * and the client cache and the server row drift apart.
 *
 * Standalone implementation — avoids pulling a `uuid` dep just for this.
 * `crypto.randomUUID()` is available in Hermes / modern RN. Falls back to a
 * Math.random based v4 if not.
 */
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
        // Free-tier cap. Pro is unlimited. Server-side enforcement lives in
        // a separate RLS policy that checks `is_pro_user(auth.uid())` — see
        // migration `20260515_pro_gate_server_side.sql`.
        const isPro = useProStore.getState().isPro;
        const existing = get().items.find((i) => i.fragrance_id === input.fragrance_id);
        if (!isPro && !existing && get().items.length >= FREE_LIMITS.wardrobeItems) {
          return WARDROBE_CAP_HIT;
        }
        // Deduplicate: if this fragrance is already in the wardrobe, update
        // the existing entry rather than creating a duplicate row.
        if (existing) {
          const patch = { ...input, updated_at: nowIso() };
          set((s) => ({
            items: s.items.map((i) => (i.id === existing.id ? { ...i, ...patch } : i)),
          }));
          // Fire-and-forget server sync; mark _unsynced + toast on failure.
          syncWrite({ op: 'update', table: 'wardrobe_items', id: existing.id, patch }).then(
            (r) => {
              if (!r.ok) {
                set((s) => ({
                  items: s.items.map((i) =>
                    i.id === existing.id ? { ...i, _unsynced: true } : i,
                  ),
                }));
                notifySyncFailure('Wardrobe update', r.error);
              }
            },
          );
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
        // Server sync — server side needs user_id from auth.uid() in RLS
        // so we don't pass it explicitly; the auth header on the supabase
        // client is the source of identity. The migration's column default
        // (`auth.uid()`) populates the row.
        syncWrite({ op: 'insert', table: 'wardrobe_items', row: item }).then((r) => {
          if (!r.ok) {
            set((s) => ({
              items: s.items.map((i) => (i.id === id ? { ...i, _unsynced: true } : i)),
            }));
            notifySyncFailure('Wardrobe item', r.error);
          }
        });
        return id;
      },
      update: (id, patch) => {
        const merged = { ...patch, updated_at: nowIso() };
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, ...merged } : i)),
        }));
        syncWrite({ op: 'update', table: 'wardrobe_items', id, patch: merged }).then((r) => {
          if (!r.ok) {
            set((s) => ({
              items: s.items.map((i) => (i.id === id ? { ...i, _unsynced: true } : i)),
            }));
            notifySyncFailure('Wardrobe update', r.error);
          }
        });
      },
      remove: (id) => {
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
        syncWrite({ op: 'delete', table: 'wardrobe_items', id }).then((r) => {
          if (!r.ok) {
            // We've already deleted locally; without an offline queue, the
            // best we can do is tell the user and log. The next hydrate from
            // server will resurrect the row if the delete never landed.
            notifySyncFailure('Wardrobe delete', r.error);
          }
        });
      },
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
