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
async function logAffiliateClick(params: AffiliateClickParams): Promise<void> {
  try {
    if (!isSupabaseConfigured) return;
    let userId: string | null = null;
    try {
      userId = (await resolveCurrentUser())?.id ?? null;
    } catch {
      /* ignore — anonymous/demo taps still open the link, just aren't ledgered */
    }
    if (!userId) return; // RLS requires auth.uid() = user_id; no session → skip
    await supabase.from('affiliate_clicks').insert({
      click_id: Crypto.randomUUID(),
      app: APP_TAG,
      user_id: userId,
      network: affiliateNetworkForUrl(params.url),
      retailer: params.retailer,
      product_id: params.fragrance_id,
      source_screen: params.source_screen,
      price_cents: params.price_cents,
    });
  } catch {
    /* never throw from a click handler */
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
 * Returns a promise that resolves when the in-app browser sheet is DISMISSED
 * (the user is back in the app). Callers may ignore it (legacy behavior) or
 * chain on it for a post-handoff moment (e.g. the fragrance-detail "add to
 * your collection?" prompt — Chief UX F6, the pattern Percolate proved).
 */
export function handleAffiliateClick(params: AffiliateClickParams): Promise<void> {
  // Checkout 2.0 fallback decision — the ONE place it happens. Streamlined
  // checkout only when the row has a permalink AND the launch-gate flag is on;
  // everything else behaves byte-identically to the pre-2.0 handoff.
  const useCheckout = isCheckout2Enabled() && !!params.checkout_url;
  const effectiveUrl = useCheckout ? (params.checkout_url as string) : params.url;
  const landing: 'checkout' | 'product' = useCheckout ? 'checkout' : 'product';

  // Durable ledger write (source of truth) + PostHog event (secondary signal).
  // Both are fire-and-forget; neither gates the browser open below.
  void logAffiliateClick(params);
  track(EVENTS.AFFILIATE_OUTBOUND_CLICKED, {
    fragrance_id: params.fragrance_id,
    retailer: params.retailer,
    price_cents: params.price_cents,
    source_screen: params.source_screen,
    // PRD §7: the conversion comparison dimension (checkout vs product).
    landing,
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
    })
    .catch((err) => {
      console.warn('[affiliate] failed to open URL:', err);
      reportFailure({ ...params, url: effectiveUrl }, 'open_failed');
    });
}
