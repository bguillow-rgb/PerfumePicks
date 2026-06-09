import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface SOTDEntry {
  id: string;
  user_id: string;
  fragrance_id: string;
  worn_on: string;
  occasion: string | null;
  weather: string | null;
  note: string | null;
  rating: number | null;
  reaction_count: number;
  created_at: string;
  profiles?: { display_name: string | null } | null;
  fragrances?: { name: string; brand_id: string; image_url: string; brands?: { name: string } | null } | null;
}

const PAGE_SIZE = 20;

/**
 * Infinite-scroll SOTD feed from wear_logs where is_public = true.
 */
export function useSOTDFeed() {
  const [entries, setEntries] = useState<SOTDEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  // Raw rows fetched from the DB so far. The DB `.range()` offset must track
  // this, NOT entries.length — entries is deduped-by-fragrance and is smaller,
  // so using it would re-request already-seen rows and stall "load more".
  const rawFetchedRef = useRef(0);

  const load = useCallback(async (offset = 0) => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('wear_logs')
      .select('id, user_id, fragrance_id, worn_on, occasion, weather, note, rating, reaction_count, created_at, profiles!wear_logs_user_id_profiles_fkey(display_name), fragrances(name, brand_id, image_url, brands(name))')
      .eq('is_public', true)
      .order('worn_on', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.warn('[useSOTDFeed] error:', error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as unknown as SOTDEntry[];
    // Deduplicate by fragrance_id — keep only the most recent log per scent
    const dedup = (all: SOTDEntry[]) => {
      const seen = new Set<string>();
      return all.filter((e) => {
        if (seen.has(e.fragrance_id)) return false;
        seen.add(e.fragrance_id);
        return true;
      });
    };
    if (offset === 0) setEntries(dedup(rows));
    else setEntries((prev) => dedup([...prev, ...rows]));
    rawFetchedRef.current = offset + rows.length;
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
  }, []);

  useEffect(() => { load(0); }, [load]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    setLoading(true);
    load(rawFetchedRef.current);
  }, [hasMore, loading, load]);

  const refresh = useCallback(() => {
    setLoading(true);
    load(0);
  }, [load]);

  return { entries, loading, hasMore, loadMore, refresh };
}
