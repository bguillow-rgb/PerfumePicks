/**
 * dna-enrich-famous-blocked — fill family / gender / price_tier / accord_intensity
 * on the household-name rows that the seed pass tiered to popularity>=3 but that
 * the catalog imported under-enriched (fragrance_family null, gender defaulted to
 * unisex, price_tier defaulted to 2, accord_intensity empty). (Milestone M0.)
 *
 * These are NOT guesses — they are well-documented, widely-known compositions.
 * Values use the same conventions as the rest of the catalog:
 *   - fragrance_family  ∈ the controlled vocab the discover filters use
 *   - gender            ∈ feminine | masculine | unisex
 *   - price_tier        1..5 (1 cheapest .. 5 luxury); coverage bands: <=2 low, 3 mid, >=4 high
 *   - accord_intensity  Record<accord, 0..5>
 *
 * Rows are matched by normalized name among popularity_tier>=3 rows (the seed pass
 * already isolated these). Only fields that are currently null/empty are written —
 * we never clobber a value the ETL/enrichment already set. A row still needs an
 * image_url to become dna_eligible; image-less famous rows (No. 5, etc.) are
 * enriched here but remain image-blocked until a LICENSED image is sourced (the
 * image-rights legal-open item) — this script never sources images.
 *
 * DRY RUN by default. Pass --commit to write. Re-run dna-compute-eligible.ts after.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/dna-enrich-famous-blocked.ts
 *   set -a && source .env.local && set +a && npx tsx scripts/dna-enrich-famous-blocked.ts --commit
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { normalizeStr } from './lib/affiliate-etl-base';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const COMMIT = process.argv.includes('--commit');

type Enrich = {
  family: string;
  gender: 'feminine' | 'masculine' | 'unisex';
  price_tier: number;
  accords: Record<string, number>;
};

// Keyed by a normalized name fragment that uniquely identifies the row among the
// tier>=3 set. Compositions per brand/Fragrantica public note breakdowns.
const FAMOUS: { match: string; e: Enrich }[] = [
  { match: 'flowerbomb',        e: { family: 'floral',   gender: 'feminine',  price_tier: 4, accords: { floral: 5, sweet: 4, gourmand: 3, patchouli: 3, woody: 2 } } },
  { match: 'daisy',             e: { family: 'floral',   gender: 'feminine',  price_tier: 3, accords: { floral: 4, 'white-floral': 4, fresh: 3, fruity: 3, woody: 2 } } },
  { match: 'la vie est belle',  e: { family: 'gourmand', gender: 'feminine',  price_tier: 4, accords: { sweet: 4, gourmand: 4, patchouli: 4, vanilla: 3, floral: 3 } } },
  { match: 'j adore',           e: { family: 'floral',   gender: 'feminine',  price_tier: 4, accords: { floral: 5, 'white-floral': 4, fruity: 3, woody: 2 } } },
  { match: 'idole',             e: { family: 'floral',   gender: 'feminine',  price_tier: 4, accords: { floral: 4, rose: 4, musky: 3, fresh: 3, woody: 2 } } },
  { match: 'the one',           e: { family: 'oriental', gender: 'feminine',  price_tier: 3, accords: { amber: 3, vanilla: 3, floral: 3, 'warm-spicy': 3, fruity: 2 } } },
  { match: 'light blue pour homme', e: { family: 'citrus', gender: 'masculine', price_tier: 3, accords: { citrus: 4, fresh: 4, woody: 3, aromatic: 2 } } },

  // Image-less famous rows: enriched but will stay dna_eligible=false until a
  // licensed image is attached (image-rights legal-open). pt set realistically.
  { match: 'no 5',              e: { family: 'floral',   gender: 'feminine',  price_tier: 4, accords: { floral: 5, 'white-floral': 4, powdery: 4, aldehydic: 4, woody: 2 } } },
  { match: '1 million parfum',  e: { family: 'oriental', gender: 'masculine', price_tier: 4, accords: { 'warm-spicy': 4, leather: 3, amber: 3, sweet: 3, woody: 2 } } },
  { match: 'love don t be shy', e: { family: 'gourmand', gender: 'feminine',  price_tier: 5, accords: { sweet: 5, gourmand: 4, vanilla: 4, floral: 3, 'orange-blossom': 3 } } },
  { match: 'portrait of a lady',e: { family: 'chypre',   gender: 'feminine',  price_tier: 5, accords: { rose: 5, patchouli: 4, 'warm-spicy': 4, woody: 3, incense: 3 } } },
  { match: 'tam dao',           e: { family: 'woody',    gender: 'unisex',    price_tier: 5, accords: { woody: 5, sandalwood: 5, 'warm-spicy': 2, cedar: 3, musky: 2 } } },
  { match: 'philosykos',        e: { family: 'green',    gender: 'unisex',    price_tier: 5, accords: { green: 4, fresh: 4, woody: 3, 'fig': 5, coconut: 2 } } },
];

type Frag = {
  id: string; name: string; fragrance_family: string | null;
  gender: string | null; price_tier: number | null;
  accord_intensity: Record<string, number> | null;
};

async function fetchTier3(): Promise<Frag[]> {
  const PAGE = 1000; const rows: Frag[] = [];
  const cols = 'id, name, fragrance_family, gender, price_tier, accord_intensity';
  for (let o = 0; ; o += PAGE) {
    const { data, error } = await supabase.from('fragrances').select(cols)
      .gte('popularity_tier', 3).range(o, o + PAGE - 1);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data || !data.length) break;
    rows.push(...(data as Frag[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  console.log(`dna-enrich-famous-blocked  (${COMMIT ? 'COMMIT' : 'DRY RUN'})\n`);
  const rows = await fetchTier3();
  const byKey = new Map<string, Frag[]>();
  for (const r of rows) {
    const k = normalizeStr(r.name);
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(r);
  }

  let planned = 0; const notFound: string[] = [];
  for (const { match, e } of FAMOUS) {
    // exact normalized match, else startsWith token-prefix
    let hits = byKey.get(match);
    if (!hits) {
      hits = [];
      for (const [k, rs] of byKey) if (k === match || k.startsWith(match + ' ')) hits.push(...rs);
    }
    if (!hits.length) { notFound.push(match); continue; }
    for (const r of hits) {
      // only fill the empty fields (never clobber)
      const patch: Record<string, unknown> = {};
      if (!r.fragrance_family) patch.fragrance_family = e.family;
      if (!r.gender || r.gender === 'unisex') {
        // keep an explicit non-default gender; only overwrite the defaulted 'unisex'/null
        if (e.gender !== 'unisex') patch.gender = e.gender;
        else if (!r.gender) patch.gender = e.gender;
      }
      if (r.price_tier == null || r.price_tier === 2) patch.price_tier = e.price_tier;
      if (!r.accord_intensity || Object.keys(r.accord_intensity).length === 0) patch.accord_intensity = e.accords;
      if (!Object.keys(patch).length) continue;
      planned++;
      console.log(`  ${r.name}`);
      for (const [k, v] of Object.entries(patch)) console.log(`      ${k} = ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      if (COMMIT) {
        const { error } = await supabase.from('fragrances').update(patch).eq('id', r.id);
        if (error) { console.error(`  update ${r.name}:`, error.message); process.exit(1); }
      }
    }
  }

  console.log(`\nplanned updates: ${planned}`);
  if (notFound.length) console.log(`not found (skipped): ${notFound.join(', ')}`);
  if (!COMMIT) { console.log('\nDRY RUN — nothing written. Re-run with --commit to apply.'); return; }
  console.log('\n  ✓ applied. Next: dna-compute-eligible.ts --commit, then dna-coverage-report.ts');
}

main().catch((e) => { console.error(e); process.exit(1); });
