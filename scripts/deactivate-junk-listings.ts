/**
 * Soft-deactivates junk catalog rows that are unambiguous non-fragrances or
 * non-canonical listings: tester bottles, "Bundle & Save" vendor entries, and
 * body-care products (after shave, deodorant, lotion, dusting powder, soap).
 *
 * Safety contract:
 *   - SOFT delete only (is_active=false). Reversible; no FK cascade.
 *   - NEVER touches a fragrance referenced by a user (wardrobe / wear log /
 *     swipe / review / compliment). Those are HELD and printed for manual review.
 *   - Duplicate forks are intentionally NOT handled here (needs the matcher).
 *   - Idempotent: re-running deactivates nothing new.
 *
 * Run:  npx tsx scripts/deactivate-junk-listings.ts          (dry-run, default)
 *       npx tsx scripts/deactivate-junk-listings.ts --apply  (writes)
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { normalizeStr } from './lib/affiliate-etl-base';
dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const sb = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function fetchAll<T>(table: string, cols: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let q = sb.from(table).select(cols).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// Body-care / non-perfume product types. Conservative: only clear non-fragrances.
const NON_PERFUME = [
  /after\s*shave/i, /shav(e|ing)\s+(balm|gel|cream|foam)/i, /\bdeodorant\b/i,
  /\bbody\s+(lotion|cream|milk|butter|souffl|powder|mist)/i,
  /\bdusting\s+powder\b/i, /\b(bar\s+soap|soap\s+with)\b/i,
  /\bmoisturi[sz]ing\s+cream\b/i, /\banti-?stress\b.*cream/i,
];
function isNonPerfume(name: string): boolean { return NON_PERFUME.some((re) => re.test(name)); }
function isTester(name: string): boolean { return /\btester\b/i.test(name); }

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}\n`);

  const brands = await fetchAll<{ id: string; name: string }>('brands', 'id, name');
  const brandName = new Map(brands.map((b) => [b.id, b.name]));

  const frags = await fetchAll<{ id: string; name: string; slug: string; brand_id: string }>(
    'fragrances', 'id, name, slug, brand_id', (q) => q.eq('is_active', true),
  );
  console.log(`Active fragrances: ${frags.length}`);

  // user-reference set — any of these → HOLD, never auto-deactivate
  const refTables = ['wardrobe_items', 'wear_logs', 'swipe_feedback', 'fragrance_reviews', 'compliments_log'];
  const userRef = new Set<string>();
  for (const t of refTables) {
    try {
      const rows = await fetchAll<{ fragrance_id: string }>(t, 'fragrance_id');
      rows.forEach((r) => r.fragrance_id && userRef.add(r.fragrance_id));
    } catch (e) { console.warn(`  (skip ${t}: ${(e as Error).message})`); }
  }
  console.log(`Distinct fragrances referenced by users: ${userRef.size}\n`);

  const bundle: typeof frags = [], tester: typeof frags = [], nonperf: typeof frags = [];
  for (const f of frags) {
    const bn = brandName.get(f.brand_id) ?? '';
    if (normalizeStr(bn) === 'bundle save' || /bundle\s*&?\s*save/i.test(bn)) { bundle.push(f); continue; }
    if (isTester(f.name)) { tester.push(f); continue; }
    if (isNonPerfume(f.name)) { nonperf.push(f); continue; }
  }

  const candidates = [...bundle, ...tester, ...nonperf];
  const held = candidates.filter((f) => userRef.has(f.id));
  const toDeactivate = candidates.filter((f) => !userRef.has(f.id));

  console.log(`Tester:       ${tester.length}`);
  console.log(`Bundle&Save:  ${bundle.length}`);
  console.log(`Non-perfume:  ${nonperf.length}`);
  console.log(`──────────────────────────`);
  console.log(`Candidates:   ${candidates.length}`);
  console.log(`HELD (user):  ${held.length}  → NOT touched`);
  console.log(`To deactivate: ${toDeactivate.length}\n`);
  held.forEach((f) => console.log(`  HELD: "${f.name}" [${f.slug}]`));

  if (!toDeactivate.length) { console.log('\nNothing to deactivate.'); return; }
  if (!APPLY) { console.log('\nDry-run only. Re-run with --apply to write.'); return; }

  // Apply in chunks of 200.
  const ids = toDeactivate.map((f) => f.id);
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { error } = await sb.from('fragrances').update({ is_active: false }).in('id', chunk);
    if (error) throw new Error(`deactivate failed: ${error.message}`);
    done += chunk.length;
    console.log(`  deactivated ${done}/${ids.length}`);
  }
  console.log(`\n✓ Deactivated ${done} junk listings (soft, reversible).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
