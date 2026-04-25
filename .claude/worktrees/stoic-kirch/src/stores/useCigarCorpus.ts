// Lazy corpus store — loads the full cigar list + builds the band-match index
// on first use (camera-tab focus). Subsequent focuses are no-ops until the
// store is explicitly invalidated.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InteractionManager } from 'react-native';
import { supabase } from '@/lib/supabase';
import { buildIndex, type CigarIndexEntry } from '@/src/features/identify/bandMatcher';
import type { Cigar } from '@/src/types/cigar';

// Run a CPU-bound rebuild after interactions so it doesn't jank the camera's
// first paint. Returns a promise that resolves with the new index.
function rebuildAfterInteractions(cigars: Cigar[]): Promise<CigarIndexEntry[]> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      resolve(buildIndex(cigars));
    });
  });
}

interface CorpusState {
  // Persisted raw cigars — rebuilt into a runtime index after hydration.
  cigars: Cigar[];
  // Runtime-only — not persisted (Set instances don't survive JSON).
  index: CigarIndexEntry[];
  loading: boolean;
  loadedAt: number | null;
  error: string | null;
  load: (opts?: { force?: boolean }) => Promise<void>;
  rebuildIndex: () => void;
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // re-fetch once a day if user keeps the app open

export const useCigarCorpus = create<CorpusState>()(
  persist(
    (set, get) => ({
      cigars: [],
      index: [],
      loading: false,
      loadedAt: null,
      error: null,
      rebuildIndex: () => {
        const { cigars, index } = get();
        if (cigars.length > 0 && index.length === 0) {
          rebuildAfterInteractions(cigars).then((idx) => set({ index: idx }));
        }
      },
      load: async (opts) => {
        const { loadedAt, loading, cigars, index } = get();
        if (loading) return;

        // If we have persisted cigars but haven't rebuilt the runtime index yet
        // (fresh launch after persist-hydration), rebuild post-interaction so the
        // first camera frame doesn't jank on a 500-row trigram build.
        if (cigars.length > 0 && index.length === 0) {
          const idx = await rebuildAfterInteractions(cigars);
          set({ index: idx });
        }

        if (
          !opts?.force &&
          loadedAt !== null &&
          Date.now() - loadedAt < STALE_AFTER_MS &&
          get().index.length > 0
        ) {
          return;
        }
        set({ loading: true, error: null });
        try {
          const pageSize = 1000;
          const all: Cigar[] = [];
          for (let offset = 0; ; offset += pageSize) {
            const { data, error } = await supabase
              .from('cigars')
              .select('id, brand, name, line, vitola, strength, body, price_tier, flavors, description, image_url')
              .range(offset, offset + pageSize - 1);
            if (error) throw error;
            const rows = (data ?? []) as Cigar[];
            all.push(...rows);
            if (rows.length < pageSize) break;
          }
          const freshIndex = await rebuildAfterInteractions(all);
          set({ cigars: all, index: freshIndex, loading: false, loadedAt: Date.now(), error: null });
        } catch (e: any) {
          // If the fetch failed but we have a persisted corpus, keep using it.
          const have = get().index.length > 0;
          set({
            loading: false,
            error: have ? null : (e?.message ?? 'Failed to load cigar corpus'),
          });
        }
      },
    }),
    {
      name: 'cigar-corpus',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist raw rows + timestamp. Runtime index (with Set instances) is rebuilt on hydrate.
      partialize: (s) => ({ cigars: s.cigars, loadedAt: s.loadedAt }),
    }
  )
);
