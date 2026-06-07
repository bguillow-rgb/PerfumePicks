/**
 * import-dupe-seeds — load hand-curated original->dupe pairs into fragrance_dupes.
 *
 * Reads scripts/data/dupe-seeds.json (the founder-curated list), resolves each
 * {brand,name} side to a catalog fragrance UUID, and upserts a row into
 * fragrance_dupes with source 'editorial' | 'seed'. These rows take precedence
 * over algorithmic dupes and are NEVER touched by the similarity precompute
 * (swap_algo_dupes only clears source='algo'), so curation survives every run.
 *
 * Resolution (per side):
 *   1. exact normalized "brand name" match
 *   2. exact normalized name match within the same normalized brand
 *   3. unique normalized-name match across the whole catalog (brand alias safety)
 * Ambiguous (>1 candidate) and missing matches are REPORTED, never guessed.
 *
 * Sanity gates (a bad seed should fail loud, not ship a wrong dupe):
 *   - original and dupe must resolve to different fragrances
 *   - dupe must be is_active AND purchasable (else it can't render / convert)
 *   - dupe MSRP must be strictly less than original MSRP when both are known
 *     (a "dupe" that isn't cheaper is a data error) — warned, still inserted
 *     so the founder can see it in the report; flip STRICT=true to skip instead.
 *
 * DRY RUN by default — prints what it WOULD do. Pass --commit to write.
 *
 * Run:
 *   source .env.local && npx tsx scripts/import-dupe-seeds.ts            # dry run
 *   source .env.local && npx tsx scripts/import-dupe-seeds.ts --commit   # write
 *
 * NOTE: requires the dupes-foundation migration (fragrance_dupes table) to be
 * applied first. Until then this will error on the upsert step — expected.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { normalize } from './types';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const COMMIT = process.argv.includes('--commit');
const STRICT = true; // true = skip pairs where the dupe isn't cheaper / not purchasable / inactive

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

type Side = { brand: string; name: string };
type SeedPair = {
  original: Side;
  dupe: Side;
  match_pct: number;
  source: 'editorial' | 'seed';
  note?: string;
};

type DbRow = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  is_active: boolean;
  purchasable: boolean;
  retail_msrp_usd_cents: number | null;
};

async function fetchCatalog(): Promise<DbRow[]> {
  const PAGE = 1000;
  const rows: DbRow[] = [];
  // The `purchasable` column ships with the dupes-foundation migration. Before
  // it lands, fall back to a select without it so the dry-run resolution report
  // still works (purchasable defaults to true → the cheaper-than gate still runs).
  let hasPurchasable = true;
  const cols = (withPurch: boolean) =>
    `id, slug, name, is_active, retail_msrp_usd_cents, brands(name)${withPurch ? ', purchasable' : ''}`;
  for (let offset = 0; ; offset += PAGE) {
    let { data, error } = await supabase
      .from('fragrances')
      .select(cols(hasPurchasable))
      .range(offset, offset + PAGE - 1);
    if (error && hasPurchasable && /purchasable/.test(error.message)) {
      console.warn('  (purchasable column not present yet — migration not applied; defaulting to true)');
      hasPurchasable = false;
      ({ data, error } = await supabase
        .from('fragrances')
        .select(cols(false))
        .range(offset, offset + PAGE - 1));
    }
    if (error) { console.error('Catalog fetch error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const r of data as any[]) {
      rows.push({
        id: r.id,
        slug: r.slug,
        name: r.name ?? '',
        brand: r.brands?.name ?? '',
        is_active: r.is_active,
        purchasable: hasPurchasable ? (r.purchasable ?? false) : true,
        retail_msrp_usd_cents: r.retail_msrp_usd_cents,
      });
    }
    if (data.length < PAGE) break;
  }
  return rows;
}

function buildIndexes(rows: DbRow[]) {
  const byBrandName = new Map<string, DbRow[]>();   // "brand|name"
  const byName = new Map<string, DbRow[]>();         // "name"
  for (const r of rows) {
    const nb = normalize(r.brand);
    const nn = normalize(r.name);
    const bnKey = `${nb}|${nn}`;
    (byBrandName.get(bnKey) ?? byBrandName.set(bnKey, []).get(bnKey)!).push(r);
    (byName.get(nn) ?? byName.set(nn, []).get(nn)!).push(r);
  }
  return { byBrandName, byName };
}

type Resolution =
  | { ok: true; row: DbRow }
  | { ok: false; reason: 'missing' | 'ambiguous'; candidates?: DbRow[] };

function resolve(side: Side, idx: ReturnType<typeof buildIndexes>): Resolution {
  const nb = normalize(side.brand);
  const nn = normalize(side.name);

  // 1. exact brand+name
  const bn = idx.byBrandName.get(`${nb}|${nn}`) ?? [];
  if (bn.length === 1) return { ok: true, row: bn[0] };
  if (bn.length > 1) return { ok: false, reason: 'ambiguous', candidates: bn };

  // 2. unique name across catalog — but ONLY if the brand is compatible.
  // A name-only match with a contradicting brand (e.g. seed "Maison Alhambra
  // Salvador" matching catalog "Salvador Dali — Salvador") is a FALSE POSITIVE
  // that ships a wrong curated dupe. For founder-curated data an honest
  // "unresolved" is always safer than a confident mismatch, so name matches
  // must pass the same brand-compatibility check as the multi-match path.
  const brandCompatible = (r: DbRow) =>
    normalize(r.brand).includes(nb) || nb.includes(normalize(r.brand));
  const nameMatches = (idx.byName.get(nn) ?? []).filter(brandCompatible);
  if (nameMatches.length === 1) return { ok: true, row: nameMatches[0] };
  if (nameMatches.length > 1) return { ok: false, reason: 'ambiguous', candidates: nameMatches };
  return { ok: false, reason: 'missing' };
}

function label(s: Side): string { return `${s.brand} — ${s.name}`; }

async function main() {
  const file = path.join(__dirname, 'data', 'dupe-seeds.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf-8')) as { pairs: SeedPair[] };
  const pairs = json.pairs ?? [];
  console.log(`Seed pairs: ${pairs.length}   (${COMMIT ? 'COMMIT' : 'DRY RUN'})\n`);

  const catalog = await fetchCatalog();
  console.log(`Catalog rows: ${catalog.length}\n`);
  const idx = buildIndexes(catalog);

  const toInsert: { original_id: string; dupe_id: string; match_pct: number; source: string; note: string | null }[] = [];
  const problems: string[] = [];

  for (const p of pairs) {
    const o = resolve(p.original, idx);
    const d = resolve(p.dupe, idx);

    if (!o.ok) { problems.push(`UNRESOLVED original (${o.reason}): ${label(p.original)}`); continue; }
    if (!d.ok) { problems.push(`UNRESOLVED dupe (${d.reason}): ${label(p.dupe)}  [for ${label(p.original)}]`); continue; }
    if (o.row.id === d.row.id) { problems.push(`SELF-PAIR skipped: ${label(p.original)}`); continue; }

    const issues: string[] = [];
    if (!d.row.is_active) issues.push('dupe inactive');
    if (!d.row.purchasable) issues.push('dupe not purchasable (won\'t render)');
    const oMsrp = o.row.retail_msrp_usd_cents ?? 0;
    const dMsrp = d.row.retail_msrp_usd_cents ?? 0;
    if (oMsrp > 0 && dMsrp > 0 && dMsrp >= oMsrp) issues.push(`dupe not cheaper ($${dMsrp / 100} >= $${oMsrp / 100})`);

    const notCheaper = issues.some((i) => i.startsWith('dupe not cheaper'));
    if (STRICT && (notCheaper || !d.row.purchasable || !d.row.is_active)) {
      problems.push(`SKIPPED ${label(p.original)} -> ${label(p.dupe)}: ${issues.join(', ')}`);
      continue;
    }
    const resolved = `[O→ ${o.row.brand} "${o.row.name}" $${(oMsrp/100).toFixed(2)}  |  D→ ${d.row.brand} "${d.row.name}" $${(dMsrp/100).toFixed(2)}]`;
    if (issues.length) {
      console.log(`  ⚠ ${label(p.original)} -> ${label(p.dupe)} [${p.match_pct}%]: ${issues.join(', ')}\n      ${resolved}`);
    } else {
      console.log(`  ✓ ${label(p.original)} -> ${label(p.dupe)} [${p.match_pct}%, ${p.source}]\n      ${resolved}`);
    }

    toInsert.push({
      original_id: o.row.id,
      dupe_id: d.row.id,
      match_pct: p.match_pct,
      source: p.source,
      note: p.note ?? null,
    });
  }

  console.log(`\nResolved & ready: ${toInsert.length} / ${pairs.length}`);
  if (problems.length) {
    console.log(`\n── Problems (${problems.length}) — ingest these originals/dupes, then re-run ──`);
    for (const pr of problems) console.log(`  • ${pr}`);
  }

  if (!COMMIT) {
    console.log(`\nDRY RUN — nothing written. Re-run with --commit to upsert ${toInsert.length} rows.`);
    return;
  }
  if (toInsert.length === 0) { console.log('\nNothing to write.'); return; }

  const { error } = await supabase
    .from('fragrance_dupes')
    .upsert(toInsert, { onConflict: 'original_id,dupe_id' });
  if (error) { console.error('\nUpsert failed:', error.message); process.exit(1); }
  console.log(`\n✓ Upserted ${toInsert.length} curated dupe pairs.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
