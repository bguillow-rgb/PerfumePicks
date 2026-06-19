/**
 * dna-compute-eligible — compute fragrances.dna_eligible (the picker membership
 * gate). (Milestone M0.) Run AFTER dna-seed-popularity.ts, and again after every
 * ETL import so un-enriched new rows stay OUT of the picker.
 *
 * A row is dna_eligible (may appear in the Fragrance DNA picker) iff ALL hold:
 *   • is_active          — not moderation-hidden
 *   • NOT is_discontinued
 *   • popularity_tier >= 3   — recognizable (the founder non-negotiable)
 *   • accord_intensity non-empty   — we can actually read its palate
 *   • image_url present  — recognition needs a visible bottle
 *
 * Everything else → dna_eligible = false. Prints a reasoned breakdown of WHY rows
 * fail (so the curator knows what to fix: enrich accords, source an image, bump a
 * tier). DRY RUN by default; pass --commit to write.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/dna-compute-eligible.ts
 *   set -a && source .env.local && set +a && npx tsx scripts/dna-compute-eligible.ts --commit
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const COMMIT = process.argv.includes('--commit');

type Frag = {
  id: string; name: string; popularity_tier: number; dna_eligible: boolean;
  is_active: boolean; is_discontinued: boolean;
  accord_intensity: Record<string, number> | null; image_url: string | null;
};

async function fetchAll(): Promise<Frag[]> {
  const PAGE = 1000; const rows: Frag[] = [];
  const cols = 'id, name, popularity_tier, dna_eligible, is_active, is_discontinued, accord_intensity, image_url';
  for (let o = 0; ; o += PAGE) {
    const { data, error } = await supabase.from('fragrances').select(cols).range(o, o + PAGE - 1);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data || !data.length) break;
    rows.push(...(data as Frag[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

const hasAccords = (a: Frag['accord_intensity']) => !!a && Object.keys(a).length > 0;
const hasImage = (u: string | null) => !!u && u.trim().length > 0;

function isEligible(f: Frag): boolean {
  return f.is_active && !f.is_discontinued && f.popularity_tier >= 3 && hasAccords(f.accord_intensity) && hasImage(f.image_url);
}

async function main() {
  console.log(`dna-compute-eligible  (${COMMIT ? 'COMMIT' : 'DRY RUN'})\n`);
  const frags = await fetchAll();

  // Reasoned breakdown: why does a recognizable (tier>=3) row fail?
  const fail = { inactive: 0, discontinued: 0, lowTier: 0, noAccords: 0, noImage: 0 };
  const fixable: { name: string; reason: string }[] = []; // tier>=3 but missing accords/image
  let eligible = 0;
  const toTrue: string[] = []; const toFalse: string[] = [];

  for (const f of frags) {
    const want = isEligible(f);
    if (want) eligible++;
    if (want && !f.dna_eligible) toTrue.push(f.id);
    if (!want && f.dna_eligible) toFalse.push(f.id);

    if (!want) {
      if (!f.is_active) fail.inactive++;
      else if (f.is_discontinued) fail.discontinued++;
      else if (f.popularity_tier < 3) fail.lowTier++;
      else {
        // recognizable but ineligible → fixable, the curator's worklist
        if (!hasAccords(f.accord_intensity)) { fail.noAccords++; fixable.push({ name: f.name, reason: 'no accord_intensity' }); }
        else if (!hasImage(f.image_url)) { fail.noImage++; fixable.push({ name: f.name, reason: 'no image_url' }); }
      }
    }
  }

  console.log(`catalog: ${frags.length} fragrances`);
  console.log(`ELIGIBLE: ${eligible}   (changes: +${toTrue.length} → true, ${toFalse.length} → false)\n`);
  console.log('=== INELIGIBLE BREAKDOWN ===');
  console.log(`  inactive:        ${fail.inactive}`);
  console.log(`  discontinued:    ${fail.discontinued}`);
  console.log(`  tier < 3:        ${fail.lowTier}   (catalog-only long tail — expected)`);
  console.log(`  tier>=3 no accords: ${fail.noAccords}   ← FIXABLE (enrich)`);
  console.log(`  tier>=3 no image:   ${fail.noImage}   ← FIXABLE (source image / set purchasable=false)`);

  if (fixable.length) {
    console.log('\n=== CURATOR WORKLIST (recognizable but blocked) ===');
    for (const x of fixable.slice(0, 40)) console.log(`  ${x.reason.padEnd(18)} ${x.name}`);
    if (fixable.length > 40) console.log(`  … +${fixable.length - 40} more`);
  }

  // Tier distribution among eligible (sanity)
  const dist: Record<number, number> = {};
  for (const f of frags) if (isEligible(f)) dist[f.popularity_tier] = (dist[f.popularity_tier] ?? 0) + 1;
  console.log('\n=== ELIGIBLE BY TIER ===');
  for (const t of [5, 4, 3]) console.log(`  tier ${t}: ${dist[t] ?? 0}`);

  if (!COMMIT) { console.log('\nDRY RUN — nothing written. Re-run with --commit to apply.'); return; }

  console.log('\nApplying...');
  for (const [val, ids] of [[true, toTrue], [false, toFalse]] as const) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      if (!chunk.length) continue;
      const { error } = await supabase.from('fragrances').update({ dna_eligible: val }).in('id', chunk);
      if (error) { console.error('update chunk:', error.message); process.exit(1); }
    }
  }
  console.log(`  ✓ dna_eligible: +${toTrue.length} true, ${toFalse.length} false. Total eligible: ${eligible}.`);
  console.log('\nNext: scripts/dna-coverage-report.ts to check picker coverage.');
}

main().catch((e) => { console.error(e); process.exit(1); });
