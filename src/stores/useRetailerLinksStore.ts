import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Tracks which fragrance slugs have buy links + their cheapest price.
 * Loaded once per session. CompactCard reads from this to show a buy pill.
 */
interface RetailerLinksState {
  /** slug → cheapest price_cents */
  priceBySlug: Map<string, number>;
  loaded: boolean;
  load: () => Promise<void>;
  getPrice: (slug: string) => number | null;
}

export const useRetailerLinksStore = create<RetailerLinksState>((set, get) => ({
  priceBySlug: new Map(),
  loaded: false,

  load: async () => {
    if (get().loaded || !isSupabaseConfigured) return;
    // Paginate through all rows (7,000+).
    const PAGE = 2000;
    const map = new Map<string, number>();
    let offset = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from('fragrance_retailer_links')
        .select('price_cents, fragrances!inner(slug)')
        .not('price_cents', 'is', null)
        .range(offset, offset + PAGE - 1);
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
        const existing = map.get(slug);
        if (existing === undefined || price < existing) map.set(slug, price);
      }
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    console.log('[retailer-links] loaded', map.size, 'entries');
    set({ priceBySlug: map, loaded: true });
  },

  getPrice: (slug) => get().priceBySlug.get(slug) ?? null,
}));
