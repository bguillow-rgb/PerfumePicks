import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { isSupabaseConfigured } from '@/lib/supabase';
import { syncWrite, syncDelete } from '@/src/lib/sync/syncWrite';

export interface FragranceReview {
  id: string;
  fragrance_id: string;
  user_id: string;
  rating: number;          // 1-5
  title?: string | null;
  body?: string | null;
  verified_purchase?: boolean;
  helpful_count: number;
  created_at: string;
  updated_at: string;
  /** Local display name — not stored on server, pulled from profile */
  _display_name?: string;
  _unsynced?: boolean;
}

let _currentUserId: string | null = null;
let _displayName: string | null = null;
export function setReviewsUserId(uid: string | null, name?: string | null) {
  _currentUserId = uid;
  _displayName = name ?? null;
}

interface ReviewsState {
  /** All reviews authored by the current local user. */
  mine: FragranceReview[];
  /** Community reviews fetched from Supabase, keyed by fragrance_id. */
  community: Record<string, FragranceReview[]>;
  /** Local helpful-vote IDs (review_id). */
  helpfulVotes: string[];

  hydrateMine: (rows: FragranceReview[]) => void;
  setCommunity: (fragrance_id: string, rows: FragranceReview[]) => void;

  /** Upsert a review (create if no prior review for this fragrance, else update). */
  upsert: (input: { fragrance_id: string; rating: number; title?: string; body?: string }) => string;
  remove: (id: string) => void;

  /** Toggle helpful vote for a community review. */
  toggleHelpful: (reviewId: string) => void;

  forFragrance: (fragrance_id: string) => FragranceReview[];
  myReviewFor: (fragrance_id: string) => FragranceReview | null;
}

export const useReviewsStore = create<ReviewsState>()(
  persist(
    (set, get) => ({
      mine: [],
      community: {},
      helpfulVotes: [],

      hydrateMine: (rows) => set({ mine: rows }),
      setCommunity: (fragrance_id, rows) =>
        set((s) => ({ community: { ...s.community, [fragrance_id]: rows } })),

      upsert: ({ fragrance_id, rating, title, body }) => {
        const existing = get().mine.find((r) => r.fragrance_id === fragrance_id);
        const now = new Date().toISOString();
        if (existing) {
          const updated: FragranceReview = {
            ...existing,
            rating, title: title ?? null, body: body ?? null,
            updated_at: now,
          };
          set((s) => ({ mine: s.mine.map((r) => r.id === existing.id ? updated : r) }));
          if (isSupabaseConfigured && _currentUserId) {
            const { _unsynced: _, _display_name: __, ...row } = updated;
            syncWrite('fragrance_reviews', { ...row, user_id: _currentUserId }, 'id').then((res) => {
              if (!res.ok) set((s) => ({
                mine: s.mine.map((r) => r.id === existing.id ? { ...r, _unsynced: true } : r),
              }));
            });
          }
          return existing.id;
        }
        const id = Crypto.randomUUID();
        const review: FragranceReview = {
          id,
          fragrance_id,
          user_id: _currentUserId ?? 'local',
          rating,
          title: title ?? null,
          body: body ?? null,
          verified_purchase: false,
          helpful_count: 0,
          created_at: now,
          updated_at: now,
          _display_name: _displayName ?? undefined,
        };
        set((s) => ({ mine: [review, ...s.mine] }));
        if (isSupabaseConfigured && _currentUserId) {
          const { _unsynced: _, _display_name: __, ...row } = review;
          syncWrite('fragrance_reviews', { ...row, user_id: _currentUserId }, 'id').then((res) => {
            if (!res.ok) set((s) => ({
              mine: s.mine.map((r) => r.id === id ? { ...r, _unsynced: true } : r),
            }));
          });
        }
        return id;
      },

      remove: (id) => {
        set((s) => ({ mine: s.mine.filter((r) => r.id !== id) }));
        if (isSupabaseConfigured) syncDelete('fragrance_reviews', id);
      },

      toggleHelpful: (reviewId) => {
        const { helpfulVotes } = get();
        const voted = helpfulVotes.includes(reviewId);
        set((s) => ({
          helpfulVotes: voted
            ? s.helpfulVotes.filter((v) => v !== reviewId)
            : [...s.helpfulVotes, reviewId],
          // Optimistic count update in community cache
          community: Object.fromEntries(
            Object.entries(s.community).map(([fid, rows]) => [
              fid,
              rows.map((r) => r.id === reviewId
                ? { ...r, helpful_count: r.helpful_count + (voted ? -1 : 1) }
                : r),
            ]),
          ),
        }));
        // Server sync for helpful votes handled separately (no syncWrite needed — it's a join table)
      },

      forFragrance: (fragrance_id) => {
        const { mine, community } = get();
        const communityRows = community[fragrance_id] ?? [];
        // Merge: my review on top, then community (excluding any server copy of mine)
        const myReview = mine.find((r) => r.fragrance_id === fragrance_id);
        if (!myReview) return communityRows;
        const others = communityRows.filter((r) => r.user_id !== myReview.user_id);
        return [myReview, ...others];
      },

      myReviewFor: (fragrance_id) =>
        get().mine.find((r) => r.fragrance_id === fragrance_id) ?? null,
    }),
    {
      name: STORAGE_KEYS.reviews,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ mine: s.mine, helpfulVotes: s.helpfulVotes }),
    },
  ),
);
