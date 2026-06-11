/**
 * P1 catalog cleanup: collapse duplicate/typo/variant brand rows into one
 * canonical brand each, matching scripts/data/brand-aliases.json.
 *
 *   RENAME  — variant has no canonical counterpart yet: rename the brand row.
 *   MERGE   — canonical brand already exists: repoint every fragrance from the
 *             variant to the canonical brand_id, then delete the empty variant.
 *             Fragrance ids/slugs are untouched, so wardrobe / dupe / similar
 *             references (which key on fragrance id, not brand) all survive.
 *
 * DRY RUN by default. --commit writes. A rollback manifest (every fragrance id
 * repointed + the deleted/renamed brand rows) is written before any write.
 *
 * Usage:
 *   npx tsx scripts/fix-brand-data.ts            # DRY RUN
 *   npx tsx scripts/fix-brand-data.ts --commit   # writes
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const COMMIT = process.argv.includes('--commit');
const DATA_DIR = path.join(__dirname, 'data');

// from -> canonical. Direction follows brand-aliases.json (e.g. "Christian Dior" -> "Dior").
const FIXES: { from: string; to: string }[] = [
  { from: 'lattafa', to: 'Lattafa' },
  { from: 'Maison Francis Kurkdijan', to: 'Maison Francis Kurkdjian' },
  { from: 'YSL - Yves Saint Laurent', to: 'Yves Saint Laurent' },
  { from: 'Dolce and Gabbana', to: 'Dolce & Gabbana' },
  { from: 'Dolce &amp; Gabbana', to: 'Dolce & Gabbana' },
  { from: 'Marmol and Son', to: 'Marmol & Son' },
  { from: 'Christian Dior', to: 'Dior' },
];

async function brandId(name: string): Promise<string | null> {
  const { data } = await supabase.from('brands').select('id').eq('name', name).maybeSingle();
  return data?.id ?? null;
}

async function main() {
  const renames: { id: string; from: string; to: string }[] = [];
  const merges: { fromBrand: string; toBrand: string; fromId: string; toId: string; fragranceIds: string[] }[] = [];

  for (const { from, to } of FIXES) {
    const fromId = await brandId(from);
    if (!fromId) { console.log(`skip "${from}" — no such brand`); continue; }
    const toId = await brandId(to);

    if (!toId) {
      renames.push({ id: fromId, from, to });
      continue;
    }
    if (toId === fromId) { console.log(`skip "${from}" — already canonical`); continue; }

    const { data: frs } = await supabase.from('fragrances').select('id').eq('brand_id', fromId);
    merges.push({ fromBrand: from, toBrand: to, fromId, toId, fragranceIds: (frs ?? []).map((r) => r.id) });
  }

  console.log(`RENAME brands: ${renames.length}`);
  renames.forEach((r) => console.log(`  "${r.from}" -> "${r.to}"`));
  console.log(`MERGE brands : ${merges.length}`);
  merges.forEach((m) => console.log(`  "${m.fromBrand}" -> "${m.toBrand}"  (repoint ${m.fragranceIds.length} fragrances, delete variant)`));

  if (!COMMIT) { console.log('\nDRY RUN — re-run with --commit to write.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifest = path.join(DATA_DIR, `_brand-fix-${stamp}.json`);
  fs.writeFileSync(manifest, JSON.stringify({ renames, merges }, null, 2));
  console.log(`\nrollback manifest -> ${manifest}`);

  for (const r of renames) {
    const { error } = await supabase.from('brands').update({ name: r.to }).eq('id', r.id);
    console.log(error ? `  rename FAIL "${r.from}": ${error.message}` : `  renamed "${r.from}" -> "${r.to}"`);
  }
  for (const m of merges) {
    const { error: upErr } = await supabase.from('fragrances').update({ brand_id: m.toId }).eq('brand_id', m.fromId);
    if (upErr) { console.log(`  repoint FAIL "${m.fromBrand}": ${upErr.message}`); continue; }
    const { error: delErr } = await supabase.from('brands').delete().eq('id', m.fromId);
    console.log(delErr
      ? `  repointed ${m.fragranceIds.length} but delete FAIL "${m.fromBrand}": ${delErr.message}`
      : `  merged "${m.fromBrand}" -> "${m.toBrand}" (${m.fragranceIds.length} fragrances)`);
  }
}

main();
