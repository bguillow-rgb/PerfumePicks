/**
 * Build src/mock/fragrances.ts from the Fragrantica scrape output.
 *
 * Reads every scripts/data/frag-*-raw.json, filters to fragrances with at
 * least one extracted note (skips data-poor entries), normalizes accord
 * intensity to a stable subset, computes derived scores, picks similar
 * fragrances by accord overlap, and writes the result as a TS module that
 * matches the existing MockFragrance interface.
 *
 * Idempotent — safe to re-run after every scraper batch.
 *
 * Usage:
 *   npx tsx scripts/build-mock-from-fragrantica.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { CandidateFragrance } from './types';

const DATA_DIR = path.join(__dirname, 'data');
const OUT_PATH = path.join(__dirname, '..', 'src', 'mock', 'fragrances.ts');

// Map Fragrantica's free-form accord labels to a controlled vocabulary the
// app already uses. Anything not in this map gets passed through as-is.
const ACCORD_NORMALIZE: Record<string, string> = {
  'amber':            'amber',
  'sweet':            'sweet',
  'woody':            'woody',
  'powdery':          'powdery',
  'citrus':           'citrus',
  'floral':           'floral',
  'white floral':     'floral',
  'yellow floral':    'floral',
  'green floral':     'floral',
  'fruity':           'fruity',
  'fresh':            'fresh',
  'fresh spicy':      'fresh-spicy',
  'aromatic':         'aromatic',
  'warm spicy':       'warm-spicy',
  'soft spicy':       'soft-spicy',
  'spicy':            'warm-spicy',
  'leather':          'leather',
  'tobacco':          'tobacco',
  'vanilla':          'vanilla',
  'iris':             'iris',
  'rose':             'rose',
  'jasmine':          'jasmine',
  'oud':              'oud',
  'gourmand':         'gourmand',
  'caramel':          'gourmand',
  'honey':            'sweet',
  'almond':           'almond',
  'coconut':          'gourmand',
  'musky':            'musky',
  'animalic':         'animalic',
  'smoky':            'smoky',
  'aldehydic':        'powdery',
  'patchouli':        'patchouli',
  'cedar':            'cedar',
  'sandalwood':       'sandalwood',
  'aquatic':          'aquatic',
  'mineral':          'mineral',
  'salty':            'mineral',
  'ozonic':           'aquatic',
  'lavender':         'lavender',
  'herbal':           'aromatic',
  'tea':              'tea',
  'earthy':           'earthy',
  'mossy':            'earthy',
  'green':            'green',
  'cool spicy':       'fresh-spicy',
  'violet':           'iris',
};

interface MockOutput {
  id: string;
  brand: string;
  name: string;
  concentration: 'parfum' | 'edp' | 'edt' | 'cologne' | 'extrait';
  fragrance_family: string;
  gender: 'feminine' | 'masculine' | 'unisex';
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  top_accords: string[];
  accord_intensity: Record<string, number>;
  community_longevity: number;
  community_sillage: number;
  community_projection: number;
  compliment_score: number;
  versatility_score: number;
  office_safe_score: number;
  price_tier: number;
  retail_msrp_usd_cents: number;
  image_url: string;
  similar_ids: string[];
  release_year: number;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeAccord(raw: string): string {
  const k = raw.trim().toLowerCase();
  return ACCORD_NORMALIZE[k] ?? k.replace(/\s+/g, '-');
}

/** Heuristic price tier from brand alone — Fragrantica doesn't carry MSRP.
 *  Tier 1 = mass, 5 = ultra-luxury. */
function priceTierForBrand(brand: string): number {
  const b = brand.toLowerCase();
  if (b.includes('kurkdjian') || b.includes('creed') || b.includes('le labo') ||
      b.includes('byredo') || b.includes('kilian') || b.includes('amouage') ||
      b.includes('frederic malle')) return 5;
  if (b.includes('tom ford') || b.includes('chanel') || b.includes('dior') ||
      b.includes('hermès') || b.includes('hermes') || b.includes('guerlain') ||
      b.includes('aerin') || b.includes('memo')) return 4;
  if (b.includes('jo malone') || b.includes('diptyque') || b.includes('saint laurent') ||
      b.includes('valentino') || b.includes('versace')) return 4;
  return 3;
}

/** Heuristic 50ml MSRP from price tier (rough; placeholder until real prices wired). */
function msrpFromTier(tier: number): number {
  return ({ 1: 4000, 2: 8000, 3: 12000, 4: 18000, 5: 30000 } as Record<number, number>)[tier] ?? 12000;
}

/** Crude family inference from accords — Fragrantica's family field needs a
 *  separate scrape pass which we skipped. Map dominant accord → family. */
function familyFromAccords(accords: string[]): string {
  if (!accords.length) return 'oriental';
  const set = new Set(accords);
  if (set.has('floral') || set.has('rose') || set.has('jasmine') || set.has('iris')) return 'floral';
  if (set.has('woody') || set.has('cedar') || set.has('sandalwood') || set.has('oud')) return 'woody';
  if (set.has('gourmand') || set.has('vanilla') || set.has('sweet') || set.has('almond')) return 'gourmand';
  if (set.has('fresh') || set.has('citrus') || set.has('aquatic') || set.has('green')) return 'fresh';
  if (set.has('amber') || set.has('warm-spicy') || set.has('tobacco') || set.has('oriental')) return 'oriental';
  if (set.has('leather')) return 'leather';
  return 'oriental';
}

/** Compliment / versatility / office_safe heuristics from accord profile. */
function deriveScores(accords: string[]): { compliment: number; versatility: number; office_safe: number } {
  const set = new Set(accords);
  let compliment = 0.65;
  let versatility = 0.6;
  let office_safe = 0.6;

  if (set.has('sweet') || set.has('vanilla') || set.has('gourmand')) compliment += 0.15;
  if (set.has('rose') || set.has('jasmine') || set.has('amber')) compliment += 0.1;
  if (set.has('fresh') || set.has('citrus')) { versatility += 0.15; office_safe += 0.2; }
  if (set.has('powdery') || set.has('iris')) { office_safe += 0.15; }
  if (set.has('oud') || set.has('leather') || set.has('smoky')) office_safe -= 0.25;
  if (set.has('animalic')) office_safe -= 0.3;
  if (set.has('warm-spicy') || set.has('tobacco')) office_safe -= 0.1;

  const clamp = (n: number) => Math.max(0.1, Math.min(0.98, Number(n.toFixed(2))));
  return { compliment: clamp(compliment), versatility: clamp(versatility), office_safe: clamp(office_safe) };
}

/** Performance defaults (Fragrantica's slider data needs a separate scrape;
 *  we use sensible mid-range defaults for now). */
function defaultPerf(brand: string): { longevity: number; sillage: number; projection: number } {
  // Niche houses tend to publish stronger longevity than designer; tiny tilt.
  const niche = priceTierForBrand(brand) >= 5;
  return {
    longevity: niche ? 4.0 : 3.6,
    sillage: niche ? 3.8 : 3.4,
    projection: niche ? 3.7 : 3.3,
  };
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

function pickSimilar(target: MockOutput, all: MockOutput[]): string[] {
  return all
    .filter((f) => f.id !== target.id)
    .map((f) => ({ id: f.id, score: jaccard(target.top_accords, f.top_accords) * 0.6 + jaccard(target.heart_notes, f.heart_notes) * 0.4 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((s) => s.id);
}

function main() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith('frag-') && f.endsWith('-raw.json'));
  if (!files.length) {
    console.error('No frag-*-raw.json files found. Run scrape-fragrantica.ts first.');
    process.exit(1);
  }

  // Load + filter to entries with at least 1 note OR 3 accords (any data).
  const all: CandidateFragrance[] = [];
  for (const f of files) {
    const rows: CandidateFragrance[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
    all.push(...rows);
  }
  const usable = all.filter((r) =>
    (r.top_notes.length + r.heart_notes.length + r.base_notes.length) > 0 ||
    r.top_accords.length >= 3,
  );
  console.log(`Loaded ${all.length} raw → ${usable.length} usable rows`);

  // Convert to MockOutput shape.
  const seenIds = new Set<string>();
  const mocks: MockOutput[] = [];
  for (const r of usable) {
    const id = `${slugify(r.brand)}-${slugify(r.name)}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const accords = Array.from(new Set(r.top_accords.map(normalizeAccord))).slice(0, 6);
    const accord_intensity: Record<string, number> = {};
    for (const a of accords) {
      // Find original key matching this normalized form
      const orig = Object.entries(r.accord_intensity).find(([k]) => normalizeAccord(k) === a);
      accord_intensity[a] = orig ? orig[1] : 3;
    }
    const family = familyFromAccords(accords);
    const tier = priceTierForBrand(r.brand);
    const scores = deriveScores(accords);
    const perf = defaultPerf(r.brand);
    mocks.push({
      id,
      brand: r.brand,
      name: r.name,
      concentration: (r.concentration as MockOutput['concentration']) ?? 'edp',
      fragrance_family: family,
      gender: (r.gender as MockOutput['gender']) ?? 'unisex',
      top_notes: r.top_notes.slice(0, 6),
      heart_notes: r.heart_notes.slice(0, 6),
      base_notes: r.base_notes.slice(0, 6),
      top_accords: accords,
      accord_intensity,
      community_longevity: r.community_longevity ?? perf.longevity,
      community_sillage: r.community_sillage ?? perf.sillage,
      community_projection: r.community_projection ?? perf.projection,
      compliment_score: scores.compliment,
      versatility_score: scores.versatility,
      office_safe_score: scores.office_safe,
      price_tier: tier,
      retail_msrp_usd_cents: msrpFromTier(tier),
      image_url: r.image_url ?? '',
      similar_ids: [],
      release_year: r.release_year ?? 2020,
    });
  }
  console.log(`Built ${mocks.length} unique fragrances (deduped by id)`);

  // Now compute similar_ids in a second pass (needs the full set).
  for (const m of mocks) {
    m.similar_ids = pickSimilar(m, mocks);
  }

  // Pick "feature" rotation — surface fragrances with the richest data first
  // so the home screen stays high-quality regardless of catalog size.
  const featured = [...mocks]
    .sort((a, b) =>
      (b.top_notes.length + b.heart_notes.length + b.base_notes.length) -
      (a.top_notes.length + a.heart_notes.length + a.base_notes.length))
    .slice(0, 12);

  const heroId = featured[0]?.id ?? mocks[0]?.id;
  const todaysEdit = featured.slice(1, 4).map((f) => f.id);
  const newArrivals = [...mocks]
    .sort((a, b) => b.release_year - a.release_year)
    .slice(0, 6)
    .map((f) => f.id);
  const trending = featured.slice(0, 8).map((f) => f.id);

  // Brands list + curated edits picked from the strongest-data subset.
  const allBrands = Array.from(new Set(mocks.map((m) => m.brand))).sort();
  const sampleByMatch = (matcher: (m: MockOutput) => number) =>
    [...mocks].sort((a, b) => matcher(b) - matcher(a)).slice(0, 6).map((f) => f.id);
  const curatedEdits = [
    { id: 'boudoir',    label: 'Boudoir',    ids: sampleByMatch((m) => (m.top_accords.includes('amber') ? 2 : 0) + (m.top_accords.includes('sweet') ? 1 : 0) + m.compliment_score) },
    { id: 'office',     label: 'Office',     ids: sampleByMatch((m) => m.office_safe_score * 2 + (m.top_accords.includes('fresh') ? 1 : 0)) },
    { id: 'date-night', label: 'Date Night', ids: sampleByMatch((m) => m.compliment_score + (m.top_accords.includes('rose') ? 0.4 : 0)) },
    { id: 'summer',     label: 'Summer',     ids: sampleByMatch((m) => (m.top_accords.includes('citrus') ? 1.5 : 0) + (m.top_accords.includes('fresh') ? 1.2 : 0) + (m.top_accords.includes('aquatic') ? 1 : 0)) },
    { id: 'winter',     label: 'Winter',     ids: sampleByMatch((m) => (m.top_accords.includes('amber') ? 1.5 : 0) + (m.top_accords.includes('warm-spicy') ? 1.2 : 0) + (m.top_accords.includes('vanilla') ? 1 : 0) + (m.top_accords.includes('oud') ? 1 : 0)) },
  ];

  // Sample wardrobe — top 6 by data richness, mark first 4 as "have", last 2
  // as "want"/"tested". Sizes/remaining are demo values.
  const sampleWardrobe = featured.slice(0, 6).map((f, idx) => {
    const sizes = [100, 50, 35, 50, 50, 1.5];
    const rems  = [64, 18, 30, 8, 50, 0];
    const stats = ['have', 'have', 'have', 'have', 'want', 'tested'] as const;
    return { id: f.id, status: stats[idx], size_ml: sizes[idx], remaining_ml: rems[idx] };
  });

  // Emit the TS module.
  const ts = `// AUTO-GENERATED by scripts/build-mock-from-fragrantica.ts.
// Do NOT edit by hand — re-run the generator to refresh.
//
// Source: scripts/data/frag-*-raw.json (Fragrantica scrape output)
// Records: ${mocks.length}
// Generated: ${new Date().toISOString()}

export interface MockFragrance {
  id: string;
  brand: string;
  name: string;
  concentration: 'parfum' | 'edp' | 'edt' | 'cologne' | 'extrait';
  fragrance_family: string;
  gender: 'feminine' | 'masculine' | 'unisex';
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  top_accords: string[];
  accord_intensity: Record<string, number>;
  community_longevity: number;
  community_sillage: number;
  community_projection: number;
  compliment_score: number;
  versatility_score: number;
  office_safe_score: number;
  price_tier: number;
  retail_msrp_usd_cents: number;
  image_url: string;
  similar_ids: string[];
  dupe_of?: string | null;
  release_year: number;
}

export const MOCK_CATALOG: MockFragrance[] = ${JSON.stringify(mocks, null, 2)};

export const HERO_PICK_ID = ${JSON.stringify(heroId)};
export const TODAYS_EDIT_IDS = ${JSON.stringify(todaysEdit)};
export const NEW_ARRIVAL_IDS = ${JSON.stringify(newArrivals)};
export const TRENDING_IDS = ${JSON.stringify(trending)};

export const SAMPLE_WARDROBE_IDS: { id: string; status: 'have' | 'want' | 'tested' | 'sold_on'; size_ml: number; remaining_ml: number }[] = ${JSON.stringify(sampleWardrobe, null, 2)};

export function getFragrance(id: string): MockFragrance | undefined {
  return MOCK_CATALOG.find((f) => f.id === id);
}

export function getFragrances(ids: string[]): MockFragrance[] {
  return ids.map((id) => getFragrance(id)).filter((f): f is MockFragrance => !!f);
}

export const ALL_BRANDS = ${JSON.stringify(allBrands)};

export const CURATED_EDITS = ${JSON.stringify(curatedEdits, null, 2)};
`;

  fs.writeFileSync(OUT_PATH, ts);
  console.log(`Wrote ${OUT_PATH} (${ts.length} bytes, ${mocks.length} fragrances)`);
}

main();
