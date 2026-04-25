import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface CommunityRatingData {
  average: number;
  count: number;
}

/**
 * Fetches community rating for a single cigar.
 * Returns { average, count } or null while loading.
 */
export function useCommunityRating(cigarId: string | undefined): CommunityRatingData | null {
  const [data, setData] = useState<CommunityRatingData | null>(null);

  useEffect(() => {
    if (!cigarId) return;

    (async () => {
      try {
        const { data: rows } = await supabase
          .from('cigar_reviews')
          .select('overall_rating')
          .eq('cigar_id', cigarId);

        if (rows && rows.length > 0) {
          const sum = rows.reduce((acc, r) => acc + r.overall_rating, 0);
          setData({ average: sum / rows.length, count: rows.length });
        } else {
          setData({ average: 0, count: 0 });
        }
      } catch {
        setData({ average: 0, count: 0 });
      }
    })();
  }, [cigarId]);

  return data;
}

/**
 * Batch-fetches community ratings for multiple cigars at once.
 * Returns a Map of cigarId → { average, count }.
 */
export function useCommunityRatings(cigarIds: string[]): Map<string, CommunityRatingData> {
  const [map, setMap] = useState<Map<string, CommunityRatingData>>(new Map());

  useEffect(() => {
    if (cigarIds.length === 0) return;

    (async () => {
      try {
        const { data: rows } = await supabase
          .from('cigar_reviews')
          .select('cigar_id, overall_rating')
          .in('cigar_id', cigarIds);

        const grouped = new Map<string, number[]>();
        for (const row of rows ?? []) {
          const arr = grouped.get(row.cigar_id) ?? [];
          arr.push(row.overall_rating);
          grouped.set(row.cigar_id, arr);
        }

        const result = new Map<string, CommunityRatingData>();
        for (const [cid, ratings] of grouped.entries()) {
          const sum = ratings.reduce((a, b) => a + b, 0);
          result.set(cid, { average: sum / ratings.length, count: ratings.length });
        }
        setMap(result);
      } catch {
        setMap(new Map());
      }
    })();
  }, [cigarIds.join(',')]);

  return map;
}
