/**
 * fix-fragranceshop-link-id — repair every FragranceShop affiliate URL.
 *
 * THE BUG (found 2026-08-28, verified against CJ's link-search API):
 * our FragranceShop links are built as
 *   https://www.anrdoezrs.net/click-101759456-16941446?url={encoded}
 * where CJ's `click-{PID}-{AID}` format expects AID = a LINK id from the
 * advertiser's catalog that our publisher account is joined to.
 *
 * 16941446 is NOT a link id. It appears nowhere in FragranceShop's catalog
 * (advertiser 7287203) — the real ids are 16941520-16942205. It was taken from
 * the product-feed URL pattern (see the comment at etl-fragranceshop-feed.ts:49,
 * "FragranceShop's CJ advertiser ID (from feed URL pattern)") — a feed id is not
 * an ad id. CJ cannot credit our publisher for a click on an ad id we don't
 * hold, which is why FragranceShop has never posted a single commission, while
 * the same CJ account pays out normally on other advertisers.
 *
 * THE FIX: 16942202 — "Designer Fragrance - Discount Prices", link-type
 * Text Link, allow-deep-linking=true, relationship-status=joined. Text Link +
 * deep-linking is exactly what the `?url=` deep-link parameter requires, and it
 * mirrors the Perfumania link (17277211) that is correctly formed.
 *
 * SAFETY: only the AID segment of the URL is rewritten; the encoded destination
 * is untouched. Every prior value is written to a rollback file before any
 * update. Dry-run by default.
 *
 * NOTE: this repairs the DATABASE. The same bad id is also hardcoded in the ETL
 * scripts (fixed in the same commit) and in the marketing site's article
 * markdown (web/src/content/articles/*.md), which needs a site redeploy.
 *
 * Run:  npx tsx scripts/fix-fragranceshop-link-id.ts            (dry-run)
 *       npx tsx scripts/fix-fragranceshop-link-id.ts --apply
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const BAD_AID = '16941446';
const GOOD_AID = '16942202';

const sb = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type Row = { id: string; retailer: string; url: string | null; checkout_url: string | null };

/** Rewrite ONLY the click-{PID}-{AID} segment; leave the ?url= payload alone. */
function repair(u: string | null): string | null {
  if (!u) return null;
  const fixed = u.replace(
    new RegExp(`(/click-\\d+-)${BAD_AID}(?=[?/-]|$)`),
    `$1${GOOD_AID}`,
  );
  return fixed === u ? null : fixed;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}   ${BAD_AID} → ${GOOD_AID}\n`);

  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('fragrance_retailer_links')
      .select('id, retailer, url, checkout_url')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }

  const updates = rows
    .map((r) => ({ r, url: repair(r.url), checkout_url: repair(r.checkout_url) }))
    .filter((x) => x.url || x.checkout_url);

  console.log(`scanned ${rows.length} retailer links; ${updates.length} carry the bad ad id`);
  const byRetailer: Record<string, number> = {};
  updates.forEach((u) => { byRetailer[u.r.retailer] = (byRetailer[u.r.retailer] ?? 0) + 1; });
  console.log('by retailer:', JSON.stringify(byRetailer));
  if (updates.length) {
    console.log('\nsample rewrite:');
    console.log(`  before: ${updates[0].r.url}`);
    console.log(`  after : ${updates[0].url}`);
  }

  if (!updates.length) { console.log('\nnothing to do.'); return; }
  if (!APPLY) { console.log(`\n(dry-run — re-run with --apply to write ${updates.length} rows)`); return; }

  // Rollback log BEFORE any write.
  const rollbackPath = path.join(process.cwd(), 'scripts/data/rollback-fragranceshop-link-id.json');
  fs.writeFileSync(rollbackPath, JSON.stringify({
    at: new Date().toISOString(), bad: BAD_AID, good: GOOD_AID,
    rows: updates.map((u) => ({ id: u.r.id, url: u.r.url, checkout_url: u.r.checkout_url })),
  }, null, 2));
  console.log(`\nrollback written → ${rollbackPath}`);

  let done = 0;
  for (const u of updates) {
    const patch: Record<string, string> = {};
    if (u.url) patch.url = u.url;
    if (u.checkout_url) patch.checkout_url = u.checkout_url;
    const { error } = await sb.from('fragrance_retailer_links').update(patch).eq('id', u.r.id);
    if (error) throw new Error(`update ${u.r.id}: ${error.message}`);
    if (++done % 100 === 0) console.log(`  updated ${done}/${updates.length}`);
  }
  console.log(`\n✓ repaired ${done} links`);
}
main().catch((e) => { console.error(e); process.exit(1); });
