/**
 * Affiliate click handler — opens the retailer URL and fires the tracking event.
 * Centralized so every surface calls the same function.
 */

import * as WebBrowser from 'expo-web-browser';
import { track } from '@/src/lib/observability';
import { EVENTS } from '@/src/lib/observability/events';
import { reportDeadLink } from '@/src/lib/feedback';

/** CJ (Commission Junction) click-redirect domains we ship affiliate links through. */
const CJ_DOMAINS = ['anrdoezrs.net', 'dpbolvw.net', 'kqzyfj.com', 'tkqlhce.com', 'lduhtrp.net', 'jdoqocy.com'];

function isCjLink(url: string): boolean {
  return CJ_DOMAINS.some((d) => url.includes(d));
}

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

/**
 * Health-probe a CJ affiliate link WITHOUT following it into the retailer.
 *
 * A live CJ link answers with a redirect (3xx, surfaced as 'opaqueredirect' /
 * status 0 when we don't follow it). Anything else — 404/410 (the product was
 * pulled from the feed), 5xx, a network error, or a timeout (the "takes forever
 * to load" symptom) — means the link is dead, so we flag it to the founder.
 *
 * We deliberately do NOT follow the redirect: the destination (e.g.
 * fragranceshop.com) sits behind Cloudflare bot-detection that 403s any
 * non-browser request, so following would false-positive on every healthy link.
 * The CJ hop itself is not bot-gated, making it a reliable signal.
 */
function probeCjLink(params: AffiliateClickParams): void {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  fetch(params.url, { method: 'GET', redirect: 'manual', signal: controller.signal })
    .then((res) => {
      const redirected =
        res.type === 'opaqueredirect' || res.status === 0 || (res.status >= 300 && res.status < 400);
      if (!redirected) reportFailure(params, `http_${res.status}`);
    })
    .catch((err: unknown) => {
      const name = (err as { name?: string } | null)?.name;
      reportFailure(params, name === 'AbortError' ? 'timeout' : 'network');
    })
    .finally(() => clearTimeout(timer));
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
  // Cloudflare expects. (A prior version stripped it to the bare product URL,
  // which both zeroed the commission and tripped a 403 on direct deep-links.)
  WebBrowser.openBrowserAsync(params.url).catch((err) => {
    console.warn('[affiliate] failed to open URL:', err);
    reportFailure(params, 'open_failed');
  });

  // In parallel, confirm the link still resolves and alert the founder if not.
  if (isCjLink(params.url)) probeCjLink(params);
}
