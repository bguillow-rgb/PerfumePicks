// Promo code redemption client. The sheet (PromoCodeSheet) calls redeemPromoCode
// and reflects the result; all validation + the Pro grant happen server-side in
// the redeem_promo_code RPC (202607181400) so the entitlement can't be forged.

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { resolveCurrentUser } from '@/src/stores/useAuthStore';
import { useProStore } from '@/src/stores/useProStore';
import { track, EVENTS } from '@/src/lib/observability';

export type RedeemResult =
  | { ok: true; durationMonths: number }
  | { ok: false; message: string };

/**
 * Redeem a promo code for the signed-in user. `entry` labels where the sheet was
 * opened from (paywall / profile) for funnel analysis. On success the server has
 * already flipped profiles.is_pro; we mirror it locally so the UI unlocks at once.
 */
export async function redeemPromoCode(code: string, entry?: string): Promise<RedeemResult> {
  const norm = code.trim().toUpperCase();
  if (!norm) return { ok: false, message: 'Enter a code.' };
  if (!isSupabaseConfigured) return { ok: false, message: 'Not available right now.' };

  // Codes require a real (non-anonymous) account. The sheet also gates guests,
  // but re-check here so a direct call can't skip it.
  const user = await resolveCurrentUser();
  if (!user || user.is_anonymous) {
    return { ok: false, message: 'Please sign in to redeem a code.' };
  }

  const { data, error } = await supabase.rpc('redeem_promo_code', { p_code: norm });
  if (error) {
    return { ok: false, message: 'Something went wrong. Please try again.' };
  }

  const res = data as { ok?: boolean; duration_months?: number; message?: string } | null;
  if (res?.ok) {
    // Server is the source of truth (profiles.is_pro is set); mirror it now.
    useProStore.getState().activate();
    track(EVENTS.PRO_PURCHASE_COMPLETED, { source: 'promo_code', entry: entry ?? null });
    return { ok: true, durationMonths: res.duration_months ?? 0 };
  }
  return { ok: false, message: res?.message ?? "That code isn't valid." };
}
