/**
 * Affiliate click handler — opens the retailer URL and fires the tracking event.
 * Centralized so every surface calls the same function.
 */

import { Linking } from 'react-native';
import { track } from '@/src/lib/observability';
import { EVENTS } from '@/src/lib/observability/events';

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
  Linking.openURL(params.url).catch((err) => {
    console.warn('[affiliate] failed to open URL:', err);
  });
}
