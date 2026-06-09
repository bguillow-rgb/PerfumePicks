/**
 * Reconcile enriched-candidates.json → existing active ETL frags in Supabase.
 *
 * The insert-enriched-catalog script builds slugs as brand-name (no concentration),
 * but ETL slugs include concentration ("chanel-no-5-eau-de-parfum"). So the upsert
 * created new inactive rows instead of updating the active ETL rows.
 *
 * This script:
 *   1. Loads enriched-candidates.json into a lookup keyed by (brand, base-name).
 *   2. Fetches all active frags from Supabase in pages.
 *   3. Strips concentration suffixes from ETL names and tries to match each frag
 *      against the enriched lookup.
 *   4. Batch-updates matched frags with note/accord/score data (never overwrites
 *      non-empty fields — ETL data wins for image_url/prices/affiliate).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/reconcile-enriched-to-etl.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { CandidateFragrance, normalize } from './types';

const DATA_DIR = path.join(__dirname, 'data');
const IN_PATH = path.join(DATA_DIR, 'enriched-candidates.json');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const PAGE_SIZE = 1000;

// Concentration keywords to strip from the end of ETL names so they match
// the shorter scraped names ("Chance Eau Tendre Eau de Toilette" → "Chance Eau Tendre")
const CONCENTRATION_SUFFIXES = [
  'extrait de parfum', 'eau de parfum intense', 'eau de parfum',
  'eau de toilette intense', 'eau de toilette', 'eau de cologne',
  'eau fraiche', 'parfum', 'extrait', 'cologne', 'body mist', 'hair mist',
  'body spray', 'perfume oil', 'oil', 'solid', 'edp', 'edt', 'edc',
];

function stripConcentration(name: string): string {
  const n = normalize(name);
  for (const suffix of CONCENTRATION_SUFFIXES) {
    if (n.endsWith(' ' + suffix)) return n.slice(0, n.length - suffix.length - 1).trim();
    if (n === suffix) return n; // entire name is concentration — skip
  }
  return n;
}

function matchKey(brand: string, name: string): string {
  return `${normalize(brand)}|${stripConcentration(name)}`;
}

async function main() {
  if (!fs.existsSync(IN_PATH)) { console.error(`No file at ${IN_PATH}`); process.exit(1); }
  const enriched: CandidateFragrance[] = JSON.parse(fs.readFileSync(IN_PATH, 'utf-8'));

  // Build lookup: matchKey → enriched candidate (prefer entries with more data)
  const lookup = new Map<string, CandidateFragrance>();
  for (const c of enriched) {
    const key = matchKey(c.brand, c.name);
    const existing = lookup.get(key);
    const score = (c.top_accords?.length ?? 0) + (c.top_notes?.length ?? 0);
    const existingScore = existing ? (existing.top_accords?.length ?? 0) + (existing.top_notes?.length ?? 0) : -1;
    if (score > existingScore) lookup.set(key, c);
  }
  console.log(`Enriched lookup: ${lookup.size} unique keys`);

  // Fetch all active frags in pages
  let offset = 0;
  let totalMatched = 0;
  let totalUpdated = 0;
  let totalFetched = 0;

  while (true) {
    const { data, error } = await supabase
      .from('fragrances')
      .select('id, slug, name, brands(name), top_accords')
      .eq('is_active', true)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) { console.error('Fetch error:', error.message); break; }
    if (!data?.length) break;
    totalFetched += data.length;

    // Build batch of updates for frags that matched enriched data
    const updates: Array<{ id: string; payload: Record<string, any> }> = [];

    for (const row of data) {
      const brandName = (row as any).brands?.name ?? '';
      const key = matchKey(brandName, row.name);
      const candidate = lookup.get(key);
      if (!candidate) continue;

      totalMatched++;

      // Only patch fields that are empty on the ETL row — never overwrite
      const payload: Record<string, any> = {};
      const existingAccords: string[] = (row as any).top_accords ?? [];

      if (!existingAccords.length && candidate.top_accords?.length) payload.top_accords = candidate.top_accords;
      if (candidate.accord_intensity && Object.keys(candidate.accord_intensity).length) payload.accord_intensity = candidate.accord_intensity;
      if (candidate.top_notes?.length) payload.top_notes = candidate.top_notes;
      if (candidate.heart_notes?.length) payload.heart_notes = candidate.heart_notes;
      if (candidate.base_notes?.length) payload.base_notes = candidate.base_notes;
      if (candidate.fragrance_family) payload.fragrance_family = candidate.fragrance_family;
      if (candidate.community_longevity != null) payload.community_longevity = candidate.community_longevity;
      if (candidate.community_sillage != null) payload.community_sillage = candidate.community_sillage;
      if (candidate.community_projection != null) payload.community_projection = candidate.community_projection;
      if (candidate.compliment_score != null) payload.compliment_score = candidate.compliment_score;
      if (candidate.versatility_score != null) payload.versatility_score = candidate.versatility_score;
      if (candidate.office_safe_score != null) payload.office_safe_score = candidate.office_safe_score;
      if (candidate.price_tier != null) payload.price_tier = candidate.price_tier;

      if (Object.keys(payload).length) updates.push({ id: row.id, payload });
    }

    // Apply updates one by one (Supabase doesn't support batch update by arbitrary id list)
    for (const { id, payload } of updates) {
      const { error: updateError } = await supabase
        .from('fragrances')
        .update(payload)
        .eq('id', id);
      if (updateError) {
        console.warn(`  update error for ${id}:`, updateError.message);
      } else {
        totalUpdated++;
      }
    }

    process.stdout.write(`  [${totalFetched}] fetched | matched ${totalMatched} | updated ${totalUpdated}\n`);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`\nDone. Fetched: ${totalFetched} | Matched: ${totalMatched} | Updated: ${totalUpdated}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
