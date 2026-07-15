import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useProStore } from '@/src/stores/useProStore';
import { getCurrentUser } from '@/src/stores/useAuthStore';
import { track, EVENTS } from '@/src/lib/observability';

/**
 * Redeem an influencer promo code for N months of free Pro.
 *
 * All validation + the entitlement grant happen server-side in the `redeem-promo`
 * Edge Function (service role) — the client only submits the code and reflects the
 * result. On success we flip useProStore.serverPro so the UI unlocks immediately,
 * without waiting for the next my_pro_status() sync.
 */

export type RedeemOutcome =
  | { ok: true; durationMonths: number; proExpiresAt: string | null }
  | { ok: false; reason: RedeemErrorReason; message: string };

export type RedeemErrorReason =
  | 'not_configured'
  | 'sign_in_required'
  | 'empty_code'
  | 'invalid_code'
  | 'expired'
  | 'code_exhausted'
  | 'already_redeemed'
  | 'already_pro'
  | 'network'
  | 'server_error';

// User-facing copy per failure. Kept plain and specific — no exclamation-mark
// marketing voice, no "Oops". These read like a person telling you what happened.
const MESSAGES: Record<RedeemErrorReason, string> = {
  not_configured:   'Redeeming codes needs a connection. Try again once you’re online.',
  sign_in_required: 'Sign in to redeem a code — it keeps your Pro tied to your account.',
  empty_code:       'Enter a code first.',
  invalid_code:     'That code isn’t valid. Double-check it and try again.',
  expired:          'This code has expired.',
  code_exhausted:   'This code has been fully claimed.',
  already_redeemed: 'You’ve already used this code.',
  already_pro:      'You’re already on Pro, so there’s nothing to redeem.',
  network:          'Couldn’t reach the server. Check your connection and try again.',
  server_error:     'Something went wrong redeeming that code. Try again in a moment.',
};

function fail(reason: RedeemErrorReason): RedeemOutcome {
  return { ok: false, reason, message: MESSAGES[reason] };
}

/** Coerce whatever the Edge Function returned as `{ error }` into a known reason. */
function toReason(raw: unknown): RedeemErrorReason {
  const known: RedeemErrorReason[] = [
    'invalid_code', 'expired', 'code_exhausted', 'already_redeemed',
    'already_pro', 'empty_code', 'sign_in_required', 'server_error',
  ];
  return (known as string[]).includes(raw as string)
    ? (raw as RedeemErrorReason)
    : 'server_error';
}

export async function redeemPromoCode(
  rawCode: string,
  entry: 'paywall' | 'profile',
): Promise<RedeemOutcome> {
  const code = rawCode.trim();
  if (!code) return fail('empty_code');
  if (!isSupabaseConfigured) return fail('not_configured');

  // Guests can't redeem — a code must attach to a real, recoverable account.
  // Short-circuit before the round-trip; the Edge Function enforces this too.
  const user = getCurrentUser();
  if (!user || user.is_anonymous) {
    track(EVENTS.PROMO_REDEEM_FAILED, { entry, reason: 'sign_in_required' });
    return fail('sign_in_required');
  }

  track(EVENTS.PROMO_REDEEM_STARTED, { entry });

  try {
    const { data, error } = await supabase.functions.invoke('redeem-promo', {
      body: { code },
    });

    if (error) {
      // Non-2xx from the function: the JSON body (e.g. { error: 'already_pro' })
      // rides on error.context (a Response). Fall back to a generic error if it
      // can't be read (e.g. a network failure with no response at all).
      let reason: RedeemErrorReason = 'network';
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          reason = toReason(body?.error);
        }
      } catch {
        reason = 'server_error';
      }
      track(EVENTS.PROMO_REDEEM_FAILED, { entry, reason });
      return fail(reason);
    }

    if (data?.ok) {
      // Unlock immediately — don't wait for the next sign-in sync.
      useProStore.getState().syncFromServer(true);
      track(EVENTS.PROMO_REDEEM_COMPLETED, {
        entry,
        duration_months: data.duration_months,
      });
      return {
        ok: true,
        durationMonths: data.duration_months,
        proExpiresAt: data.pro_expires_at ?? null,
      };
    }

    // 2xx but not { ok: true } — treat defensively.
    const reason = toReason(data?.error);
    track(EVENTS.PROMO_REDEEM_FAILED, { entry, reason });
    return fail(reason);
  } catch (e) {
    track(EVENTS.PROMO_REDEEM_FAILED, { entry, reason: 'network' });
    return fail('network');
  }
}
