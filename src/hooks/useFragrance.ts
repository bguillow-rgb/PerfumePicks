import { useState, useEffect } from 'react';
import { useCatalogStore, type Fragrance } from '@/src/stores/useCatalogStore';

/**
 * React hook wrapping `useCatalogStore.fetchById` with caching.
 *
 * Returns the fragrance once loaded, undefined while loading, and null
 * if the id doesn't exist in the catalog. The catalog store's in-memory
 * cache means repeat renders with the same id are synchronous.
 */
export function useFragrance(id: string | undefined) {
  const getById = useCatalogStore((s) => s.getById);
  const fetchById = useCatalogStore((s) => s.fetchById);

  // Try synchronous cache first — avoids a flash of undefined on re-renders.
  const cached = id ? getById(id) : undefined;
  const [fragrance, setFragrance] = useState<Fragrance | undefined | null>(cached ?? undefined);

  useEffect(() => {
    if (!id) { setFragrance(undefined); return; }
    // If already cached, use it immediately.
    const hit = getById(id);
    if (hit) { setFragrance(hit); return; }
    // Otherwise fetch async.
    let cancelled = false;
    fetchById(id).then((row) => {
      if (!cancelled) setFragrance(row ?? null);
    });
    return () => { cancelled = true; };
  }, [id, getById, fetchById]);

  return fragrance;
}
