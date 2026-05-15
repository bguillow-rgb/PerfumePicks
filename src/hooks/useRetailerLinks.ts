import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface RetailerLink {
  retailer: string;
  url: string;
  price_cents: number | null;
}

/**
 * Fetches retailer links for a fragrance, sorted cheapest first.
 * Returns the full list + the cheapest link for inline price whispers.
 */
export function useRetailerLinks(fragranceId: string | undefined) {
  const [links, setLinks] = useState<RetailerLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !fragranceId) {
      setLinks([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase
      .from('fragrance_retailer_links')
      .select('retailer, url, price_cents')
      .eq('fragrance_id', fragranceId)
      .order('price_cents', { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        if (!cancelled) {
          setLinks(data ?? []);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [fragranceId]);

  const cheapest = links.find((l) => l.price_cents != null) ?? links[0] ?? null;

  return { links, cheapest, loading };
}
