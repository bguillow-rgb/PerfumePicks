/**
 * Cleanup: Remove fragrances with no affiliate buy links from Supabase.
 *
 * Two cleanup passes:
 *
 *   Pass 1 — Orphaned fragrances (NO LONGER DELETED)
 *     Fragrances with no row in fragrance_retailer_links. These have no
 *     working affiliate buy path — but many are marquee designer originals
 *     people want DUPES of. Hard-deleting them was the root cause of the
 *     catalog/enrichment mismatch AND rotted the precomputed relations.
 *     We now mark them purchasable=false (visible/searchable, usable as a
 *     dupe "original", but no buy button) instead of deleting. Rows that
 *     regain a retailer link are flipped back to purchasable=true.
 *     Dry-run by default; pass --confirm to apply the flag.
 *
 *   Pass 2 — Body Perfume junk rows
 *     Fragrances where name ILIKE 'Body Perfume for%'. These slip through
 *     dupe filters in older ETL runs and should always be removed.
 *     Also dry-run by default; deleted when --confirm is passed.
 *
 * Usage:
 *   npx tsx scripts/cleanup-non-affiliate-frags.ts           # dry run
 *   npx tsx scripts/cleanup-non-affiliate-frags.ts --confirm # real delete
 *
 * Required env (in .env.local):
 *   SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ─── Env / client ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const CONFIRM  = process.argv.includes('--confirm');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Print a sample of rows for dry-run visibility */
function printSample(label: string, rows: Array<{ id: string; slug: string; name: string }>) {
  const sample = rows.slice(0, 20);
  console.log(`\n${label} (showing up to 20 of ${rows.length}):`);
  for (const r of sample) {
    console.log(`  [${r.id}] ${r.slug} — "${r.name}"`);
  }
  if (rows.length > 20) console.log(`  ... and ${rows.length - 20} more`);
}

// ─── Pass 1: Orphaned fragrances (no retailer link) → purchasable=false ──────

async function cleanupOrphans(): Promise<number> {
  console.log('\n── Pass 1: Orphaned fragrances (no affiliate link) ──');

  // Fetch all fragrance IDs that HAVE at least one retailer link (paginated)
  const linkedIds = new Set<string>();
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('fragrance_retailer_links')
      .select('fragrance_id')
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(`Failed to fetch linked fragrance IDs: ${error.message}`);
    for (const r of data ?? []) linkedIds.add(r.fragrance_id);
    if ((data ?? []).length < 1000) break;
  }
  console.log(`  Fragrances with at least one retailer link: ${linkedIds.size}`);

  // Fetch all fragrances + their current purchasable flag (paginated)
  const allFragrances: Array<{ id: string; slug: string; name: string; purchasable: boolean }> = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('fragrances')
      .select('id, slug, name, purchasable')
      .order('slug', { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(`Failed to fetch all fragrances: ${error.message}`);
    allFragrances.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  console.log(`  Total fragrances: ${allFragrances.length}`);

  // Reconcile in BOTH directions so the flag self-heals:
  //   - linked but currently purchasable=false  → flip back to true
  //   - not linked but currently purchasable=true → flip to false
  const toUnpurchasable = allFragrances.filter((f) => !linkedIds.has(f.id) && f.purchasable);
  const toPurchasable   = allFragrances.filter((f) => linkedIds.has(f.id) && !f.purchasable);

  console.log(`  To mark purchasable=false (orphan, currently true):  ${toUnpurchasable.length}`);
  console.log(`  To mark purchasable=true  (re-linked, currently false): ${toPurchasable.length}`);

  if (toUnpurchasable.length === 0 && toPurchasable.length === 0) {
    console.log('  Nothing to reconcile.');
    return 0;
  }

  printSample('Will become purchasable=false', toUnpurchasable);

  if (!CONFIRM) {
    console.log('\n  DRY RUN — pass --confirm to apply the purchasable flag.');
    return 0;
  }

  const BATCH = 100;

  async function applyFlag(rows: Array<{ id: string }>, value: boolean): Promise<number> {
    const ids = rows.map((r) => r.id);
    let updated = 0;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const { error: updErr } = await supabase
        .from('fragrances')
        .update({ purchasable: value })
        .in('id', batch);
      if (updErr) {
        console.warn(`  Update batch ${i}–${i + BATCH} (purchasable=${value}) failed: ${updErr.message}`);
      } else {
        updated += batch.length;
        console.log(`  Set purchasable=${value} on ${updated}/${ids.length}...`);
      }
    }
    return updated;
  }

  const flaggedOff = await applyFlag(toUnpurchasable, false);
  const flaggedOn  = await applyFlag(toPurchasable, true);

  console.log(`  ✓ Pass 1 complete. purchasable=false: ${flaggedOff}, purchasable=true: ${flaggedOn}.`);
  return flaggedOff + flaggedOn;
}

// ─── Pass 2: Body Perfume junk rows ──────────────────────────────────────────

async function cleanupBodyPerfume(): Promise<number> {
  console.log('\n── Pass 2: Dupe/oil junk rows ──');

  // Fetch all fragrances with names matching dupe/oil patterns (paginated)
  const JUNK_PATTERNS = [
    'Body Perfume for',
    'Type Perfume Oil',
    'Type Cologne Oil',
    'Perfume Oil Roll-on',
    'Bronzing Mousse',
    'Self Tan',
    'Body Lotion',
    'Shower Gel',
    'Hand Cream',
    'Hand Lotion',
    'Body Scrub',
    'Body Polish',
    'Hair Mist',
    'Shampoo',
    'Conditioner',
    'Deodorant Stick',
    'Body Butter',
    'Body Wash',
    'Lip Balm',
    'Face Cream',
    'Eye Cream',
    'Gift Set',
    'Piece Set',
    '2 Piece',
    '3 Piece',
    '4 Piece',
    '5 Piece',
    'Mini Set',
    'Value Set',
    'Coffret',
  ];

  const allJunk: Array<{ id: string; slug: string; name: string }> = [];
  for (const pattern of JUNK_PATTERNS) {
    for (let page = 0; ; page++) {
      const { data, error } = await supabase
        .from('fragrances')
        .select('id, slug, name')
        .ilike('name', `%${pattern}%`)
        .range(page * 1000, page * 1000 + 999);
      if (error) { console.warn(`  Warning fetching pattern "${pattern}": ${error.message}`); break; }
      allJunk.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
  }

  // Deduplicate by id
  const seen = new Set<string>();
  const rows = allJunk.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
  console.log(`  Found: ${rows.length} dupe/oil junk rows`);

  if (rows.length === 0) {
    console.log('  Nothing to clean up.');
    return 0;
  }

  printSample('Dupe/oil junk rows', rows);

  if (!CONFIRM) {
    console.log('\n  DRY RUN — pass --confirm to delete these.');
    return 0;
  }

  const ids = rows.map((r: { id: string }) => r.id);
  const BATCH = 100;
  let deleted = 0;

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    // Delete retailer links first (FK constraint)
    await supabase.from('fragrance_retailer_links').delete().in('fragrance_id', batch);
    // Delete fragrances
    const { error: delErr } = await supabase.from('fragrances').delete().in('id', batch);
    if (delErr) console.warn(`  Warning batch delete failed: ${delErr.message}`);
    else deleted += batch.length;
    if ((i + BATCH) % 500 === 0 || i + BATCH >= ids.length) {
      console.log(`  Deleted ${Math.min(i + BATCH, ids.length)}/${ids.length} dupe/oil rows...`);
    }
  }

  console.log(`  ✓ Pass 2 complete. Deleted ${deleted} dupe/oil fragrances.`);
  return deleted;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!CONFIRM) {
    console.log('DRY RUN mode. No data will be deleted. Pass --confirm to execute.');
  } else {
    console.log('CONFIRM mode. Deletions will be executed.');
  }

  const orphansReconciled  = await cleanupOrphans();
  const bodyPerfumeDeleted = await cleanupBodyPerfume();

  console.log('\n── Summary ──');
  if (CONFIRM) {
    console.log(`  Orphan purchasable flags reconciled: ${orphansReconciled}`);
    console.log(`  Body Perfume / junk rows deleted:    ${bodyPerfumeDeleted}`);
  } else {
    console.log('  DRY RUN complete. Re-run with --confirm to apply.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
