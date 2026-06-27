/**
 * Affiliate click handler — opens the retailer URL and fires the tracking event.
 * Centralized so every surface calls the same function.
 */

import * as WebBrowser from 'expo-web-browser';
import { track } from '@/src/lib/observability';
import { EVENTS } from '@/src/lib/observability/events';
import { reportDeadLink } from '@/src/lib/feedback';

export interface AffiliateClickParams {
  fragrance_id: string;
  retailer: string;
  url: string;
  price_cents: number | null;
  source_screen: string;
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

export function handleAffiliateClick(params: AffiliateClickParams): void {
  track(EVENTS.AFFILIATE_OUTBOUND_CLICKED, {
    fragrance_id: params.fragrance_id,
    retailer: params.retailer,
    price_cents: params.price_cents,
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
  WebBrowser.openBrowserAsync(params.url).catch((err) => {
    console.warn('[affiliate] failed to open URL:', err);
    reportFailure(params, 'open_failed');
  });
}
