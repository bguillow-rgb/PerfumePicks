/**
 * Affiliate click handler — opens the retailer URL and fires the tracking event.
 * Centralized so every surface calls the same function.
 */

import * as WebBrowser from 'expo-web-browser';
import { track } from '@/src/lib/observability';
import { EVENTS } from '@/src/lib/observability/events';

const CJ_DOMAINS = ['anrdoezrs.net', 'dpbolvw.net', 'kqzyfj.com', 'tkqlhce.com', 'lduhtrp.net', 'jdoqocy.com'];

/**
 * FragranceShop's Cloudflare blocks the `cjevent` param that CJ appends to
 * redirected URLs — strip the wrapper so Safari opens the direct product URL.
 * Perfumania and other retailers pass CJ traffic fine, so keep their wrappers.
 */
function resolveUrl(url: string): string {
  if (CJ_DOMAINS.some((d) => url.includes(d))) {
    const match = url.match(/[?&]url=([^&]+)/);
    if (match) {
      try {
        const dest = decodeURIComponent(match[1]);
        // Only strip wrapper for FragranceShop — they block CJ traffic
        if (dest.includes('fragranceshop.com')) return dest;
      } catch {
        // Malformed percent-encoding — fall back to the original wrapper URL
        // rather than throwing and eating the affiliate click (revenue).
      }
    }
  }
  return url;
}

export interface AffiliateClickParams {
  fragrance_id: string;
  retailer: string;
  url: string;
  price_cents: number | null;
  source_screen: string;
}

export function handleAffiliateClick(params: AffiliateClickParams): void {
  track(EVENTS.AFFILIATE_OUTBOUND_CLICKED, {
    fragrance_id: params.fragrance_id,
    retailer: params.retailer,
    price_cents: params.price_cents,
    source_screen: params.source_screen,
  });
  WebBrowser.openBrowserAsync(resolveUrl(params.url)).catch((err) => {
    console.warn('[affiliate] failed to open URL:', err);
  });
}
