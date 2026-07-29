/**
 * Enrich-on-demand queue (V3 M4). When a picker-search result fails the
 * completeness gate (no family / no accords), tapping it enqueues the bottle
 * here so the enrichment pipeline (scripts/enrich-dna-pool.mjs pattern) can
 * prioritize it. Additive table `enrich_requests`; RLS lets an authenticated
 * user insert only their own row, reads are service-role (dashboard/scripts).
 *
 * Best-effort fire-and-forget: any failure (offline, demo mode, dup) resolves
 * false and the UI copy stays the same — "Noted" is a promise to prioritize,
 * not a receipt.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { resolveCurrentUser } from '@/src/stores/useAuthStore';

export async function requestEnrichment(fragranceId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !fragranceId) return false;
  try {
    const user = await resolveCurrentUser();
    if (!user) return false;
    // Plain INSERT, NOT upsert(ignoreDuplicates). enrich_requests grants
    // authenticated users INSERT-only (reads are service-role); PostgREST's
    // upsert path (ON CONFLICT DO NOTHING) must READ the conflict target, so RLS
    // rejected it (42501) for the anonymous guests who make ~all enrich requests
    // — every request dropped silently (verified 2026-07: 3 events → 0 rows;
    // anon plain-insert = 201, anon upsert = 403). A re-tap trips the unique
    // constraint (23505), which is the intended dedupe and counts as success.
    const { error } = await supabase
      .from('enrich_requests')
      .insert({ fragrance_id: fragranceId, requested_by: user.id });
    if (error && error.code !== '23505') {
      console.warn('[enrich] requestEnrichment failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[enrich] requestEnrichment threw:', (e as Error).message);
    return false;
  }
}
