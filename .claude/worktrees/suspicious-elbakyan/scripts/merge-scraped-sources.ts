/**
 * Merge + dedupe scraped sources into a single "cigars-to-insert" file.
 *
 * Reads:
 *   scripts/data/halfwheel-raw.json        — halfwheel editorial specs
 *   scripts/data/ci-products-raw.json      — cigarsinternational product pages
 *   (existing catalog from Supabase for dedupe)
 *
 * Writes:
 *   scripts/data/merged-candidates.json    — rows ready for LLM enrichment + insert
 *   scripts/data/merge-report.json         — dedupe stats + dropped rows
 *
 * Dedupe strategy — two passes:
 *   1. Exact: normalize (brand + line + vitola) → drop if the tuple already
 *      exists in the existing `cigars` table.
 *   2. Fuzzy: normalize (brand + line) + Levenshtein(vitola) < 3 → merge
 *      rather than drop so we fill missing fields (e.g. halfwheel has a
 *      factory, CI doesn't).
 *
 * Merge priority when both sources describe the same cigar:
 *   wrapper/binder/filler/factory/country  — halfwheel wins (editorial)
 *   price_usd_cents                         — CI wins (retailer MSRP closer to reality)
 *   image_url                               — CI wins (cleaner product shots)
 *   description                             — CI wins (more complete)
 *
 * The output rows are NOT ready to insert yet. LLM enrichment
 * (`enrich-catalog-llm.ts`) fills the numeric fields halfwheel/CI don't
 * publish: strength (1-5), body (1-5), price_tier (1-5), flavors[].
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const DATA_DIR = path.join(__dirname, 'data');
const HALFWHEEL_PATH = path.join(DATA_DIR, 'halfwheel-raw.json');
const CI_PATH = path.join(DATA_DIR, 'ci-products-raw.json');
const OUT_PATH = path.join(DATA_DIR, 'merged-candidates.json');
const REPORT_PATH = path.join(DATA_DIR, 'merge-report.json');

interface ScrapedRow {
  source: string;
  source_url: string;
  title: string;
  brand: string | null;
  line: string | null;
  vitola: string | null;
  size: string | null;
  wrapper: string | null;
  binder: string | null;
  filler: string[];
  country: string | null;
  factory?: string | null;
  price_usd: number | null;
  image_url: string | null;
  description?: string | null;
  strength_raw?: string | null;
  raw_specs?: Record<string, string>;
}

interface CandidateRow {
  brand: string;
  line: string;
  name: string;                 // legacy "display" name, used in search fallback
  vitola: string | null;
  wrapper: string | null;
  binder: string | null;
  filler: string[];
  origin: string | null;
  price_usd_cents: number | null;
  image_url: string | null;
  description: string | null;
  // Fields that LLM enrichment will fill — default to nulls.
  strength: number | null;
  body: number | null;
  price_tier: number | null;
  popularity_tier: number | null;
  flavors: string[];
  // Provenance
  sources: string[];
}

function norm(s: string | null | undefined): string {
  // Normalize for dedupe:
  //   - strip diacritics (Ñ→N, á→a)           "Casa Fernández" ≡ "Casa Fernandez"
  //   - canonicalize & → "and"                "Cornelius & Anthony" ≡ "Cornelius and Anthony"
  //   - strip ALL non-alphanumerics (incl. spaces)
  //       "Room 101" ≡ "Room101"
  //       "E.P. Carrillo" ≡ "EP Carrillo"
  //       "My Father" ≡ "myfather"
  // Removing spaces is safe for cigar brand/line/vitola strings — spacing
  // varies across sources but semantic identity doesn't depend on it.
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function keyOf(brand: string | null, line: string | null, vitola: string | null): string {
  return `${norm(brand)}|${norm(line)}|${norm(vitola)}`;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  const v0 = new Array(n + 1).fill(0).map((_, i) => i);
  const v1 = new Array(n + 1).fill(0);
  for (let i = 0; i < m; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < n; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= n; j++) v0[j] = v1[j];
  }
  return v1[n];
}

function parsePriceCents(dollars: number | null | undefined): number | null {
  if (dollars == null || !Number.isFinite(dollars)) return null;
  return Math.round(dollars * 100);
}

function strongest<T>(rows: ScrapedRow[], pick: (r: ScrapedRow) => T | null | undefined): T | null {
  // Halfwheel > CI for editorial fields.
  const order = ['halfwheel', 'cigarsinternational'];
  for (const src of order) {
    const hit = rows.find((r) => r.source === src);
    if (!hit) continue;
    const v = pick(hit);
    if (v != null && (typeof v !== 'string' || v.length > 0)) return v as T;
  }
  // Fallback: first non-null.
  for (const r of rows) {
    const v = pick(r);
    if (v != null && (typeof v !== 'string' || (v as string).length > 0)) return v as T;
  }
  return null;
}

function mergeGroup(rows: ScrapedRow[]): CandidateRow | null {
  const brand = strongest(rows, (r) => r.brand);
  const line = strongest(rows, (r) => r.line);
  if (!brand || !line) return null;

  const bestImage = rows.find((r) => r.source === 'cigarsinternational' && r.image_url)?.image_url
    ?? rows.find((r) => r.image_url)?.image_url
    ?? null;

  const description =
    rows.find((r) => r.source === 'cigarsinternational' && r.description)?.description ??
    rows.find((r) => r.description)?.description ??
    null;

  const price = rows.find((r) => r.source === 'cigarsinternational' && r.price_usd)?.price_usd
    ?? rows.find((r) => r.price_usd)?.price_usd
    ?? null;

  const filler = strongest(rows, (r) => r.filler.length ? r.filler : null) ?? [];

  return {
    brand,
    line,
    name: rows[0].title,
    vitola: strongest(rows, (r) => r.vitola),
    wrapper: strongest(rows, (r) => r.wrapper),
    binder: strongest(rows, (r) => r.binder),
    filler,
    origin: strongest(rows, (r) => r.country ?? r.factory ?? null),
    price_usd_cents: parsePriceCents(price),
    image_url: bestImage,
    description,
    strength: null,
    body: null,
    price_tier: null,
    popularity_tier: null,
    flavors: [],
    sources: Array.from(new Set(rows.map((r) => r.source_url))),
  };
}

async function main() {
  const hw: ScrapedRow[] = fs.existsSync(HALFWHEEL_PATH)
    ? JSON.parse(fs.readFileSync(HALFWHEEL_PATH, 'utf-8'))
    : [];
  const ci: ScrapedRow[] = fs.existsSync(CI_PATH)
    ? JSON.parse(fs.readFileSync(CI_PATH, 'utf-8'))
    : [];

  console.log(`loaded halfwheel=${hw.length} ci=${ci.length}`);

  const all: ScrapedRow[] = [...hw, ...ci];

  // Group scraped rows by (brand, line, vitola) with exact-key grouping first,
  // then a fuzzy pass that merges near-duplicates (e.g. "Robusto" vs "robusto").
  const groups = new Map<string, ScrapedRow[]>();
  for (const row of all) {
    const k = keyOf(row.brand, row.line, row.vitola);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(row);
  }

  // Merge each group into a single candidate row.
  const candidatesRaw: CandidateRow[] = [];
  for (const [, rows] of groups) {
    const merged = mergeGroup(rows);
    if (merged) candidatesRaw.push(merged);
  }
  console.log(`merged into ${candidatesRaw.length} candidate rows`);

  // Dedupe against existing catalog. Paged because Supabase caps .select() at
  // 1000 rows per page unless we specify range.
  const existing: Array<{ brand: string; line: string; vitola: string | null }> = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb
      .from('cigars')
      .select('brand,line,vitola')
      .range(from, from + pageSize - 1);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    existing.push(...(data as any));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`existing catalog rows: ${existing.length}`);

  const existingKeys = new Set(existing.map((r) => keyOf(r.brand, r.line, r.vitola)));

  const toInsert: CandidateRow[] = [];
  const dropped: Array<{ row: CandidateRow; reason: string }> = [];

  for (const c of candidatesRaw) {
    const k = keyOf(c.brand, c.line, c.vitola);
    if (existingKeys.has(k)) {
      dropped.push({ row: c, reason: 'exact-dupe' });
      continue;
    }
    // Fuzzy check: same brand+line, any existing vitola within Levenshtein 1?
    // L=1 catches plural/singular ("Toro" ↔ "Toros") and minor spelling nits
    // but refuses to merge genuinely different sizes like "Gordo" (6×60) with
    // "Toro" (6×52) or "Gordo" with "Gordito" (petit corona), which L≤2 did.
    const bl = `${norm(c.brand)}|${norm(c.line)}`;
    const fuzzy = existing.find((r) => {
      if (`${norm(r.brand)}|${norm(r.line)}` !== bl) return false;
      if (!c.vitola || !r.vitola) return false;
      return levenshtein(norm(c.vitola), norm(r.vitola)) <= 1;
    });
    if (fuzzy) {
      dropped.push({ row: c, reason: 'fuzzy-dupe' });
      continue;
    }
    // Quality gate at the merge step: require BOTH wrapper and origin. Any
    // row missing either gets dropped here rather than wasting an LLM
    // enrichment call on data we'd reject at insert time anyway.
    if (!c.wrapper) {
      dropped.push({ row: c, reason: 'no-wrapper' });
      continue;
    }
    if (!c.origin) {
      dropped.push({ row: c, reason: 'no-origin' });
      continue;
    }
    toInsert.push(c);
  }

  console.log(`after dedupe: ${toInsert.length} to insert, ${dropped.length} dropped`);

  fs.writeFileSync(OUT_PATH, JSON.stringify(toInsert, null, 2));
  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        scraped_total: all.length,
        merged_groups: candidatesRaw.length,
        existing_catalog: existing.length,
        to_insert: toInsert.length,
        dropped: dropped.length,
        dropped_reasons: dropped.reduce<Record<string, number>>((acc, d) => {
          acc[d.reason] = (acc[d.reason] ?? 0) + 1;
          return acc;
        }, {}),
        sample_dropped: dropped.slice(0, 20).map((d) => ({
          reason: d.reason,
          brand: d.row.brand,
          line: d.row.line,
          vitola: d.row.vitola,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${toInsert.length} candidates to ${OUT_PATH}`);
  console.log(`wrote report to ${REPORT_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
