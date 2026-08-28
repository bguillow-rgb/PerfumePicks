/**
 * Affiliate click handler — opens the retailer URL and fires the tracking event.
 * Centralized so every surface calls the same function.
 */

import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { track } from '@/src/lib/observability';
import { EVENTS } from '@/src/lib/observability/events';
import { reportDeadLink } from '@/src/lib/feedback';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { isCheckout2Enabled } from '@/src/lib/checkout2Flag';
import { dnaTrackEvent } from '@/src/lib/dna';
import { resolveCurrentUser } from '@/src/stores/useAuthStore';

const APP_TAG = 'perfumepicks';

export interface AffiliateClickParams {
  fragrance_id: string;
  retailer: string;
  url: string;
  price_cents: number | null;
  source_screen: string;
  /** Checkout 2.0 (plans/PRD-checkout-2.0.md): CJ-wrapped Shopify cart
   *  permalink. When present AND the checkout_2_enabled flag is on, it is
   *  opened INSTEAD of `url`, landing the buyer on checkout with the item in
   *  the bag. Null/undefined (fragranceshop, unbuildable rows, flag off) =>
   *  `url` opens exactly as before. */
  checkout_url?: string | null;
}

// Which affiliate network a URL routes through, derived from its tracking
// domain. CJ uses a rotating set of redirect domains; Awin uses awin1.com.
// Anything else is a brand-direct link (no network, no commission wrapper).
const CJ_DOMAINS = /(anrdoezrs\.net|jdoqocy\.com|dpbolvw\.com|tqlkg\.com|kqzyfj\.com|ftjcfx\.com|emjcd\.com|qksrv\.net)/;
export function affiliateNetworkForUrl(url: string): 'cj' | 'awin' | 'direct' {
  const u = (url || '').toLowerCase();
  if (CJ_DOMAINS.test(u)) return 'cj';
  if (u.includes('awin1.com')) return 'awin';
  return 'direct';
}

// Durable click ledger — the app-owned source of truth for affiliate buy-link
// taps. Mirrors feedback.ts: gated on Supabase, best-effort, and fully swallowed
// so it can NEVER block or delay opening the retailer. PostHog gets the same
// event (below) as a secondary signal, but it proved non-durable (project wiped
// 2026-07-03), so this row is what reporting counts.
async function logAffiliateClick(
  params: AffiliateClickParams,
  landing: 'checkout' | 'product',
  clickId: string,
): Promise<void> {
  try {
    if (!isSupabaseConfigured) return;
    let userId: string | null = null;
    try {
      userId = (await resolveCurrentUser())?.id ?? null;
    } catch {
      /* ignore — anonymous/demo taps still open the link, just aren't ledgered */
    }
    // RLS requires auth.uid() = user_id, so a tapper with NO auth row at all
    // can't be ledgered. Anonymous users CAN (they have real auth rows — 15 of
    // the first 22 ledger rows are anonymous); the gap is people who never hit
    // the login screen, since that's the only place signInAnonymously() runs.
    //
    // Deliberately NOT fixed by minting a session here: creating an auth user
    // as a side effect of a buy tap would inflate every signup and conversion
    // number we report. Instead the skip is now COUNTED, so PostHog taps minus
    // ledger rows is an explained number rather than a silent shortfall.
    if (!userId) {
      track(EVENTS.AFFILIATE_CLICK_UNLEDGERED, {
        fragrance_id: params.fragrance_id,
        retailer: params.retailer,
        source_screen: params.source_screen,
        landing,
        reason: 'no_session',
      });
      return;
    }
    await supabase.from('affiliate_clicks').insert({
      click_id: clickId,
      app: APP_TAG,
      user_id: userId,
      network: affiliateNetworkForUrl(params.url),
      retailer: params.retailer,
      product_id: params.fragrance_id,
      source_screen: params.source_screen,
      price_cents: params.price_cents,
      // PRD §7: the checkout-vs-product dimension on the DURABLE ledger, so the
      // conversion comparison survives a PostHog wipe (it happened once).
      landing,
    });
  } catch {
    // Never throw from a click handler — but never lose the row silently
    // either. A failed insert is the same audit hole as a skipped one.
    try {
      track(EVENTS.AFFILIATE_CLICK_UNLEDGERED, {
        fragrance_id: params.fragrance_id,
        retailer: params.retailer,
        source_screen: params.source_screen,
        landing,
        reason: 'insert_failed',
      });
    } catch {
      /* analytics is best-effort too */
    }
  }
}

// Session dedupe so one dead link tapped repeatedly (or by many surfaces) only
// pings the founder once per app run, instead of spamming their phone.
const reportedDead = new Set<string>();

function reportFailure(params: AffiliateClickParams, reason: string): void {
  track(EVENTS.AFFILIATE_LINK_FAILED, {
    fragrance_id: params.fragrance_id,
    retailer: params.retailer,
    source_screen: params.source_screen,
    reason,
  });
  if (reportedDead.has(params.url)) return;
  reportedDead.add(params.url);
  void reportDeadLink({
    retailer: params.retailer,
    url: params.url,
    fragranceId: params.fragrance_id,
    reason,
    sourceScreen: params.source_screen,
  });
}

/**
 * Resolves `true` when the in-app browser sheet was genuinely opened and then
 * DISMISSED (the user went to the retailer and came back), `false` when the
 * browser never opened (dead link / OS refusal). Callers may ignore it (legacy
 * behavior) or chain on it for a post-handoff moment (e.g. the fragrance-detail
 * "add to your collection?" prompt — Chief UX F6). The boolean matters: a
 * failed open must NOT trigger post-shopping prompts (Mark Z #4).
 */
/**
 * Stamp our per-click id into the affiliate network's SubID slot so a posted
 * commission can be traced back to the exact tap that earned it.
 *
 * WHY THIS EXISTS: every CJ link shipped with `sid=101759456` — the website id,
 * identical on every click and therefore useless. CJ returns the SubID on the
 * commission record as `shopperId`, so a unique value per click is the only way
 * to answer "did this tap reach CJ, and did it pay?" Without it a zero-
 * commission stretch is unfalsifiable: indistinguishable from broken tracking,
 * which is exactly the ambiguity that stalled the 2026-08 attribution triage.
 *
 * CJ uses `sid`, Awin uses `clickref`. Dashes are stripped (networks want a
 * plain alphanumeric token); an existing value is REPLACED, not appended twice.
 * The `url=` deep-link payload is never touched.
 */
export function withSubId(rawUrl: string, clickId: string): string {
  const token = clickId.replace(/-/g, '');
  const network = affiliateNetworkForUrl(rawUrl);
  const key = network === 'awin' ? 'clickref' : 'sid';
  try {
    const u = new URL(rawUrl);
    u.searchParams.set(key, token);
    return u.toString();
  } catch {
    // Malformed URL — never block the handoff over a tracking nicety.
    return rawUrl;
  }
}

export function handleAffiliateClick(params: AffiliateClickParams): Promise<boolean> {
  // Checkout 2.0 fallback decision — the ONE place it happens. Streamlined
  // checkout only when the row has a permalink AND the launch-gate flag is on;
  // everything else behaves byte-identically to the pre-2.0 handoff.
  const useCheckout = isCheckout2Enabled() && !!params.checkout_url;
  const baseUrl = useCheckout ? (params.checkout_url as string) : params.url;
  const landing: 'checkout' | 'product' = useCheckout ? 'checkout' : 'product';
  // ONE id, used for both the ledger row and the network SubID, so a commission
  // that comes back carrying it identifies the exact click that produced it.
  const clickId = Crypto.randomUUID();
  const effectiveUrl = withSubId(baseUrl, clickId);

  // Durable ledger write (source of truth) + PostHog event (secondary signal).
  // Both are fire-and-forget; neither gates the browser open below.
  void logAffiliateClick(params, landing, clickId);
  track(EVENTS.AFFILIATE_OUTBOUND_CLICKED, {
    fragrance_id: params.fragrance_id,
    retailer: params.retailer,
    price_cents: params.price_cents,
    source_screen: params.source_screen,
    // PRD §7: the conversion comparison dimension (checkout vs product).
    landing,
  });
  // DNA layer dual-emission (M1, additive — the ledger write + track() above
  // are unchanged). A buy tap is the strongest commercial-intent taste signal.
  dnaTrackEvent('affiliate_link_clicked', {
    entity_id: params.fragrance_id,
    retailer: params.retailer,
    source_screen: params.source_screen,
  });

  // Open the URL exactly as stored. For CJ retailers that's the tracking
  // wrapper (anrdoezrs.net/click-…?url=…) — it MUST stay intact: it carries the
  // cjevent that earns commission AND is the referral path the retailer's
  // Cloudflare expects.
  //
  // We intentionally do NOT health-probe the link from the client. A fetch of
  // the CJ click URL (a) double-hits the retailer on every tap and (b) can
  // register as a phantom CJ click, corrupting the attribution data we depend
  // on. A bot fetch also can't read past the retailer's Cloudflare bot-gate, so
  // it measures Cloudflare's mood, not link health. Dead-link detection belongs
  // in the ETL (server-side, real user-agent, marks dead rows before they ship).
  // The only failure we can honestly observe here is the browser not opening.
  const openedAt = Date.now();
  return WebBrowser.openBrowserAsync(effectiveUrl)
    .then(() => {
      // The sheet was dismissed — the user is back. Dwell time is the only
      // in-app signal between the tap and CJ's delayed postback: ~3s is a
      // bounce, ~90s probably bought (PRD §7).
      track(EVENTS.AFFILIATE_RETURN, {
        fragrance_id: params.fragrance_id,
        retailer: params.retailer,
        landing,
        dwell_ms: Date.now() - openedAt,
      });
      return true;
    })
    .catch((err) => {
      console.warn('[affiliate] failed to open URL:', err);
      reportFailure({ ...params, url: effectiveUrl }, 'open_failed');
      return false;
    });
}
