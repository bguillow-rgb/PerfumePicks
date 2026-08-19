import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { isSupabaseConfigured } from '@/lib/supabase';
import { syncWrite, syncDelete } from '@/src/lib/sync/syncWrite';
import { scheduleLivingDnaRecompute } from '@/src/lib/sync/recomputeScheduler';
import { FREE_WARDROBE_CAP } from '@/src/lib/limits';
import { useProStore } from '@/src/stores/useProStore';
import { cancelAddBottlesNotification } from '@/src/lib/notifications';
import { dnaTrackEvent } from '@/src/lib/dna';

/**
 * Sentinel returned by `add()` when the free-tier wardrobe cap is reached.
 * Callers check `result === WARDROBE_CAP_HIT` to route to the paywall.
 */
export const WARDROBE_CAP_HIT: null = null;

/**
 * Local wardrobe store — the user's fragrance collection.
 *
 * Persisted to AsyncStorage so items survive app restarts.
 * When Supabase is configured, add/update/remove also write through to
 * `wardrobe_items`. On write failure the local change is kept and the row
 * is marked `_unsynced: true`; a retry banner can surface this.
 */

// 'empty' is a transition state (a bottle finished — remaining_ml hits 0), NOT
// a creation choice. The DB CHECK constraint already accepts it (migration
// 202605220011), so prod rows can carry it — the type MUST include it so the
// app can safely hydrate those rows. It is intentionally absent from the
// add-to-wardrobe picker; users don't "add" an empty bottle.
export type WardrobeStatus = 'have' | 'want' | 'tested' | 'sold_on' | 'empty';
export type UnitType = 'bottle' | 'decant' | 'sample';

export interface WardrobeItem {
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
  /** Local-only flag: true when the last Supabase write failed. Not sent to DB. */
  _unsynced?: boolean;
}

// user_id is set at write time from the auth session, not stored in the item.
let _currentUserId: string | null = null;
export function setWardrobeUserId(uid: string | null) { _currentUserId = uid; }

interface WardrobeState {
  items: WardrobeItem[];
  /** Hydrate from Supabase on sign-in; call with [] on sign-out. */
  hydrate: (rows: WardrobeItem[]) => void;
  /**
   * Add a new wardrobe item; returns the new id, or null if the free-tier cap
   * is reached. Pass `{ bypassCap: true }` for system-driven adds (e.g. owned
   * bottles confirmed during the DNA flow) that shouldn't count against the cap.
   */
  add: (
    input: Omit<WardrobeItem, 'id' | 'created_at' | 'updated_at' | '_unsynced'>,
    opts?: { bypassCap?: boolean },
  ) => string | null;
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
  /** Count of items that failed their last Supabase write. */
  unsyncedCount: () => number;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const useWardrobeStore = create<WardrobeState>()(
  persist(
    (set, get) => ({
      items: [],

      hydrate: (rows) => set({ items: rows }),

      add: (input, opts) => {
        // Deduplicate: if this fragrance is already in the wardrobe, update
        // the existing entry rather than creating a duplicate row.
        const existing = get().items.find((i) => i.fragrance_id === input.fragrance_id);
        if (!existing && !opts?.bypassCap) {
          // Free-tier cap: non-Pro users cannot exceed FREE_WARDROBE_CAP items.
          const isPro = useProStore.getState().isPro;
          if (!isPro && get().items.length >= FREE_WARDROBE_CAP) return null;
        }
        if (existing) {
          // DNA layer dual-emission (M1): a re-add that changes status is a
          // status_change; a metadata-only re-add carries no taste signal and
          // emits nothing. This store is the single choke point every add path
          // hits (AddToWardrobeSheet, detail page, edit sheet).
          if (input.status !== existing.status) {
            dnaTrackEvent('item_collection_updated', {
              entity_id: input.fragrance_id,
              action: 'status_change',
              status: input.status,
            });
          }
          const updated = { ...existing, ...input, updated_at: nowIso(), _unsynced: false };
          set((s) => ({
            items: s.items.map((i) => i.id === existing.id ? updated : i),
          }));
          if (isSupabaseConfigured && _currentUserId) {
            const { _unsynced: _, ...row } = updated;
            syncWrite('wardrobe_items', { ...row, user_id: _currentUserId }, 'id').then((r) => {
              if (!r.ok) set((s) => ({
                items: s.items.map((i) => i.id === existing.id ? { ...i, _unsynced: true } : i),
              }));
            });
          }
          scheduleLivingDnaRecompute('wardrobe');
          return existing.id;
        }

        const id = Crypto.randomUUID();
        // If we can't write to Supabase right now, pre-mark as _unsynced so the
        // item is preserved in the hydration merge on the next sign-in.
        const canSync = isSupabaseConfigured && !!_currentUserId;
        const item: WardrobeItem = { ...input, id, created_at: nowIso(), updated_at: nowIso(), _unsynced: !canSync };
        set((s) => ({ items: [item, ...s.items] }));
        // DNA layer dual-emission (M1): a genuinely new wardrobe item.
        dnaTrackEvent('item_collection_updated', {
          entity_id: input.fragrance_id,
          action: 'add',
          status: input.status,
        });
        // Cancel the "add your bottles" nudge — user has added their first item.
        cancelAddBottlesNotification().catch(() => {});

        if (canSync) {
          const { _unsynced: _, ...row } = item;
          syncWrite('wardrobe_items', { ...row, user_id: _currentUserId! }, 'id').then((r) => {
            if (!r.ok) set((s) => ({
              items: s.items.map((i) => i.id === id ? { ...i, _unsynced: true } : i),
            }));
            else set((s) => ({
              items: s.items.map((i) => i.id === id ? { ...i, _unsynced: false } : i),
            }));
          });
        }
        scheduleLivingDnaRecompute('wardrobe');
        return id;
      },

      update: (id, patch) => {
        // DNA layer dual-emission (M1): only a status transition is a taste
        // signal — mL/price/notes edits emit nothing. Read the pre-patch row
        // for the fragrance slug + old status before the set() below.
        const prev = get().items.find((i) => i.id === id);
        if (prev && patch.status && patch.status !== prev.status) {
          dnaTrackEvent('item_collection_updated', {
            entity_id: prev.fragrance_id,
            action: 'status_change',
            status: patch.status,
          });
        }
        const updated_at = nowIso();
        set((s) => ({
          items: s.items.map((i) => i.id === id ? { ...i, ...patch, updated_at } : i),
        }));
        if (isSupabaseConfigured && _currentUserId) {
          // Upsert the FULL merged row, never a partial patch: syncWrite is an
          // INSERT ... ON CONFLICT upsert, and Postgres validates NOT NULL
          // constraints on the proposed insert tuple BEFORE conflict resolution
          // — a patch without fragrance_id throws 23502 even when the row
          // already exists, so partial-patch edits never reached the server.
          const merged = get().items.find((i) => i.id === id);
          if (merged) {
            const { _unsynced: _, ...row } = merged;
            syncWrite('wardrobe_items', { ...row, user_id: _currentUserId }, 'id').then((r) => {
              set((s) => ({
                items: s.items.map((i) => i.id === id ? { ...i, _unsynced: !r.ok } : i),
              }));
            });
          }
        }
        scheduleLivingDnaRecompute('wardrobe');
      },

      remove: (id) => {
        // DNA layer dual-emission (M1): capture the row before it's gone —
        // the payload needs the fragrance slug + the status it left at.
        const removed = get().items.find((i) => i.id === id);
        if (removed) {
          dnaTrackEvent('item_collection_updated', {
            entity_id: removed.fragrance_id,
            action: 'remove',
            status: removed.status,
          });
        }
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
        if (isSupabaseConfigured) {
          syncDelete('wardrobe_items', id);
        }
        scheduleLivingDnaRecompute('wardrobe');
      },

      getByFragrance: (fragrance_id) =>
        get().items.find((i) => i.fragrance_id === fragrance_id),

      inRotation: () => get().items.filter((i) => i.status === 'have'),

      runningLow: () =>
        get().items.filter(
          (i) => i.status === 'have' && i.size_ml > 0 && i.remaining_ml / i.size_ml < 0.2,
        ),

      unsyncedCount: () => get().items.filter((i) => i._unsynced).length,
    }),
    {
      name: STORAGE_KEYS.wardrobe,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);
