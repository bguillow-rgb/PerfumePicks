/**
 * READ-ONLY dry run: what would happen if we merged llm-expansion.json into `cigars`?
 *
 * Does NOT write to the database. Does NOT modify any existing JSON.
 * Only reads llm-expansion.json + SELECTs from the cigars table.
 *
 * Reports:
 *   - total rows in llm-expansion.json
 *   - existing cigars rows
 *   - how many would be net-new inserts (exact-key miss)
 *   - how many would be dropped as exact dupes (brand|line|vitola)
 *   - how many would be dropped as fuzzy dupes (same brand+line, vitola Levenshtein <= 2)
 *   - how many would be dropped by the insert script's quality gate (missing wrapper/origin/flavors/etc.)
 *   - sample of each bucket
 *   - new-brand count (brands in the expansion that have zero existing rows)
 *
 * Usage:
 *   npx tsx scripts/dry-run-llm-expansion.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env. Source .env first.');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const IN_PATH = path.join(__dirname, 'data', 'llm-expansion.json');

function norm(s: string | null | undefined): string {
  // Match merge-scraped-sources.ts:norm exactly — diacritic strip, & → and,
  // then all non-alphanumerics (incl. spaces) removed. "Room 101" ≡ "Room101".
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

// Mirrors insert-enriched-catalog.ts validate()
function qualityGate(r: Row): string | null {
  if (!r.brand?.trim()) return 'missing brand';
  if (!r.line?.trim()) return 'missing line';
  if (!r.vitola?.trim()) return 'missing vitola';
  if (!r.wrapper?.trim()) return 'missing wrapper';
  if (!r.origin?.trim()) return 'missing origin';
  for (const [k, v] of [['strength', r.strength], ['body', r.body], ['price_tier', r.price_tier]] as const) {
    if (!Number.isInteger(v as any) || (v as number) < 1 || (v as number) > 5) return `invalid ${k}`;
  }
  if (!Array.isArray(r.flavors) || r.flavors.length < 2) return 'too few flavors';
  return null;
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
  const existingBrands = new Set(existing.map((r) => norm(r.brand)));
  const existingByBL = new Map<string, Array<{ vitola: string | null }>>();
  for (const r of existing) {
    const k = `${norm(r.brand)}|${norm(r.line)}`;
    if (!existingByBL.has(k)) existingByBL.set(k, []);
    existingByBL.get(k)!.push({ vitola: r.vitola });
  }

  const buckets = {
    qualityFailed: [] as Array<{ row: Row; reason: string }>,
    exactDupe: [] as Row[],
    fuzzyDupe: [] as Array<{ row: Row; matched: string | null }>,
    toInsert: [] as Row[],
  };

  // Also dedupe within the expansion itself — same (b,l,v) can appear twice.
  const seenInExpansion = new Set<string>();
  const withinDupe: Row[] = [];

  for (const r of rows) {
    const k = keyOf(r.brand, r.line, r.vitola);
    if (seenInExpansion.has(k)) {
      withinDupe.push(r);
      continue;
    }
    seenInExpansion.add(k);

    const qf = qualityGate(r);
    if (qf) { buckets.qualityFailed.push({ row: r, reason: qf }); continue; }

    if (existingKeys.has(k)) { buckets.exactDupe.push(r); continue; }

    const bl = `${norm(r.brand)}|${norm(r.line)}`;
    const siblings = existingByBL.get(bl) ?? [];
    // L<=1: plural/singular + minor spelling nits only. L<=2 incorrectly
    // fused Gordo↔Toro and Gordo↔Gordito (different sizes).
    const fuzzy = siblings.find((s) => s.vitola && r.vitola && lev(norm(s.vitola), norm(r.vitola)) <= 1);
    if (fuzzy) { buckets.fuzzyDupe.push({ row: r, matched: fuzzy.vitola }); continue; }

    buckets.toInsert.push(r);
  }

  const newBrands = new Set(
    buckets.toInsert.map((r) => norm(r.brand)).filter((b) => !existingBrands.has(b)),
  );

  // Brand-level fuzzy suspicion check. For each truly "new" brand, find the
  // closest existing brand at Levenshtein <= 2. If there's a hit, it's
  // probably a misspelling or canonicalization mismatch (e.g. "Cornelius and
  // Anthony" vs "Cornelius & Anthony" pre-fix) that should be reviewed
  // manually before insert. These rows are still counted in toInsert so we
  // don't silently drop data — we just flag them for human eyes.
  const existingBrandsList = Array.from(existingBrands);
  const suspiciousBrands: Array<{ newBrand: string; closestExisting: string; distance: number }> = [];
  for (const nb of newBrands) {
    let best: { brand: string; d: number } | null = null;
    for (const eb of existingBrandsList) {
      const d = lev(nb, eb);
      if (d === 0) continue;
      if (d <= 2 && (!best || d < best.d)) best = { brand: eb, d };
    }
    if (best) suspiciousBrands.push({ newBrand: nb, closestExisting: best.brand, distance: best.d });
  }

  const reasons: Record<string, number> = {};
  for (const q of buckets.qualityFailed) reasons[q.reason] = (reasons[q.reason] ?? 0) + 1;

  console.log('\n============ DRY RUN REPORT ============');
  console.log(`Input rows (llm-expansion.json):         ${rows.length}`);
  console.log(`  within-expansion dupes (ignored):      ${withinDupe.length}`);
  console.log(`  unique (brand|line|vitola) in input:   ${seenInExpansion.size}`);
  console.log(`Existing cigars rows:                    ${existing.length}`);
  console.log('');
  console.log(`Would INSERT (net-new):                  ${buckets.toInsert.length}`);
  console.log(`  of which new brands (no rows today):   ${newBrands.size}`);
  console.log(`  brands w/ close existing match (L<=2): ${suspiciousBrands.length}  ← review before insert`);
  console.log(`Would SKIP — exact dupe:                 ${buckets.exactDupe.length}`);
  console.log(`Would SKIP — fuzzy dupe (vitola L<=2):   ${buckets.fuzzyDupe.length}`);
  console.log(`Would SKIP — quality gate failed:        ${buckets.qualityFailed.length}`);
  for (const [k, v] of Object.entries(reasons)) console.log(`    ${k}: ${v}`);
  console.log('========================================\n');

  const sample = (label: string, xs: any[], pick: (x: any) => string) => {
    console.log(`--- sample ${label} (showing up to 10 of ${xs.length}) ---`);
    xs.slice(0, 10).forEach((x) => console.log(`  ${pick(x)}`));
    console.log('');
  };
  sample('INSERT', buckets.toInsert, (r) => `${r.brand} | ${r.line} | ${r.vitola}`);
  sample('EXACT DUPE', buckets.exactDupe, (r) => `${r.brand} | ${r.line} | ${r.vitola}`);
  sample('FUZZY DUPE', buckets.fuzzyDupe, (x) => `${x.row.brand} | ${x.row.line} | ${x.row.vitola}  (matched existing vitola: ${x.matched})`);
  sample('QUALITY FAIL', buckets.qualityFailed, (x) => `${x.reason}  —  ${x.row.brand} | ${x.row.line} | ${x.row.vitola}`);
  sample('NEW BRANDS', Array.from(newBrands), (b) => b);
  sample('SUSPICIOUS NEW BRANDS (maybe already exist)', suspiciousBrands,
    (x) => `"${x.newBrand}"  ≈  "${x.closestExisting}"  (L=${x.distance})`);

  console.log('No database writes were performed. No files were modified.');
}

main().catch((e) => { console.error(e); process.exit(1); });
