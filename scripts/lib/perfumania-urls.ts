/**
 * Perfumania CJ URL builders — extracted from etl-perfumania-shopify.ts so the
 * Jest contract tests exercise the REAL builders instead of a local copy
 * (Mark Z review: a reimplemented test double let the wrapper drift silently).
 * Dependency-free on purpose: importable by both the ETL (tsx) and Jest.
 */

export const PERFUMANIA_BASE_URL = 'https://perfumania.com';

// Perfume Picks CJ website ID — NOT the account CID (7966973); click- URLs need
// the website ID for mobile attribution. Overridable via env in the ETL.
export const DEFAULT_CJ_WEBSITE_ID = '101759456';
// Perfumania's CJ advertiser ID.
export const PERFUMANIA_CJ_ADVERTISER_ID = '17277211';

/** CJ affiliate URL for a Perfumania product page. */
export function cjUrl(handle: string, websiteId: string = DEFAULT_CJ_WEBSITE_ID): string {
  const dest = encodeURIComponent(`${PERFUMANIA_BASE_URL}/products/${handle}`);
  return `https://www.jdoqocy.com/click-${websiteId}-${PERFUMANIA_CJ_ADVERTISER_ID}?url=${dest}`;
}

/**
 * Checkout 2.0 (plans/PRD-checkout-2.0.md): CJ affiliate URL whose destination
 * is the Shopify CART PERMALINK for one variant — lands the buyer on
 * perfumania's checkout with the item already in the bag. Same click wrapper as
 * cjUrl, so attribution routing is identical; only the destination differs.
 */
export function cjCartUrl(variantId: number, websiteId: string = DEFAULT_CJ_WEBSITE_ID): string {
  const dest = encodeURIComponent(`${PERFUMANIA_BASE_URL}/cart/${variantId}:1`);
  return `https://www.jdoqocy.com/click-${websiteId}-${PERFUMANIA_CJ_ADVERTISER_ID}?url=${dest}`;
}
