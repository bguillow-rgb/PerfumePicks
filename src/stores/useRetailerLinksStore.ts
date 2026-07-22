import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { BuyableLink } from '@/src/features/dna/score';

/**
 * Tracks which fragrance slugs have buy links + their prices.
 * Loaded once per session.
 *
 * Two indexes, both built in a single pagination pass:
 *   - priceBySlug  — CHEAPEST price_cents per slug. Powers the CompactCard buy
 *     pill (lowest price wins for a "from $X" affordance). Unchanged behaviour:
 *     every row with a non-null price_cents counts, regardless of stock/status.
 *   - buyableBySlug — the monetizable affiliate link per slug, gated to rows that
 *     are actually purchasable (link_status='ok' AND in_stock AND price_cents
 *     not null). The representative row is the HIGHEST-priced such row, paired
 *     with its url, so the DNA top-match sort and the displayed price/label use
 *     ONE consistent number that matches the link we open. Feeds
 *     rankBuyableMatches (affiliate-first, most-expensive-first).
 */
interface RetailerLinksState {
  /** slug → cheapest price_cents */
  priceBySlug: Map<string, number>;
  /** slug → highest-priced in-stock affiliate link (price + url) */
  buyableBySlug: Map<string, BuyableLink>;
  loaded: boolean;
  load: () => Promise<void>;
  getPrice: (slug: string) => number | null;
  getBuyable: (slug: string) => BuyableLink | null;
}

export const useRetailerLinksStore = create<RetailerLinksState>((set, get) => ({
  priceBySlug: new Map(),
  buyableBySlug: new Map(),
  loaded: false,

  load: async () => {
    if (get().loaded || !isSupabaseConfigured) return;
    // Paginate through all rows (7,000+).
    const PAGE = 2000;
    const priceMap = new Map<string, number>();
    const buyableMap = new Map<string, BuyableLink>();
    let offset = 0;
    // Checkout 2.0's checkout_url column may not exist yet (OTA can land before
    // the migration is pasted; the unknown-column error must NOT nuke prices/
    // buy links app-wide). Detect once and fall back to the pre-2.0 select.
    let includeCheckout = true;
    while (true) {
      type PageResult = { data: any[] | null; error: { message: string } | null };
      const fetchPage = (withCheckoutCol: boolean): PromiseLike<PageResult> =>
        supabase
          .from('fragrance_retailer_links')
          .select(
            withCheckoutCol
              ? 'price_cents, url, checkout_url, retailer, in_stock, link_status, fragrances!inner(slug)'
              : 'price_cents, url, retailer, in_stock, link_status, fragrances!inner(slug)',
          )
          .not('price_cents', 'is', null)
          .range(offset, offset + PAGE - 1) as unknown as PromiseLike<PageResult>;
      let { data: page, error } = await fetchPage(includeCheckout);
      if (error && includeCheckout && /checkout_url/.test(error.message)) {
        includeCheckout = false;
        ({ data: page, error } = await fetchPage(false));
      }
      if (error) {
        // Bail WITHOUT marking loaded — a network blip mid-pagination must not
        // leave a partial price map cached for the session. Allow a retry on the
        // next mount rather than showing permanently-wrong/missing prices.
        console.warn('[retailer-links] load failed, will retry:', error.message);
        return;
      }
      if (!page || page.length === 0) break;
      for (const r of page as any[]) {
        const slug = r.fragrances?.slug;
        const price = r.price_cents as number;
        if (!slug) continue;

        // Cheapest-price index (unchanged): every non-null-price row.
        const existing = priceMap.get(slug);
        if (existing === undefined || price < existing) priceMap.set(slug, price);

        // Buyable index: only genuinely purchasable rows, keyed to the
        // highest-priced one (monetization-first), paired with its url.
        const buyable = r.link_status === 'ok' && r.in_stock === true && !!r.url;
        if (buyable) {
          const cur = buyableMap.get(slug);
          if (cur === undefined || price > cur.priceCents) {
            buyableMap.set(slug, {
              priceCents: price,
              url: r.url as string,
              // Checkout 2.0: same row's cart permalink (null for retailers
              // that can't build one — handleAffiliateClick falls back).
              checkoutUrl: (r.checkout_url as string | null) ?? null,
              retailer: (r.retailer as string) ?? '',
            });
          }
        }
      }
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    console.log(
      '[retailer-links] loaded',
      priceMap.size,
      'priced /',
      buyableMap.size,
      'buyable',
    );
    set({ priceBySlug: priceMap, buyableBySlug: buyableMap, loaded: true });
  },

  getPrice: (slug) => get().priceBySlug.get(slug) ?? null,
  getBuyable: (slug) => get().buyableBySlug.get(slug) ?? null,
}));
