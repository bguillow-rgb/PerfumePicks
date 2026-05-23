import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface SOTDEntry {
  id: string;
  fragrance_id: string;
  user_id: string;
  worn_on: string;
  occasion?: string | null;
  weather?: string | null;
  rating?: number | null;
  note?: string | null;
  created_at: string;
  // Joined fields
  fragrance_name?: string;
  fragrance_brand?: string;
  display_name?: string;
}

const PAGE_SIZE = 20;

/**
 * Infinite-scroll feed of public wear logs.
 * Falls back to an empty list when Supabase is not configured.
 */
export function useSOTDFeed() {
  const [entries, setEntries] = useState<SOTDEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (pageIndex: number) => {
    if (!isSupabaseConfigured) { setHasMore(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('wear_logs')
        .select(`
          id, fragrance_id, user_id, worn_on, occasion, weather, rating, note, created_at,
          profiles!inner(display_name)
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .range(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE - 1);

      if (err) throw err;
      const rows = (data ?? []) as unknown as Array<SOTDEntry & { profiles?: { display_name?: string } }>;
      const mapped: SOTDEntry[] = rows.map((r) => ({
        ...r,
        display_name: r.profiles?.display_name ?? 'Community member',
      }));
      if (pageIndex === 0) {
        setEntries(mapped);
      } else {
        setEntries((prev) => [...prev, ...mapped]);
      }
      setHasMore(mapped.length === PAGE_SIZE);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchPage(0); }, [fetchPage]);

  const loadMore = () => {
    if (loading || !hasMore) return;
    const next = page + 1;
    setPage(next);
    fetchPage(next);
  };

  const refresh = () => {
    setPage(0);
    setEntries([]);
    setHasMore(true);
    fetchPage(0);
  };

  return { entries, loading, hasMore, error, loadMore, refresh };
}
