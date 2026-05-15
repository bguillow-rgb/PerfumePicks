import { useState, useEffect } from 'react';
import { useCatalogStore, type Fragrance } from '@/src/stores/useCatalogStore';

/**
 * Debounced search hook wrapping `useCatalogStore.search`.
 *
 * Returns an empty array when the query is blank. Debounces by 300ms so
 * rapid keystrokes don't flood Supabase. Results update reactively as the
 * query changes.
 */
export function useFragranceSearch(query: string, limit = 30): Fragrance[] {
  const search = useCatalogStore((s) => s.search);
  const [results, setResults] = useState<Fragrance[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }

    let cancelled = false;
    const timer = setTimeout(() => {
      search(q, limit).then((rows) => {
        if (!cancelled) setResults(rows);
      });
    }, 300);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, limit, search]);

  return results;
}
