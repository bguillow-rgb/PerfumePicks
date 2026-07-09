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
    const { error } = await supabase.from('enrich_requests').upsert(
      { fragrance_id: fragranceId, requested_by: user.id },
      // unique(fragrance_id, requested_by) dedupes re-taps; ignore the dup.
      { onConflict: 'fragrance_id,requested_by', ignoreDuplicates: true },
    );
    if (error) {
      console.warn('[enrich] requestEnrichment failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[enrich] requestEnrichment threw:', (e as Error).message);
    return false;
  }
}
