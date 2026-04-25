/**
 * Shared types for the scraper / enrich / insert pipeline.
 * One canonical row shape, used at every stage.
 */

export type Concentration =
  | 'parfum'
  | 'edp'
  | 'edt'
  | 'cologne'
  | 'extrait'
  | 'oil'
  | 'solid'
  | 'mist';

export type Gender = 'feminine' | 'masculine' | 'unisex';

export interface PriceOption {
  retailer: string;        // 'sephora','nordstrom','tomford-direct','luckyscent','fragrancex'
  size_ml: number;
  price_usd_cents: number;
  is_decant: boolean;
  url?: string;
  in_stock?: boolean;
}

export interface CandidateFragrance {
  // Identity (required to dedupe)
  brand: string;
  name: string;
  release_year: number | null;

  // Catalog metadata
  concentration: Concentration | null;
  fragrance_family: string | null;
  gender: Gender | null;

  // Notes pyramid
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];

  // Accords (filled by Fragrantica scrape OR LLM enrichment)
  top_accords: string[];
  accord_intensity: Record<string, number>;  // 1..5

  // Performance (community)
  community_longevity: number | null;        // 0..5
  community_sillage: number | null;          // 0..5
  community_projection: number | null;       // 0..5

  // Derived scores (LLM-filled)
  compliment_score: number | null;           // 0..1
  versatility_score: number | null;          // 0..1
  office_safe_score: number | null;          // 0..1

  // Pricing
  price_tier: number | null;                 // 1..5
  retail_msrp_usd_cents: number | null;      // headline 50ml MSRP
  prices: PriceOption[];

  // Imagery + provenance
  image_url: string | null;
  source: string;                            // primary source id
  source_url: string | null;
  sources: string[];                         // all sources merged into this row
}

/** Stable key for dedupe across sources (brand + name, normalized). */
export function candidateKey(r: { brand: string; name: string }): string {
  return `${normalize(r.brand)}|${normalize(r.name)}`;
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics (Hermès → hermes)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
