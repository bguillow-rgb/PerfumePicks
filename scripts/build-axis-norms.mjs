/**
 * DNA V3 — M0 axis-norm generator.
 *
 * Pulls the FULL is_active catalog and computes percentile tables for the
 * catalog-derived taste axes defined in FEATURE_ARCHETYPES_V2.md, then writes
 * the generated, committed file src/features/dna/axisNorms.ts.
 *
 * 12 of the 14 axes are catalog-derived (norms emitted here). The other two —
 * breadth (family entropy across a user's picks) and loyalty (signature
 * outcome + wardrobe tightness) — are user-behavior axes with no catalog
 * distribution; they are documented in the generated file as user-relative.
 *
 * Raw-score definitions (kept in sync with the axis table in
 * FEATURE_ARCHETYPES_V2.md):
 *   warmth           sum(warm accords: amber/spicy/warm-spicy/vanilla)
 *                    − sum(fresh accords: fresh/citrus/aquatic)
 *   sweetness        sum(sweet/vanilla/gourmand accords) + 2 if family=gourmand
 *   florality        sum(floral/rose/jasmine/powdery/white-floral accords)
 *                    + 2 if family=floral
 *   presence         mean of available: community_projection, community_sillage,
 *                    mean(accord_intensity values)
 *   luxury           retail_msrp_usd_cents (missing → imputed from the median
 *                    msrp of the bottle's price_tier)
 *   adventurousness  6 − popularity_tier (higher = less popular = more adventurous)
 *   era              release_year
 *   greenness        sum(green/earthy/aromatic accords)
 *   darkness         sum(leather/tobacco/oud/smoky accords)
 *   spice            sum(spicy/warm-spicy accords)
 *   value            (1 − luxury percentile) × versatility_score
 *   genderLean       masculine=0, unisex=0.5, feminine=1
 *
 * Accord weights come from accord_intensity[k] (1-5) when the map is non-empty,
 * else from top_accords position (first ≈ 4, decaying 0.5/slot, floor 1).
 *
 * Run:  node scripts/build-axis-norms.mjs
 * Read-only against prod; the only output is the generated TS file.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

// ── env ──
const envPath = new URL('../.env.local', import.meta.url);
for (const l of readFileSync(envPath, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const SB = process.env.EXPO_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) { console.error('Missing SUPABASE_URL / SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const OUT_PATH = fileURLToPath(new URL('../src/features/dna/axisNorms.ts', import.meta.url));
const PAGE = 1000;
const SEL = 'id,top_accords,accord_intensity,fragrance_family,gender,popularity_tier,price_tier,retail_msrp_usd_cents,versatility_score,release_year,community_projection,community_sillage';

async function fetchCatalog() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${SB}/rest/v1/fragrances?select=${SEL}&is_active=eq.true&order=id.asc`, {
      headers: { ...H, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!r.ok) { console.error(`catalog fetch failed: ${r.status}`); process.exit(1); }
    const page = await r.json();
    rows.push(...page);
    process.stdout.write(`\r  fetched ${rows.length} rows...`);
    if (page.length < PAGE) break;
  }
  console.log();
  return rows;
}

// ── accord scoring ──
const norm = (s) => String(s).trim().toLowerCase();
function accordWeights(row) {
  const ai = row.accord_intensity ?? {};
  if (Object.keys(ai).length > 0) {
    const w = {};
    for (const [k, v] of Object.entries(ai)) if (typeof v === 'number') w[norm(k)] = v;
    return w;
  }
  const ta = row.top_accords ?? [];
  if (ta.length > 0) {
    const w = {};
    ta.forEach((k, i) => { w[norm(k)] = Math.max(1, 4 - i * 0.5); });
    return w;
  }
  return null; // no accord data
}
const sumOf = (w, keys) => keys.reduce((s, k) => s + (w[k] ?? 0), 0);

const WARM = ['amber', 'spicy', 'warm-spicy', 'vanilla'];
const FRESH = ['fresh', 'citrus', 'aquatic'];
const SWEET = ['sweet', 'vanilla', 'gourmand'];
const FLORAL = ['floral', 'rose', 'jasmine', 'powdery', 'white-floral'];
const GREEN = ['green', 'earthy', 'aromatic'];
const DARK = ['leather', 'tobacco', 'oud', 'smoky'];
const SPICE = ['spicy', 'warm-spicy'];

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }

// percentile of `x` within sorted array `sorted` (mean rank of <, ≤) in [0,1]
function pctIn(sorted, x) {
  let lo = 0, hi = sorted.length;
  // lower bound
  let a = 0, b = sorted.length;
  while (a < b) { const m = (a + b) >> 1; if (sorted[m] < x) a = m + 1; else b = m; }
  lo = a;
  a = 0; b = sorted.length;
  while (a < b) { const m = (a + b) >> 1; if (sorted[m] <= x) a = m + 1; else b = m; }
  hi = a;
  return sorted.length ? ((lo + hi) / 2) / sorted.length : 0.5;
}

function quantileTable(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0], max = sorted[n - 1];
  const span = max - min || 1;
  const q = [];
  for (let i = 0; i <= 100; i++) {
    const pos = (i / 100) * (n - 1);
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    const v = sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    q.push(Number(((v - min) / span).toFixed(4)));
  }
  return { n, min: Number(min.toFixed(4)), max: Number(max.toFixed(4)), quantiles: q };
}

async function main() {
  console.log('Fetching full is_active catalog...');
  const rows = await fetchCatalog();
  console.log(`catalog size: ${rows.length}`);

  const dist = {
    warmth: [], sweetness: [], florality: [], presence: [], luxury: [],
    adventurousness: [], era: [], greenness: [], darkness: [], spice: [],
    value: [], genderLean: [],
  };

  // First pass — everything except `value` (which needs the luxury distribution)
  const luxuryByTier = {}; // tier -> msrp[] for imputation
  for (const r of rows) {
    if (r.retail_msrp_usd_cents != null && r.price_tier != null) {
      (luxuryByTier[r.price_tier] ??= []).push(r.retail_msrp_usd_cents);
    }
  }
  const tierMedian = {};
  for (const [tier, xs] of Object.entries(luxuryByTier)) {
    const s = xs.sort((a, b) => a - b);
    tierMedian[tier] = s[Math.floor(s.length / 2)];
  }

  const luxuryRawOf = (r) => {
    if (r.retail_msrp_usd_cents != null) return r.retail_msrp_usd_cents;
    if (r.price_tier != null && tierMedian[r.price_tier] != null) return tierMedian[r.price_tier];
    return null;
  };

  for (const r of rows) {
    const w = accordWeights(r);
    if (w) {
      dist.warmth.push(sumOf(w, WARM) - sumOf(w, FRESH));
      dist.sweetness.push(sumOf(w, SWEET) + (r.fragrance_family === 'gourmand' ? 2 : 0));
      dist.florality.push(sumOf(w, FLORAL) + (r.fragrance_family === 'floral' ? 2 : 0));
      dist.greenness.push(sumOf(w, GREEN));
      dist.darkness.push(sumOf(w, DARK));
      dist.spice.push(sumOf(w, SPICE));
    }

    const presenceParts = [];
    if (r.community_projection != null) presenceParts.push(r.community_projection);
    if (r.community_sillage != null) presenceParts.push(r.community_sillage);
    const ai = r.accord_intensity ?? {};
    const aiVals = Object.values(ai).filter((v) => typeof v === 'number');
    if (aiVals.length) presenceParts.push(mean(aiVals));
    if (presenceParts.length) dist.presence.push(mean(presenceParts));

    const lux = luxuryRawOf(r);
    if (lux != null) dist.luxury.push(lux);
    if (r.popularity_tier != null) dist.adventurousness.push(6 - r.popularity_tier);
    if (r.release_year != null) dist.era.push(r.release_year);
    if (r.gender === 'masculine') dist.genderLean.push(0);
    else if (r.gender === 'unisex') dist.genderLean.push(0.5);
    else if (r.gender === 'feminine') dist.genderLean.push(1);
  }

  // Second pass — value = (1 − luxury percentile) × versatility_score
  const luxSorted = [...dist.luxury].sort((a, b) => a - b);
  for (const r of rows) {
    const lux = luxuryRawOf(r);
    if (lux == null || r.versatility_score == null) continue;
    dist.value.push((1 - pctIn(luxSorted, lux)) * r.versatility_score);
  }

  const norms = {};
  for (const [axis, values] of Object.entries(dist)) {
    if (!values.length) { console.error(`axis ${axis}: NO VALUES — aborting`); process.exit(1); }
    norms[axis] = quantileTable(values);
    console.log(`  ${axis.padEnd(16)} n=${String(norms[axis].n).padStart(5)}  raw range [${norms[axis].min}, ${norms[axis].max}]`);
  }

  const generatedAt = new Date().toISOString().slice(0, 10);
  const body = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Catalog-wide axis percentile tables for the DNA V3 centroid engine
 * (FEATURE_ARCHETYPES_V2.md). Regenerate with:
 *
 *   node scripts/build-axis-norms.mjs
 *
 * Generated ${generatedAt} from ${rows.length} is_active catalog rows.
 *
 * 12 of the 14 DNA axes are catalog-derived and have norms here. The other
 * two are USER-RELATIVE — computed from the shape of a user's own picks, with
 * no catalog distribution:
 *   - breadth: family entropy across the user's picks
 *   - loyalty: signature outcome + wardrobe tightness
 *
 * Each table stores min/max of the raw axis score plus 101 quantile
 * breakpoints (p0..p100) of the min-max-normalized distribution, all in
 * [0, 1] and monotonically non-decreasing. Map a bottle's raw score to its
 * catalog percentile with axisPercentile().
 */

export const CATALOG_AXES = [
  'warmth',
  'sweetness',
  'florality',
  'presence',
  'luxury',
  'adventurousness',
  'era',
  'greenness',
  'darkness',
  'spice',
  'value',
  'genderLean',
] as const;

export type CatalogAxis = (typeof CATALOG_AXES)[number];

/** Axes with no catalog norm — scored relative to the user's own pick set. */
export const USER_RELATIVE_AXES = ['breadth', 'loyalty'] as const;

export type UserRelativeAxis = (typeof USER_RELATIVE_AXES)[number];

export type DnaAxis = CatalogAxis | UserRelativeAxis;

export interface AxisNorm {
  /** number of catalog rows the distribution was computed from */
  n: number;
  /** raw-score min across the catalog */
  min: number;
  /** raw-score max across the catalog */
  max: number;
  /** p0..p100 of the min-max-normalized raw scores, each in [0,1], non-decreasing */
  quantiles: readonly number[];
}

export const AXIS_NORMS: Record<CatalogAxis, AxisNorm> = ${JSON.stringify(norms, null, 2)};

/**
 * Map a bottle's raw axis score to its catalog percentile in [0, 1].
 *
 * Uses the mean-rank convention for ties: when a large share of the catalog
 * shares the same score (e.g. darkness = 0 for most bottles), a bottle with
 * that score sits at the MIDDLE of the tied block, not its edge. Raw scores
 * outside the observed catalog range clamp to the range first.
 */
export function axisPercentile(axis: CatalogAxis, raw: number): number {
  const { min, max, quantiles } = AXIS_NORMS[axis];
  if (max === min) return 0.5;
  const x = Math.min(1, Math.max(0, (raw - min) / (max - min)));
  const last = quantiles.length - 1;

  // first index with quantiles[i] >= x
  let a = 0;
  let b = last;
  while (a < b) {
    const mid = (a + b) >> 1;
    if (quantiles[mid] >= x) b = mid;
    else a = mid + 1;
  }
  const firstGE = a;

  if (quantiles[firstGE] > x) {
    // x falls strictly between breakpoints firstGE-1 and firstGE — interpolate
    const loQ = quantiles[firstGE - 1];
    const hiQ = quantiles[firstGE];
    const frac = (x - loQ) / (hiQ - loQ);
    return (firstGE - 1 + frac) / last;
  }

  // exact hit — find last index with quantiles[i] <= x, return the tied-block midpoint
  a = firstGE;
  b = last;
  while (a < b) {
    const mid = (a + b + 1) >> 1;
    if (quantiles[mid] <= x) a = mid;
    else b = mid - 1;
  }
  return (firstGE + a) / 2 / last;
}
`;

  writeFileSync(OUT_PATH, body);
  console.log(`\nwrote ${OUT_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
