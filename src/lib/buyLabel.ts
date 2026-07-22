/**
 * Buy-surface labels — ONE formatter + ONE label rule for every buy CTA
 * (Chief UX review of Checkout 2.0, findings F1-F4/F8: the detail button
 * rounded $4.99 to "$5" while the checkout charges $4.99, surfaces disagreed
 * with each other, retailer names rendered lowercase from raw DB slugs, and
 * the label never said when a tap lands on a live checkout).
 */

import { isCheckout2Enabled } from '@/src/lib/checkout2Flag';

/**
 * Exact-price label: whole dollars when even, cents otherwise ($29.99 stays
 * $29.99, not $30). The price on a buy control is load-bearing — with
 * Checkout 2.0 it is the checkout total — so it is NEVER rounded.
 */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/** Display casing for retailer slugs (presentation only; slugs stay slugs). */
const RETAILER_DISPLAY: Record<string, string> = {
  perfumania: 'Perfumania',
  fragranceshop: 'Fragrance Shop',
  aromapassions: 'AromaPassions',
};

export function retailerDisplayName(slug: string): string {
  const s = (slug || '').toLowerCase().trim();
  if (RETAILER_DISPLAY[s]) return RETAILER_DISPLAY[s];
  // Unknown retailer: capitalize the first letter rather than shipping a slug.
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'retailer';
}

/**
 * The buy CTA label, honest about the destination. Mirrors the EXACT decision
 * handleAffiliateClick makes (flag AND permalink), so the label can never
 * promise a landing the tap won't deliver:
 *   streamlined → "Check out · $4.99"           (you are going to a checkout)
 *   fallback    → "Buy from Perfumania · $4.99" (you are going to the store)
 * Flag off keeps the pre-2.0 wording everywhere.
 */
export function buyCtaLabel(opts: {
  retailer: string;
  priceCents: number | null;
  checkoutUrl?: string | null;
}): string {
  const price = opts.priceCents != null ? ` · ${formatPrice(opts.priceCents)}` : '';
  const streamlined = isCheckout2Enabled() && !!opts.checkoutUrl;
  if (streamlined) return `Check out${price}`;
  return `Buy from ${retailerDisplayName(opts.retailer)}${price}`;
}

/**
 * Deterministic buy-row ranking (Mark Z review #3). The detail screen's query
 * had no ORDER BY, so `retailerLinks[0]` — the PRIMARY Buy button — was
 * whatever row Postgres returned first: a coin-flip merchant, and Checkout 2.0
 * randomly not firing when a permalink row existed. Rank: checkout-capable
 * rows first, then higher price (monetization-first, matching the store's
 * buyable index). Pure + exported so the contract is testable.
 */
export function rankBuyLinks<T extends { checkout_url?: string | null; price_cents: number | null }>(
  links: T[],
): T[] {
  return [...links].sort((a, b) => {
    const aCheckout = a.checkout_url ? 1 : 0;
    const bCheckout = b.checkout_url ? 1 : 0;
    if (aCheckout !== bCheckout) return bCheckout - aCheckout;
    return (b.price_cents ?? -1) - (a.price_cents ?? -1);
  });
}

/**
 * Accessibility hint matching the destination (screen-reader users get the
 * same honesty as the label — Chief UX F11).
 */
export function buyCtaHint(opts: { retailer: string; checkoutUrl?: string | null }): string {
  const name = retailerDisplayName(opts.retailer);
  const streamlined = isCheckout2Enabled() && !!opts.checkoutUrl;
  return streamlined
    ? `Opens ${name} checkout in your browser with this fragrance in the cart.`
    : `Opens ${name} in your browser.`;
}
