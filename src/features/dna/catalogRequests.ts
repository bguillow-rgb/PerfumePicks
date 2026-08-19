/**
 * Catalog-add requests (Phase 3 demand loop). When a picker search returns ZERO
 * results, the user can tap "Request it" — the bottle isn't in the catalog, so
 * there's no slug to enqueue for enrichment; we record the raw query instead.
 * The weekly mining script (scripts/catalog-demand.mjs) turns these + PostHog
 * search_no_results into a prioritized add-list.
 *
 * Same contract as requestEnrichment: RLS grants authenticated users INSERT-only
 * (reads are service-role), so we PLAIN INSERT — never upsert, whose ON CONFLICT
 * read path RLS rejects for the anonymous guests who make most requests. A
 * re-request trips the unique constraint (23505), which is the intended dedupe
 * and counts as success. Best-effort fire-and-forget.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { resolveCurrentUser } from '@/src/stores/useAuthStore';

/** Mirror of pp_normalize / normalizeSearchText: lower, strip accents, single-space. */
function normalizeQuery(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export async function requestCatalogAddition(
  query: string,
  surface = 'dna_picker',
): Promise<boolean> {
  const q = query.trim().slice(0, 80);
  const qn = normalizeQuery(q);
  if (!isSupabaseConfigured || !qn) return false;
  try {
    const user = await resolveCurrentUser();
    if (!user) return false;
    const { error } = await supabase
      .from('catalog_requests')
      .insert({ query: q, query_normalized: qn, surface, requested_by: user.id });
    if (error && error.code !== '23505') {
      console.warn('[catalog] requestCatalogAddition failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[catalog] requestCatalogAddition threw:', (e as Error).message);
    return false;
  }
}
