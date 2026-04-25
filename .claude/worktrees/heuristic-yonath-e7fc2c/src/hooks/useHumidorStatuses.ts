import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type HumidorStatus = 'wishlist' | 'owned' | 'smoked';

/**
 * Batch-fetches humidor statuses for a list of cigar IDs.
 * Returns a Map of cigarId → set of statuses the user has for that cigar.
 */
export function useHumidorStatuses(cigarIds: string[]): Map<string, HumidorStatus[]> {
  const [map, setMap] = useState<Map<string, HumidorStatus[]>>(new Map());

  useEffect(() => {
    if (cigarIds.length === 0) return;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: rows } = await supabase
          .from('humidor_items')
          .select('cigar_id, status')
          .eq('user_id', user.id)
          .in('cigar_id', cigarIds);

        const result = new Map<string, HumidorStatus[]>();
        for (const row of rows ?? []) {
          const arr = result.get(row.cigar_id) ?? [];
          arr.push(row.status as HumidorStatus);
          result.set(row.cigar_id, arr);
        }
        setMap(result);
      } catch {
        setMap(new Map());
      }
    })();
  }, [cigarIds.join(',')]);

  return map;
}
