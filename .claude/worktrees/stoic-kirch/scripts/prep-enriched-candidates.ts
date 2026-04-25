/**
 * Prep step between llm-expansion.json and insert-enriched-catalog.ts.
 *
 * The LLM expansion produces rows that are enrichment-complete (strength,
 * body, price_tier, flavors, popularity_tier all populated), but has NOT
 * been deduped against the live catalog. insert-enriched-catalog.ts
 * intentionally does not dedupe — it trusts its input. So if we point it
 * straight at llm-expansion.json, exact-dupe rows would hit the DB as
 * batch insert errors.
 *
 * This script bridges the gap:
 *   - reads scripts/data/llm-expansion.json
 *   - SELECTs the live cigars catalog
 *   - applies the same exact + fuzzy dedupe rules as merge-scraped-sources.ts
 *   - drops within-expansion duplicates
 *   - writes the net-new rows to scripts/data/enriched-candidates.json
 *     (the file insert-enriched-catalog.ts consumes)
 *
 * READ-ONLY against the DB. Writes exactly one file locally.
 *
 * Usage:
 *   npx tsx scripts/prep-enriched-candidates.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env. Source .env.local first.');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const IN_PATH = path.join(__dirname, 'data', 'llm-expansion.json');
const OUT_PATH = path.join(__dirname, 'data', 'enriched-candidates.json');

// Keep in lockstep with merge-scraped-sources.ts norm().
function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
function keyOf(b: string | null, l: string | null, v: string | null): string {
  return `${norm(b)}|${norm(l)}|${norm(v)}`;
}
function lev(a: string, b: string): number {
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

interface Row {
  brand: string;
  line: string;
  name?: string;
  vitola: string | null;
  wrapper: string | null;
  binder: string | null;
  filler: string[];
  origin: string | null;
  price_usd_cents: number | null;
  image_url: string | null;
  description: string | null;
  strength: number | null;
  body: number | null;
  price_tier: number | null;
  popularity_tier: number | null;
  flavors: string[];
  sources: string[];
}

async function main() {
  const rows: Row[] = JSON.parse(fs.readFileSync(IN_PATH, 'utf-8'));
  console.log(`loaded ${rows.length} rows from llm-expansion.json`);

  // Pull existing catalog (paged).
  const existing: Array<{ brand: string; line: string; vitola: string | null }> = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb
      .from('cigars')
      .select('brand,line,vitola')
      .range(from, from + pageSize - 1);
    if (error) { console.error(error); process.exit(1); }
    if (!data || data.length === 0) break;
    existing.push(...(data as any));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`existing catalog rows: ${existing.length}`);

  const existingKeys = new Set(existing.map((r) => keyOf(r.brand, r.line, r.vitola)));
  const existingByBL = new Map<string, Array<{ vitola: string | null }>>();
  for (const r of existing) {
    const k = `${norm(r.brand)}|${norm(r.line)}`;
    if (!existingByBL.has(k)) existingByBL.set(k, []);
    existingByBL.get(k)!.push({ vitola: r.vitola });
  }

  const seen = new Set<string>();
  const out: Row[] = [];
  const stats = { withinDupe: 0, exactDupe: 0, fuzzyDupe: 0 };

  for (const r of rows) {
    const k = keyOf(r.brand, r.line, r.vitola);
    if (seen.has(k)) { stats.withinDupe++; continue; }
    seen.add(k);

    if (existingKeys.has(k)) { stats.exactDupe++; continue; }

    const bl = `${norm(r.brand)}|${norm(r.line)}`;
    const siblings = existingByBL.get(bl) ?? [];
    const fuzzy = siblings.find((s) => s.vitola && r.vitola && lev(norm(s.vitola), norm(r.vitola)) <= 1);
    if (fuzzy) { stats.fuzzyDupe++; continue; }

    // Ensure name field is present (required by insert script). Fall back to
    // `${brand} ${line}` if the LLM row didn't set it.
    if (!r.name) r.name = `${r.brand} ${r.line}`;
    out.push(r);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));

  console.log('\n=== prep summary ===');
  console.log(`input rows:              ${rows.length}`);
  console.log(`within-expansion dupes:  ${stats.withinDupe}`);
  console.log(`exact dupes (in DB):     ${stats.exactDupe}`);
  console.log(`fuzzy dupes (vitola):    ${stats.fuzzyDupe}`);
  console.log(`wrote net-new:           ${out.length}  →  ${OUT_PATH}`);
  console.log('No DB writes performed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
