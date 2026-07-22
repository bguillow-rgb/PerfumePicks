/**
 * Checkout 2.0 (plans/PRD-checkout-2.0.md) — the fallback decision + URL choice.
 *
 * The whole feature is one decision in handleAffiliateClick:
 *   flag ON  + checkout_url present → open the cart-permalink checkout
 *   anything else                   → open the product page (today's behavior)
 * These tests pin that decision, its `landing` analytics tag, and the fail-closed
 * flag default. The browser + supabase + stores are mocked; we assert which URL
 * is opened and what the outbound event carries.
 */

const openedUrls: string[] = [];
const tracked: { event: string; props?: Record<string, unknown> }[] = [];

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (url: string) => {
    openedUrls.push(url);
    return Promise.resolve();
  },
}));

jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-uuid' }));

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false, // ledger write short-circuits; not under test here
  supabase: {},
}));

jest.mock('@/src/stores/useAuthStore', () => ({ resolveCurrentUser: async () => null }));

jest.mock('@/src/lib/observability', () => ({
  track: (event: string, props?: Record<string, unknown>) => {
    tracked.push({ event, props });
  },
}));
jest.mock('@/src/lib/observability/events', () => ({
  EVENTS: jest.requireActual('@/src/lib/observability/events').EVENTS,
}));

jest.mock('@/src/lib/feedback', () => ({ reportDeadLink: jest.fn() }));

import { handleAffiliateClick } from '@/src/lib/affiliate';
import { _setCheckout2EnabledForTest, isCheckout2Enabled } from '@/src/lib/checkout2Flag';
import { buyCtaLabel, formatPrice, rankBuyLinks, retailerDisplayName } from '@/src/lib/buyLabel';
// The REAL builders/row-shapers, not local copies (Mark Z: a reimplemented test
// double let the contract drift silently).
import { cjCartUrl, cjUrl } from '../../scripts/lib/perfumania-urls';
import { buildLinkRow, type AffiliateProduct } from '../../scripts/lib/affiliate-etl-base';

const PRODUCT_URL =
  'https://www.jdoqocy.com/click-101759456-17277211?url=https%3A%2F%2Fperfumania.com%2Fproducts%2Fcuba-red';
const CHECKOUT_URL =
  'https://www.jdoqocy.com/click-101759456-17277211?url=https%3A%2F%2Fperfumania.com%2Fcart%2F31838706237573%3A1';

const baseParams = {
  fragrance_id: 'cuba-red',
  retailer: 'perfumania',
  url: PRODUCT_URL,
  price_cents: 499,
  source_screen: 'fragrance_detail_rail',
};

const lastOutbound = () =>
  [...tracked].reverse().find((t) => t.event === 'affiliate_outbound_clicked');

beforeEach(() => {
  openedUrls.length = 0;
  tracked.length = 0;
  _setCheckout2EnabledForTest(null); // unresolved
});

describe('checkout2 flag', () => {
  it('fails CLOSED before the remote value resolves', () => {
    expect(isCheckout2Enabled()).toBe(false);
  });
});

describe('handleAffiliateClick — Checkout 2.0 decision', () => {
  it('opens the checkout permalink when the flag is on and the row has one', () => {
    _setCheckout2EnabledForTest(true);
    handleAffiliateClick({ ...baseParams, checkout_url: CHECKOUT_URL });
    expect(openedUrls).toEqual([CHECKOUT_URL]);
    expect(lastOutbound()?.props?.landing).toBe('checkout');
  });

  it('opens the product page when the flag is OFF, even with a checkout_url', () => {
    _setCheckout2EnabledForTest(false);
    handleAffiliateClick({ ...baseParams, checkout_url: CHECKOUT_URL });
    expect(openedUrls).toEqual([PRODUCT_URL]);
    expect(lastOutbound()?.props?.landing).toBe('product');
  });

  it('opens the product page when the row has no checkout_url (fragranceshop path)', () => {
    _setCheckout2EnabledForTest(true);
    handleAffiliateClick({ ...baseParams, checkout_url: null });
    expect(openedUrls).toEqual([PRODUCT_URL]);
    expect(lastOutbound()?.props?.landing).toBe('product');
  });

  it('opens the product page when checkout_url is omitted entirely (legacy caller)', () => {
    _setCheckout2EnabledForTest(true);
    handleAffiliateClick(baseParams);
    expect(openedUrls).toEqual([PRODUCT_URL]);
    expect(lastOutbound()?.props?.landing).toBe('product');
  });

  it('opens the product page while the flag is still unresolved (first-tap race)', () => {
    // cached === null → fail closed → product page, never a stale checkout.
    handleAffiliateClick({ ...baseParams, checkout_url: CHECKOUT_URL });
    expect(openedUrls).toEqual([PRODUCT_URL]);
    expect(lastOutbound()?.props?.landing).toBe('product');
  });
});

describe('buy labels (Chief UX F1-F4/F8)', () => {
  it('never rounds a price on a buy control ($4.99 stays $4.99)', () => {
    expect(formatPrice(499)).toBe('$4.99');
    expect(formatPrice(2999)).toBe('$29.99');
    expect(formatPrice(5000)).toBe('$50');
  });

  it('title-cases retailer slugs for display', () => {
    expect(retailerDisplayName('perfumania')).toBe('Perfumania');
    expect(retailerDisplayName('fragranceshop')).toBe('Fragrance Shop');
    expect(retailerDisplayName('somethingnew')).toBe('Somethingnew');
  });

  it('says "Check out" only when the tap will actually land on a checkout', () => {
    _setCheckout2EnabledForTest(true);
    expect(buyCtaLabel({ retailer: 'perfumania', priceCents: 499, checkoutUrl: CHECKOUT_URL }))
      .toBe('Check out · $4.99');
    // No permalink (fragranceshop) → store wording even with the flag on.
    expect(buyCtaLabel({ retailer: 'fragranceshop', priceCents: 5400, checkoutUrl: null }))
      .toBe('Buy from Fragrance Shop · $54');
  });

  it('keeps pre-2.0 wording when the flag is off (label mirrors the tap decision)', () => {
    _setCheckout2EnabledForTest(false);
    expect(buyCtaLabel({ retailer: 'perfumania', priceCents: 499, checkoutUrl: CHECKOUT_URL }))
      .toBe('Buy from Perfumania · $4.99');
  });
});

describe('cart permalink shape (the REAL ETL builders)', () => {
  it('wraps the cart permalink in the same CJ click wrapper as product links', () => {
    const cart = cjCartUrl(31838706237573);
    const product = cjUrl('cuba-red-mens-eau-de-toilette-spray');
    // Same wrapper prefix (website id + advertiser id) — attribution routing
    // identical; only the destination differs.
    const prefix = 'https://www.jdoqocy.com/click-101759456-17277211?url=';
    expect(cart.startsWith(prefix)).toBe(true);
    expect(product.startsWith(prefix)).toBe(true);
    const dest = decodeURIComponent(new URL(cart).searchParams.get('url') ?? '');
    expect(dest).toBe('https://perfumania.com/cart/31838706237573:1');
  });

  it('keeps huge Shopify variant ids exact (beyond int32)', () => {
    const url = cjCartUrl(41671494533253);
    expect(url).toContain(encodeURIComponent('41671494533253:1'));
  });
});

describe('ETL clobber guard (Mark Z P0 #1)', () => {
  const product: AffiliateProduct = {
    brand: 'Cuba', name: 'Red', concentration: null, gender: 'masculine',
    image_url: '', affiliate_url: 'https://example.com/p', price_cents: 499,
    retailer_id: 'perfumania', source_id: '123',
    checkout_url: 'https://example.com/cart', checkout_variant_id: 42,
  };

  it('a non-managing ETL emits NO checkout keys — PostgREST leaves the columns untouched', () => {
    const row = buildLinkRow('frag-1', product, false);
    expect('checkout_url' in row).toBe(false);
    expect('checkout_variant_id' in row).toBe(false);
  });

  it('the managing ETL writes the permalink', () => {
    const row = buildLinkRow('frag-1', product, true);
    expect(row.checkout_url).toBe('https://example.com/cart');
    expect(row.checkout_variant_id).toBe(42);
  });

  it('the managing ETL clears a stale permalink with explicit null', () => {
    const row = buildLinkRow('frag-1', { ...product, checkout_url: null, checkout_variant_id: null }, true);
    expect(row.checkout_url).toBeNull();
    expect(row.checkout_variant_id).toBeNull();
  });
});

describe('primary CTA row ranking (Mark Z #3)', () => {
  it('checkout-capable rows beat higher-priced rows without a permalink', () => {
    const ranked = rankBuyLinks([
      { retailer: 'fragranceshop', price_cents: 9900, checkout_url: null },
      { retailer: 'perfumania', price_cents: 499, checkout_url: CHECKOUT_URL },
    ]);
    expect(ranked[0].retailer).toBe('perfumania');
  });

  it('within the same tier, higher price wins (monetization-first, matches the store)', () => {
    const ranked = rankBuyLinks([
      { retailer: 'a', price_cents: 499, checkout_url: CHECKOUT_URL },
      { retailer: 'b', price_cents: 9900, checkout_url: CHECKOUT_URL },
    ]);
    expect(ranked[0].retailer).toBe('b');
  });

  it('is deterministic for null prices (they rank last)', () => {
    const ranked = rankBuyLinks([
      { retailer: 'a', price_cents: null, checkout_url: null },
      { retailer: 'b', price_cents: 100, checkout_url: null },
    ]);
    expect(ranked[0].retailer).toBe('b');
  });
});
