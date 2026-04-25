/**
 * Merge + dedupe scraped sources into a single "fragrances-to-insert" file.
 *
 * Reads every `scripts/data/*-raw.json` in the data dir whose contents look
 * like CandidateFragrance[]. Adding a new source = drop in a new
 * scrape-{source}.ts that writes scripts/data/{source}-raw.json — no edits
 * needed here.
 *
 * Writes:
 *   scripts/data/merged-candidates.json   — rows ready for LLM enrichment
 *   scripts/data/merge-report.json        — dedupe stats + dropped rows
 *
 * Dedupe strategy:
 *   - Stable key = candidateKey(brand, name).
 *   - Two rows with the same key → MERGE (don't drop) so we accumulate
 *     fields across sources.
 *
 * Field-priority on merge (when two sources disagree):
 *   notes (top/heart/base)        — brand-direct beats retailer beats Fragrantica
 *   accords + accord_intensity    — Fragrantica beats anyone (it's their data)
 *   community_*                   — Fragrantica beats anyone
 *   image_url                     — brand-direct beats retailer (cleaner shots)
 *   retail_msrp_usd_cents         — retailer beats brand (closer to street)
 *   prices[]                      — accumulate from every source
 *   concentration / family        — first non-null wins
 *
 * The output rows are NOT ready to insert yet. LLM enrichment fills derived
 * scores (compliment, versatility, office_safe) and any missing accords.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CandidateFragrance, candidateKey } from './types';

const DATA_DIR = path.join(__dirname, 'data');
const OUT_PATH = path.join(DATA_DIR, 'merged-candidates.json');
const REPORT_PATH = path.join(DATA_DIR, 'merge-report.json');

// Source priority (higher index = wins on conflict).
const NOTES_PRIORITY = ['fragrantica', 'sephora', 'nordstrom', 'luckyscent', 'fragrancex', 'brand'];
const ACCORD_PRIORITY = ['brand', 'sephora', 'nordstrom', 'fragrantica'];
const PRICE_PRIORITY  = ['brand', 'fragrantica', 'sephora', 'nordstrom', 'luckyscent', 'fragrancex'];
const IMAGE_PRIORITY  = ['fragrantica', 'sephora', 'nordstrom', 'brand'];

// "brand" is a synthetic source-class for any brand-direct scraper
// (scrape-tomford.ts, scrape-creed.ts, etc.). Map source ids → class here.
function sourceClass(s: string): string {
  if (s === 'fragrantica') return 'fragrantica';
  if (s === 'sephora') return 'sephora';
  if (s === 'nordstrom') return 'nordstrom';
  if (s === 'luckyscent') return 'luckyscent';
  if (s === 'fragrancex') return 'fragrancex';
  return 'brand'; // tomford, creed, mfk, lelabo, etc.
}

function rank(prio: string[], src: string): number {
  const i = prio.indexOf(sourceClass(src));
  return i < 0 ? -1 : i;
}

function pickByPriority<T>(
  prio: string[],
  candidates: { source: string; value: T | null | undefined }[],
): T | null {
  const valid = candidates.filter((c) => c.value != null && c.value !== '');
  if (!valid.length) return null;
  valid.sort((a, b) => rank(prio, b.source) - rank(prio, a.source));
  return valid[0].value as T;
}

function mergeRows(rows: CandidateFragrance[]): CandidateFragrance {
  // Pick fields by source priority. Each `c` is `{source, value}` for one source row.
  const get = <K extends keyof CandidateFragrance>(k: K) =>
    rows.map((r) => ({ source: r.source, value: r[k] }));

  // Merge note arrays: union from notes-priority winning source first, then
  // anything new from lower-priority sources appended (no dupes).
  const mergeNotes = (key: 'top_notes' | 'heart_notes' | 'base_notes'): string[] => {
    const sorted = [...rows].sort((a, b) => rank(NOTES_PRIORITY, b.source) - rank(NOTES_PRIORITY, a.source));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of sorted) for (const n of r[key]) {
      const k = n.trim().toLowerCase();
      if (k && !seen.has(k)) { seen.add(k); out.push(n.trim()); }
    }
    return out;
  };

  const accordRow = [...rows].sort((a, b) => rank(ACCORD_PRIORITY, b.source) - rank(ACCORD_PRIORITY, a.source))[0];

  // Prices accumulate across sources, dedupe by (retailer, size_ml, is_decant)
  const priceMap = new Map<string, CandidateFragrance['prices'][number]>();
  for (const r of rows) for (const p of r.prices) {
    priceMap.set(`${p.retailer}|${p.size_ml}|${p.is_decant}`, p);
  }

  return {
    brand: rows[0].brand,
    name: rows[0].name,
    release_year: pickByPriority(NOTES_PRIORITY, get('release_year')),
    concentration: pickByPriority(NOTES_PRIORITY, get('concentration')),
    fragrance_family: pickByPriority(NOTES_PRIORITY, get('fragrance_family')),
    gender: pickByPriority(NOTES_PRIORITY, get('gender')),

    top_notes: mergeNotes('top_notes'),
    heart_notes: mergeNotes('heart_notes'),
    base_notes: mergeNotes('base_notes'),

    top_accords: accordRow?.top_accords ?? [],
    accord_intensity: accordRow?.accord_intensity ?? {},

    community_longevity: pickByPriority(['fragrantica'], get('community_longevity')),
    community_sillage: pickByPriority(['fragrantica'], get('community_sillage')),
    community_projection: pickByPriority(['fragrantica'], get('community_projection')),

    compliment_score: pickByPriority(NOTES_PRIORITY, get('compliment_score')),
    versatility_score: pickByPriority(NOTES_PRIORITY, get('versatility_score')),
    office_safe_score: pickByPriority(NOTES_PRIORITY, get('office_safe_score')),

    price_tier: pickByPriority(PRICE_PRIORITY, get('price_tier')),
    retail_msrp_usd_cents: pickByPriority(PRICE_PRIORITY, get('retail_msrp_usd_cents')),
    prices: Array.from(priceMap.values()),

    image_url: pickByPriority(IMAGE_PRIORITY, get('image_url')),
    source: rows[0].source,
    source_url: pickByPriority(NOTES_PRIORITY, get('source_url')),
    sources: Array.from(new Set(rows.flatMap((r) => r.sources?.length ? r.sources : [r.source]))),
  };
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`No data dir at ${DATA_DIR}. Run a scraper first.`);
    process.exit(1);
  }

  const rawFiles = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('-raw.json'));
  if (!rawFiles.length) {
    console.error(`No *-raw.json files in ${DATA_DIR}.`);
    process.exit(1);
  }

  const all: CandidateFragrance[] = [];
  for (const f of rawFiles) {
    const rows: CandidateFragrance[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
    console.log(`  ${f}: ${rows.length} rows`);
    all.push(...rows);
  }

  // Group by stable key, merge each group
  const byKey = new Map<string, CandidateFragrance[]>();
  for (const r of all) {
    const k = candidateKey(r);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(r);
  }

  const merged: CandidateFragrance[] = [];
  let mergedGroups = 0;
  for (const group of byKey.values()) {
    if (group.length === 1) merged.push(group[0]);
    else { merged.push(mergeRows(group)); mergedGroups++; }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2));
  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    sourceFiles: rawFiles,
    inputRows: all.length,
    mergedRows: merged.length,
    groupsMerged: mergedGroups,
    bySource: Object.fromEntries(
      rawFiles.map((f) => [f, JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')).length]),
    ),
  }, null, 2));

  console.log(`\nMerged ${all.length} rows from ${rawFiles.length} sources → ${merged.length} unique fragrances`);
  console.log(`(${mergedGroups} fragrances had data merged from 2+ sources)`);
  console.log(`wrote ${OUT_PATH}`);
}

main();
