/**
 * Backfill missing cigar image_urls from scraped JSONs we already have on disk.
 *
 * Sources (in priority order when a cigar matches multiple):
 *   1. scripts/data/ci-scraped-raw.json  — Cigars International product shots
 *      (cleanest white-bg product photography, best for UI)
 *   2. scripts/data/halfwheel-raw.json    — Halfwheel editorial reviews, one
 *      image per SKU with full brand/line/vitola structure
 *
 * Matching tiers, highest-precision first:
 *   Tier 1  exact  brand + line + vitola   (halfwheel only — has structured fields)
 *   Tier 2  fuzzy  brand + line, Levenshtein(vitola) ≤ 2
 *                  (catches "Toro" vs "Toros", "Robusto" vs "Robusto Extra")
 *   Tier 3  token  brand + any vitola-token present in a scraped product name
 *                  (for ci-scraped-raw where we only have a product-name string)
 *
 * Targets cigars where image_url IS NULL OR is a known-generic Unsplash URL
 * (the 743 reused stock photos identified by the coverage audit).
 *
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   EXPO_PUBLIC_SUPABASE_URL=https://....supabase.co \
 *   npx tsx scripts/backfill-images-from-scraped.ts [--dry-run] [--limit N]
 *
 * --dry-run  Count matches and print a sample, no DB writes.
 * --limit N  Only process the first N missing cigars (useful for smoke tests).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
// Default to strict-null-only: a non-null image_url is treated as "off-limits"
// no matter how thin it looks (even reused Unsplash stock). Pass
// --include-unsplash to override and also consider images.unsplash.com rows
// as candidates for replacement. The default was flipped after a prior run
// overwrote ~3000 rows that shouldn't have been touched.
const INCLUDE_UNSPLASH = args.has('--include-unsplash');
const LIMIT_IDX = process.argv.indexOf('--limit');
const LIMIT = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : 0;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env. Need EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ---- Types ----

interface CigarRow {
  id: string;
  brand: string;
  line: string | null;
  name: string;
  vitola: string | null;
  image_url: string | null;
}

interface HalfwheelRow {
  brand?: string;
  line?: string;
  vitola?: string;
  image_url?: string;
}

interface CIScrapedProduct {
  name: string;
  imageUrl: string;
}

type ScrapeSource = 'ci' | 'halfwheel';

interface Candidate {
  brand: string;
  line: string | null;
  vitola: string | null;
  // raw text used for tier-3 token matching (ci only)
  rawName?: string;
  imageUrl: string;
  source: ScrapeSource;
}

// ---- Normalization ----

function norm(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string | null | undefined): Set<string> {
  return new Set(norm(s).split(' ').filter((t) => t.length > 1));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m: number[][] = Array(a.length + 1)
    .fill(0)
    .map(() => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) m[i][0] = i;
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[a.length][b.length];
}

// ---- Generic-image skiplist (the 35.6% of DB rows pointing to reused Unsplash stock) ----
// Treat these as "missing" for backfill purposes — better to overwrite with a
// real product shot than keep the stock filler.
function isGenericStock(url: string | null): boolean {
  if (!url) return false;
  return url.includes('images.unsplash.com');
}

// ---- Load candidates ----

function loadCandidates(dbBrands: Set<string>): Candidate[] {
  const dataDir = path.join(__dirname, 'data');
  const pool: Candidate[] = [];

  // Halfwheel's scrape captured only the FIRST WORD of multi-word brands
  // (e.g. "Rocky Patel Vintage 1990 Torpedo" → brand="Rocky" + line="Patel
  // Vintage 1990"). Reconstruct full brand names by concatenating brand+line
  // and finding the longest DB brand that's a prefix of that string. The
  // remainder becomes the effective line for matching.
  const normDbBrands = new Map<string, string>(); // normalized → original
  for (const b of dbBrands) normDbBrands.set(norm(b), b);
  const normBrandKeys = [...normDbBrands.keys()].sort((a, b) => b.length - a.length);

  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, 'halfwheel-raw.json'), 'utf8')) as HalfwheelRow[];
    let reassigned = 0;
    for (const r of raw) {
      if (!r.image_url || !r.brand) continue;

      let effBrand = r.brand;
      let effLine: string | null = r.line ?? null;
      const combined = norm(`${r.brand} ${r.line ?? ''}`);
      for (const nb of normBrandKeys) {
        if (!nb) continue;
        if (combined === nb || combined.startsWith(nb + ' ')) {
          const matched = normDbBrands.get(nb)!;
          if (matched !== r.brand) reassigned++;
          effBrand = matched;
          effLine = combined === nb ? null : combined.slice(nb.length + 1);
          break;
        }
      }

      pool.push({
        brand: effBrand,
        line: effLine,
        vitola: r.vitola ?? null,
        imageUrl: r.image_url,
        source: 'halfwheel',
      });
    }
    console.log(`  halfwheel: ${pool.length} candidates (brand reassigned on ${reassigned})`);
  } catch (e: any) {
    console.warn(`  halfwheel-raw.json unavailable: ${e.message}`);
  }

  // CI — {brand: [{name, imageUrl}, ...]} — unstructured names, need tier-3 token match
  try {
    const ciStart = pool.length;
    const ci = JSON.parse(fs.readFileSync(path.join(dataDir, 'ci-scraped-raw.json'), 'utf8')) as Record<string, CIScrapedProduct[]>;
    for (const [brand, items] of Object.entries(ci)) {
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        if (!it.imageUrl || !it.name) continue;
        pool.push({
          brand,
          line: null,
          vitola: null,
          rawName: it.name,
          imageUrl: it.imageUrl,
          source: 'ci',
        });
      }
    }
    console.log(`  ci-scraped: ${pool.length - ciStart} candidates`);
  } catch (e: any) {
    console.warn(`  ci-scraped-raw.json unavailable: ${e.message}`);
  }

  return pool;
}

// ---- Matching ----

interface MatchResult {
  url: string;
  source: ScrapeSource;
  tier: 1 | 2 | 3;
}

function matchCigar(cigar: CigarRow, pool: Candidate[]): MatchResult | null {
  const cBrand = norm(cigar.brand);
  const cLine = norm(cigar.line);
  const cVit = norm(cigar.vitola);
  const cNameTokens = tokens(cigar.name);

  // Pre-filter pool by brand — huge speedup (pool is ~1500, brands ~359)
  const brandPool = pool.filter((p) => norm(p.brand) === cBrand);
  if (!brandPool.length) return null;

  // Tier 1: exact brand+line+vitola (halfwheel)
  if (cLine && cVit) {
    for (const p of brandPool) {
      if (p.source !== 'halfwheel') continue;
      if (norm(p.line) === cLine && norm(p.vitola) === cVit) {
        return { url: p.imageUrl, source: p.source, tier: 1 };
      }
    }
  }

  // Tier 2: brand+line match, fuzzy vitola (Lev ≤ 2)
  if (cLine && cVit) {
    let best: { p: Candidate; dist: number } | null = null;
    for (const p of brandPool) {
      if (p.source !== 'halfwheel') continue;
      if (norm(p.line) !== cLine || !p.vitola) continue;
      const d = levenshtein(cVit, norm(p.vitola));
      if (d <= 2 && (best === null || d < best.dist)) {
        best = { p, dist: d };
      }
    }
    if (best) return { url: best.p.imageUrl, source: best.p.source, tier: 2 };
  }

  // Tier 3: token overlap against CI raw names. Require:
  //   (a) CI product name contains the brand token set (already pre-filtered)
  //   (b) ≥2 non-brand tokens from cigar.name appear in CI product name
  //   (c) if vitola is present, the vitola token should appear (strict)
  const brandTokens = tokens(cigar.brand);
  const nonBrandCigarTokens = new Set<string>();
  for (const t of cNameTokens) if (!brandTokens.has(t)) nonBrandCigarTokens.add(t);

  const vitolaTokens = tokens(cigar.vitola);

  let bestCi: { p: Candidate; overlap: number } | null = null;
  for (const p of brandPool) {
    if (p.source !== 'ci' || !p.rawName) continue;
    const pTokens = tokens(p.rawName);

    // Count non-brand cigar tokens present in product name
    let overlap = 0;
    for (const t of nonBrandCigarTokens) if (pTokens.has(t)) overlap++;
    if (overlap < 2) continue;

    // If cigar has a vitola, require vitola token to match (prevents brand-only matches)
    if (vitolaTokens.size > 0) {
      let anyVitHit = false;
      for (const vt of vitolaTokens) if (pTokens.has(vt)) { anyVitHit = true; break; }
      if (!anyVitHit) continue;
    }

    if (bestCi === null || overlap > bestCi.overlap) {
      bestCi = { p, overlap };
    }
  }
  if (bestCi) return { url: bestCi.p.imageUrl, source: 'ci', tier: 3 };

  return null;
}

// ---- Main ----

async function fetchMissingCigars(): Promise<CigarRow[]> {
  const out: CigarRow[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('cigars')
      .select('id, brand, line, name, vitola, image_url')
      .order('brand')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      // Strict-null by default so no existing image_url gets overwritten.
      // --include-unsplash relaxes to also treat the 743 reused stock photos
      // as candidates for replacement.
      if (!r.image_url) {
        out.push(r as CigarRow);
      } else if (INCLUDE_UNSPLASH && isGenericStock(r.image_url)) {
        out.push(r as CigarRow);
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function main() {
  console.log(
    `Backfill mode: ${DRY ? 'DRY-RUN' : 'WRITE'}` +
      `  unsplash-overwrite=${INCLUDE_UNSPLASH}` +
      (LIMIT ? `  limit=${LIMIT}` : '') +
      '\n',
  );

  console.log(
    `Loading target cigars (${INCLUDE_UNSPLASH ? 'null OR Unsplash stock' : 'null ONLY'})...`,
  );
  const missing = await fetchMissingCigars();
  console.log(`Cigars needing images: ${missing.length}\n`);

  // Collect every distinct brand in the DB — needed to repair halfwheel's
  // truncated brand names before we build the candidate pool.
  const dbBrands = new Set<string>();
  {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('cigars')
        .select('brand')
        .order('brand')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) if (r.brand) dbBrands.add(String(r.brand).trim());
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  console.log(`Distinct DB brands: ${dbBrands.size}`);

  console.log('Loading candidates from scripts/data/...');
  const pool = loadCandidates(dbBrands);
  console.log(`Total candidate pool: ${pool.length}\n`);

  const targets = LIMIT > 0 ? missing.slice(0, LIMIT) : missing;

  const tierCounts = { 1: 0, 2: 0, 3: 0 };
  const sourceCounts: Record<ScrapeSource, number> = { ci: 0, halfwheel: 0 };
  const unmatched: CigarRow[] = [];
  const updates: Array<{ id: string; url: string; tier: 1 | 2 | 3; source: ScrapeSource }> = [];

  for (const c of targets) {
    const m = matchCigar(c, pool);
    if (m) {
      tierCounts[m.tier]++;
      sourceCounts[m.source]++;
      updates.push({ id: c.id, url: m.url, tier: m.tier, source: m.source });
    } else {
      unmatched.push(c);
    }
  }

  console.log('=== Match stats ===');
  console.log(`  matched:   ${updates.length} / ${targets.length}`);
  console.log(`  unmatched: ${unmatched.length}`);
  console.log(`  tier 1 (exact):       ${tierCounts[1]}`);
  console.log(`  tier 2 (fuzzy vitola): ${tierCounts[2]}`);
  console.log(`  tier 3 (token CI):    ${tierCounts[3]}`);
  console.log(`  source halfwheel:     ${sourceCounts.halfwheel}`);
  console.log(`  source ci:            ${sourceCounts.ci}`);

  // Show a few samples of each
  console.log('\nSample matches:');
  for (const tier of [1, 2, 3] as const) {
    const sample = updates.find((u) => u.tier === tier);
    if (sample) {
      const row = targets.find((t) => t.id === sample.id)!;
      console.log(`  [tier ${tier}] ${row.brand} | ${row.line ?? '-'} | ${row.vitola ?? '-'} → ${sample.url.slice(0, 80)}`);
    }
  }

  if (unmatched.length) {
    console.log('\nSample unmatched (first 5):');
    for (const r of unmatched.slice(0, 5)) {
      console.log(`  ${r.brand} | ${r.line ?? '-'} | ${r.vitola ?? '-'}`);
    }
  }

  if (DRY) {
    console.log('\n(dry-run) no writes performed.');
    return;
  }

  if (!updates.length) {
    console.log('\nNothing to write.');
    return;
  }

  // Write in batches of 100 with small delay between batches so we don't
  // hammer PostgREST — each update is its own statement.
  const BATCH = 100;
  let written = 0;
  let failed = 0;
  console.log(`\nWriting ${updates.length} updates in batches of ${BATCH}...`);
  for (let i = 0; i < updates.length; i += BATCH) {
    const slice = updates.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (u) => {
        const { error } = await supabase.from('cigars').update({ image_url: u.url }).eq('id', u.id);
        if (error) {
          failed++;
          console.warn(`  fail ${u.id}: ${error.message}`);
        } else {
          written++;
        }
      }),
    );
    process.stdout.write(`\r  written ${written}/${updates.length}  (failed ${failed})  `);
  }
  console.log('\n');

  // Final coverage
  const { count: totalCount } = await supabase
    .from('cigars')
    .select('*', { count: 'exact', head: true });
  const { count: missingCount } = await supabase
    .from('cigars')
    .select('*', { count: 'exact', head: true })
    .is('image_url', null);
  console.log(`Post-backfill coverage: ${(totalCount ?? 0) - (missingCount ?? 0)}/${totalCount ?? 0} have image_url  (missing: ${missingCount ?? 0})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
