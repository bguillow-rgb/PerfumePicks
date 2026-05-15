import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncWrite, notifySyncFailure } from '@/src/lib/sync/syncWrite';

/**
 * Persisted swipe history from "Train My Nose".
 *
 * Mirrors the v1 schema's `swipe_feedback` table. Each row is the user's
 * latest decision on a single fragrance — a re-swipe overwrites the prior
 * action so the taste profile reflects the user's CURRENT preference, not
 * a pile of contradictory historical signals.
 */

export type SwipeAction = 'love' | 'like' | 'dislike' | 'skip';

export interface SwipeRecord {
  fragrance_id: string;
  action: SwipeAction;
  created_at: string;
}

/** Free tier daily swipe cap. */
export const FREE_DAILY_SWIPE_LIMIT = 10;

interface SwipeState {
  /** Map fragrance_id → latest swipe (so re-swipes replace cleanly). */
  swipes: Record<string, SwipeRecord>;
  /** Number of swipes recorded today (resets on date change). */
  dailySwipeCount: number;
  /** ISO local date "YYYY-MM-DD" of the last swipe — used to detect day rollover. */
  dailySwipeDate: string;
  /** Has this store been hydrated from the server in this session? */
  hydrated: boolean;
  /**
   * Replace the local swipes map wholesale with rows from Supabase.
   * Accepts the array shape `useAppSync` fetches from `swipe_feedback`
   * (selecting fragrance_id, action, created_at). We re-key into a Record
   * so re-swipes still overwrite correctly.
   */
  hydrate: (rows: SwipeRecord[]) => void;
  record: (fragrance_id: string, action: SwipeAction) => void;
  clear: () => void;
  /** All swipes as an array, newest first. */
  list: () => SwipeRecord[];
  /** Fragrance ids the user loved OR liked (for quick filters). */
  likedIds: () => string[];
  /** Fragrance ids the user loved (right swipe only). */
  lovedIds: () => string[];
  dislikedIds: () => string[];
}

export const useSwipeStore = create<SwipeState>()(
  persist(
    (set, get) => ({
      swipes: {},
      dailySwipeCount: 0,
      dailySwipeDate: '',
      hydrated: false,
      hydrate: (rows) => {
        // Re-key the array into the Record<fragrance_id, SwipeRecord> shape
        // the store uses internally. If the server has multiple rows for the
        // same fragrance (shouldn't happen given the upsert pattern in
        // Phase A write-through, but defensive), keep the newest by
        // created_at.
        const swipes: Record<string, SwipeRecord> = {};
        for (const r of rows) {
          const existing = swipes[r.fragrance_id];
          if (!existing || r.created_at > existing.created_at) {
            swipes[r.fragrance_id] = r;
          }
        }
        set({ swipes, hydrated: true });
      },
      record: (fragrance_id, action) => {
        const today = new Date().toLocaleDateString('en-CA');
        const created_at = new Date().toISOString();
        set((s) => {
          const isNewDay = s.dailySwipeDate !== today;
          return {
            swipes: {
              ...s.swipes,
              [fragrance_id]: { fragrance_id, action, created_at },
            },
            dailySwipeCount: isNewDay ? 1 : s.dailySwipeCount + 1,
            dailySwipeDate: today,
          };
        });
        // Upsert against `swipe_feedback` keyed on (user_id, fragrance_id).
        // Re-swipes overwrite the prior action server-side, mirroring the
        // local-only behavior. Server-side `user_id` comes from auth.uid()
        // via the column default + RLS.
        syncWrite({
          op: 'upsert',
          table: 'swipe_feedback',
          row: { fragrance_id, action, created_at },
          onConflict: 'user_id,fragrance_id',
        }).then((r) => {
          if (!r.ok) notifySyncFailure('Swipe', r.error);
        });
      },
      clear: () => set({ swipes: {}, dailySwipeCount: 0, dailySwipeDate: '' }),
      list: () =>
        Object.values(get().swipes).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      likedIds: () =>
        Object.values(get().swipes)
          .filter((s) => s.action === 'love' || s.action === 'like')
          .map((s) => s.fragrance_id),
      lovedIds: () =>
        Object.values(get().swipes).filter((s) => s.action === 'love').map((s) => s.fragrance_id),
      dislikedIds: () =>
        Object.values(get().swipes).filter((s) => s.action === 'dislike').map((s) => s.fragrance_id),
    }),
    {
      name: STORAGE_KEYS.swipes,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        swipes: s.swipes,
        dailySwipeCount: s.dailySwipeCount,
        dailySwipeDate: s.dailySwipeDate,
      }),
    },
  ),
);
