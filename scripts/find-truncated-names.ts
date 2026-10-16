/**
 * find-truncated-names.ts — report catalog rows whose display name stops
 * mid-phrase, e.g. "Bad Boy Le" (really "Bad Boy Le Parfum") or "Une Fleur de"
 * (really "Une Fleur de Chanel").
 *
 * Why this exists: a truncated name is close to invisible. The row still
 * returns for its own broken string, so nothing errors — it simply never
 * matches what a person types. "Bleu de" sat at the top of results for the
 * catalog's most-searched fragrance until 2026-10-16, when it was found by
 * accident while chasing an unrelated zero-result report.
 *
 * READ-ONLY. It prints; it never writes. Fixing is a judgement call per row:
 *   - a full-name sibling already exists  -> merge (merged_into_id + is_active=false)
 *   - no sibling                          -> rename, restoring ONLY the dropped
 *                                            token, confirmed against source_url
 *                                            or a real product listing
 * Renaming is safe for user data: wardrobe/wear rows key on slug, which does
 * not change, and name_normalized is a generated column that follows name.
 *
 * Two caveats learned the hard way, both of which this script reports rather
 * than decides:
 *   - Not every hit is truncated. "Le De Givenchy" and "Shangri La" genuinely
 *     end in these words.
 *   - A sibling is not automatically the merge target. "La Belle Le" matched
 *     "La Belle Le Parfum Intense", which is a different product; the right
 *     answer was to rename it "La Belle Le Parfum".
 *
 * Run: npx tsx scripts/find-truncated-names.ts
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) { console.error('missing env'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });

/** Words a real fragrance name rarely ends on. */
const DANGLING = [
  'de', 'du', 'des', 'la', 'le', 'les', 'of', 'the', 'pour', 'for',
  'and', 'et', 'd', 'l', 'a', 'an', 'by', 'in', 'with', 'no',
];

async function main() {
  const { data, error } = await supabase
    .from('fragrances')
    .select('slug,name,source,source_url,retail_msrp_usd_cents,popularity_tier,brand:brands(name)')
    .eq('is_active', true)
    .is('merged_into_id', null)
    .limit(20000);
  if (error) { console.error(error.message); process.exit(1); }

  const rows = (data ?? []) as any[];
  const suspect = rows.filter((r) => {
    const last = String(r.name ?? '').trim().toLowerCase().split(/\s+/).pop() ?? '';
    return DANGLING.includes(last);
  });

  // A row whose name is a strict prefix of a sibling in the same brand is a
  // merge CANDIDATE — not a decision, see the header.
  const byBrand = new Map<string, any[]>();
  for (const r of rows) {
    const b = r.brand?.name ?? '';
    if (!byBrand.has(b)) byBrand.set(b, []);
    byBrand.get(b)!.push(r);
  }

  console.log(`${suspect.length} row(s) ending mid-phrase, of ${rows.length} active:\n`);
  for (const r of suspect.sort((a, b) => (b.popularity_tier ?? 0) - (a.popularity_tier ?? 0))) {
    const brand = r.brand?.name ?? '?';
    const sibs = (byBrand.get(brand) ?? []).filter(
      (c) => c.slug !== r.slug && String(c.name).toLowerCase().startsWith(String(r.name).toLowerCase() + ' '),
    );
    console.log(`  ${brand} — "${r.name}"  (${r.slug})`);
    console.log(`      pt=${r.popularity_tier} msrp=${r.retail_msrp_usd_cents ?? '-'} source=${r.source ?? 'none'}`);
    if (r.source_url) console.log(`      source_url often carries the true name: ${r.source_url}`);
    for (const s of sibs) console.log(`      sibling (CHECK, may be a different product): "${s.name}"`);
  }
  if (!suspect.length) console.log('  none');
}
main();
