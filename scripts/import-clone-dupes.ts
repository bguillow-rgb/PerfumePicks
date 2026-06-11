/**
 * import-clone-dupes — load clone-house + community dupe pairs into fragrance_dupes.
 *
 * Companion to import-dupe-seeds.ts (founder seed/editorial pairs). This one
 * ingests the broader, scale-out tiers introduced in 202606111200:
 *
 *   tier "clone_house"  → source='clone_house'  (VERIFIED — renders in Budget Dupes)
 *     A clone house formulated the product TO BE a clone of one specific original
 *     and declares it, OR there is one overwhelming/unambiguous consensus original.
 *
 *   tier "community"    → source='community'     (rendered separately as Community
 *     Dupes, opinion-only, shown when no verified dupe exists)
 *     Real but weaker/contested crowd consensus.
 *
 * Pair direction here is { dupe: <the cheap bottle, e.g. Lattafa>, original: <the
 * pricey designer/niche bottle> } — same as dupe-seeds.json.
 *
 * KEY DIFFERENCE from import-dupe-seeds.ts: the ORIGINAL (pricey bottle) is often
 * not in the catalog yet, and it only needs to exist as a non-purchasable FK
 * target / detail page. So missing originals are AUTO-CREATED as minimal rows
 * (purchasable=false, is_active=true, notes_verified=false) — mirroring
 * import-originals-no-affiliate. The DUPE, by contrast, must already exist AND be
 * purchasable (you have to be able to buy the cheap one for the dupe to convert);
 * a missing / non-purchasable dupe is REPORTED, never auto-created, because a
 * non-purchasable dupe can't render anyway (get_dupes filters d.purchasable).
 *
 * Resolution per side mirrors import-dupe-seeds.ts (exact brand+name, then unique
 * brand-compatible name). Ambiguous matches are reported, never guessed.
 *
 * DRY RUN by default — prints what it WOULD do, including which originals it would
 * create. Pass --commit to write.
 *
 * Run:
 *   source .env.local && npx tsx scripts/import-clone-dupes.ts            # dry run
 *   source .env.local && npx tsx scripts/import-clone-dupes.ts --commit   # write
 *
 * Requires the 202606111200_community_dupes migration (clone_house/community in
 * the source check constraint) to be applied first.
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
// Allow a custom input file: --file=scripts/data/lattafa-dupes.json
const fileArg = process.argv.find((a) => a.startsWith('--file='))?.slice('--file='.length);
const INPUT = fileArg
  ? path.resolve(fileArg)
  : path.join(__dirname, 'data', 'lattafa-dupes.json');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

function brandSlug(name: string): string { return normalize(name).replace(/\s+/g, '-'); }
function fragranceSlug(brand: string, name: string): string {
  return `${normalize(brand)}-${normalize(name)}`.replace(/\s+/g, '-');
}

type Side = { brand: string; name: string };
type Tier = 'clone_house' | 'community';
type ClonePair = {
  dupe: Side;
  original: Side;
  match_pct: number;
  tier: Tier;
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
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('fragrances')
      .select('id, slug, name, is_active, retail_msrp_usd_cents, purchasable, brands(name)')
      .range(offset, offset + PAGE - 1);
    if (error) { console.error('Catalog fetch error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const r of data as any[]) {
      rows.push({
        id: r.id,
        slug: r.slug,
        name: r.name ?? '',
        brand: r.brands?.name ?? '',
        is_active: r.is_active,
        purchasable: r.purchasable ?? false,
        retail_msrp_usd_cents: r.retail_msrp_usd_cents,
      });
    }
    if (data.length < PAGE) break;
  }
  return rows;
}

function buildIndexes(rows: DbRow[]) {
  const byBrandName = new Map<string, DbRow[]>();
  const byName = new Map<string, DbRow[]>();
  for (const r of rows) {
    const bnKey = `${normalize(r.brand)}|${normalize(r.name)}`;
    (byBrandName.get(bnKey) ?? byBrandName.set(bnKey, []).get(bnKey)!).push(r);
    const nn = normalize(r.name);
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
  const bn = idx.byBrandName.get(`${nb}|${nn}`) ?? [];
  if (bn.length === 1) return { ok: true, row: bn[0] };
  if (bn.length > 1) return { ok: false, reason: 'ambiguous', candidates: bn };
  const brandCompatible = (r: DbRow) =>
    normalize(r.brand).includes(nb) || nb.includes(normalize(r.brand));
  const nameMatches = (idx.byName.get(nn) ?? []).filter(brandCompatible);
  if (nameMatches.length === 1) return { ok: true, row: nameMatches[0] };
  if (nameMatches.length > 1) return { ok: false, reason: 'ambiguous', candidates: nameMatches };
  return { ok: false, reason: 'missing' };
}

function label(s: Side): string { return `${s.brand} — ${s.name}`; }

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`Input file not found: ${INPUT}`);
    console.error('Create it (see scripts/data/lattafa-dupes.json) or pass --file=...');
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(INPUT, 'utf-8')) as { pairs: ClonePair[] };
  const pairs = json.pairs ?? [];
  console.log(`Input: ${path.relative(process.cwd(), INPUT)}`);
  console.log(`Pairs: ${pairs.length}   (${COMMIT ? 'COMMIT' : 'DRY RUN'})\n`);

  let catalog = await fetchCatalog();
  console.log(`Catalog rows: ${catalog.length}\n`);
  let idx = buildIndexes(catalog);

  // ── Pass 1: figure out which ORIGINALS are missing and must be created ──────
  // We only create the *original* side (the pricey bottle) as a non-purchasable
  // FK target. We never create the dupe side.
  const missingOriginals = new Map<string, Side>();   // slug -> Side
  for (const p of pairs) {
    const o = resolve(p.original, idx);
    if (!o.ok && o.reason === 'missing') {
      missingOriginals.set(fragranceSlug(p.original.brand, p.original.name), p.original);
    }
  }

  if (missingOriginals.size) {
    console.log(`── Originals to auto-create (non-purchasable FK targets): ${missingOriginals.size} ──`);
    for (const s of missingOriginals.values()) console.log(`  + ${label(s)}`);
    console.log('');

    if (COMMIT) {
      // 1. ensure brands
      const uniqueBrands = [...new Set([...missingOriginals.values()].map((s) => s.brand))];
      const brandRows = uniqueBrands.map((name) => ({ name, slug: brandSlug(name) }));
      await supabase.from('brands').upsert(brandRows, { onConflict: 'slug', ignoreDuplicates: true });
      const { data: bData } = await supabase
        .from('brands').select('id, slug').in('slug', uniqueBrands.map(brandSlug));
      const brandIds = new Map<string, string>();
      for (const r of bData ?? []) brandIds.set(r.slug, r.id);

      // 2. insert minimal non-purchasable original rows (notes/scores backfilled later)
      const rows = [];
      for (const s of missingOriginals.values()) {
        const brand_id = brandIds.get(brandSlug(s.brand));
        if (!brand_id) { console.warn(`  SKIP create (no brand_id): ${label(s)}`); continue; }
        rows.push({
          slug: fragranceSlug(s.brand, s.name),
          name: s.name,
          brand_id,
          notes_verified: false,
          is_active: true,
          purchasable: false,
          source: 'clone-dupe-original',
        });
      }
      const { error } = await supabase
        .from('fragrances').upsert(rows, { onConflict: 'slug', ignoreDuplicates: true });
      if (error) { console.error('Original auto-create failed:', error.message); process.exit(1); }
      console.log(`✓ Created/ensured ${rows.length} original rows.\n`);

      // refresh catalog + index so the originals now resolve
      catalog = await fetchCatalog();
      idx = buildIndexes(catalog);
    } else {
      console.log('(DRY RUN — originals not created; they will resolve after --commit)\n');
    }
  }

  // ── Pass 2: resolve every pair and stage dupe rows ──────────────────────────
  const toInsert: { original_id: string; dupe_id: string; match_pct: number; source: string; note: string | null }[] = [];
  const problems: string[] = [];
  const counts = { clone_house: 0, community: 0 };

  for (const p of pairs) {
    const o = resolve(p.original, idx);
    const d = resolve(p.dupe, idx);

    // In dry run the original may still be "missing" because we didn't create it
    // yet — treat that as a will-resolve, not a problem, so the report is clean.
    if (!o.ok) {
      if (!COMMIT && o.reason === 'missing'
          && missingOriginals.has(fragranceSlug(p.original.brand, p.original.name))) {
        // will be created on commit; fall through to validate the dupe side only
      } else {
        problems.push(`UNRESOLVED original (${o.reason}): ${label(p.original)}`);
        continue;
      }
    }
    if (!d.ok) { problems.push(`UNRESOLVED dupe (${d.reason}): ${label(p.dupe)}  [for ${label(p.original)}]`); continue; }

    // Dupe MUST be purchasable + active or it can't render / convert.
    const dIssues: string[] = [];
    if (!d.row.is_active) dIssues.push('dupe inactive');
    if (!d.row.purchasable) dIssues.push("dupe not purchasable (won't render — ingest with a buy link first)");
    if (dIssues.length) {
      problems.push(`SKIPPED ${label(p.original)} -> ${label(p.dupe)}: ${dIssues.join(', ')}`);
      continue;
    }

    // Cheaper-than sanity (warn only; clone bottles are cheaper, but the original
    // may not have an MSRP yet since it was just auto-created).
    if (o.ok) {
      const oMsrp = o.row.retail_msrp_usd_cents ?? 0;
      const dMsrp = d.row.retail_msrp_usd_cents ?? 0;
      if (oMsrp > 0 && dMsrp > 0 && dMsrp >= oMsrp) {
        console.log(`  ⚠ ${label(p.original)} -> ${label(p.dupe)}: dupe not cheaper ($${dMsrp/100} >= $${oMsrp/100})`);
      }
    }

    if (!o.ok) {
      // dry-run, original pending creation — count it as ready and move on
      console.log(`  ✓ ${label(p.original)} -> ${label(p.dupe)} [${p.match_pct}%, ${p.tier}] (original will be created)`);
      counts[p.tier]++;
      continue;
    }
    if (o.row.id === d.row.id) { problems.push(`SELF-PAIR skipped: ${label(p.original)}`); continue; }

    console.log(`  ✓ ${label(p.original)} -> ${label(p.dupe)} [${p.match_pct}%, ${p.tier}]`);
    counts[p.tier]++;
    toInsert.push({
      original_id: o.row.id,
      dupe_id: d.row.id,
      match_pct: p.match_pct,
      source: p.tier,
      note: p.note ?? null,
    });
  }

  console.log(`\nResolved: ${counts.clone_house} clone_house (verified) + ${counts.community} community = ${counts.clone_house + counts.community} / ${pairs.length}`);
  if (problems.length) {
    console.log(`\n── Problems (${problems.length}) — fix source data, then re-run ──`);
    for (const pr of problems) console.log(`  • ${pr}`);
  }

  if (!COMMIT) {
    console.log(`\nDRY RUN — nothing written. Re-run with --commit.`);
    return;
  }
  if (toInsert.length === 0) { console.log('\nNothing to write.'); return; }

  const { error } = await supabase
    .from('fragrance_dupes')
    .upsert(toInsert, { onConflict: 'original_id,dupe_id' });
  if (error) { console.error('\nUpsert failed:', error.message); process.exit(1); }
  console.log(`\n✓ Upserted ${toInsert.length} dupe pairs (${counts.clone_house} clone_house + ${counts.community} community).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
