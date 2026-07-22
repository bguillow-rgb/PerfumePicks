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

describe('cart permalink shape (mirrors the ETL builder)', () => {
  // The ETL's cjCartUrl is a script (not importable into the app bundle), so we
  // pin the CONTRACT here: same CJ wrapper as the product link, destination is
  // the /cart/{variant}:1 permalink, variant id survives URL-encoding intact.
  function cjCartUrl(variantId: number): string {
    const dest = encodeURIComponent(`https://perfumania.com/cart/${variantId}:1`);
    return `https://www.jdoqocy.com/click-101759456-17277211?url=${dest}`;
  }

  it('wraps the cart permalink in the same CJ click wrapper as product links', () => {
    const url = cjCartUrl(31838706237573);
    expect(url.startsWith('https://www.jdoqocy.com/click-101759456-17277211?url=')).toBe(true);
    const dest = decodeURIComponent(new URL(url).searchParams.get('url') ?? '');
    expect(dest).toBe('https://perfumania.com/cart/31838706237573:1');
  });

  it('keeps huge Shopify variant ids exact (beyond int32)', () => {
    const url = cjCartUrl(41671494533253);
    expect(url).toContain(encodeURIComponent('41671494533253:1'));
  });
});
