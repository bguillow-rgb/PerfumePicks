// Module-level cache of brand_logos (seeded by scripts/seed-brand-logos.ts).
//
// Dataset is tiny (~359 rows of brand + url) and read-only from the client's
// perspective, so a single in-memory Map populated once per app session beats
// a full Zustand store. `loadBrandLogos()` is called from app/_layout.tsx at
// boot; subsequent `getBrandLogo()` lookups are synchronous and return null
// if the table hasn't loaded yet (CigarImage falls through to placeholder in
// that case — first-paint grace).
//
// If the fetch fails, callers see an empty cache — the app continues to
// render placeholders rather than erroring out. We never throw to the UI.

import { supabase } from '@/lib/supabase';

const cache = new Map<string, string>();
let loadPromise: Promise<void> | null = null;
let loaded = false;

export async function loadBrandLogos(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { data, error } = await supabase.from('brand_logos').select('brand, logo_url');
      if (error || !data) return;
      for (const r of data) {
        if (r.brand && r.logo_url) cache.set(String(r.brand).trim(), String(r.logo_url));
      }
      loaded = true;
    } catch {
      // Silent — no-op fallback to placeholder if the table/migration isn't
      // live yet. Never block app boot on this.
    }
  })();
  return loadPromise;
}

export function getBrandLogo(brand: string | null | undefined): string | null {
  if (!brand) return null;
  return cache.get(brand.trim()) ?? null;
}

export function isBrandLogoCacheLoaded(): boolean {
  return loaded;
}
