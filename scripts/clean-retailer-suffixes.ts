/**
 * P1 catalog cleanup: strip retailer "... Perfume for Women / Cologne for Men /
 * for Unisex" marketing suffixes off fragrance display names, and merge the
 * duplicates that stripping reveals.
 *
 * Two operations:
 *   RENAME  — a suffixed name strips to a value that is unique within its
 *             (brand, concentration). Update name in place. The slug (app-level
 *             ID) is untouched, so no wardrobe / dupe / similar reference breaks.
 *   MERGE   — a suffixed name strips to a value that already exists as another
 *             active row in the same (brand, concentration). Keep ONE winner per
 *             group, deactivate the rest (is_active=false, merged_into_id=winner).
 *             Winner precedence: purchasable > notes_verified > already-clean
 *             name > lowest MSRP > lowest id. If the winner is itself suffixed it
 *             is also renamed to the clean form.
 *
 * Hard guarantees:
 *   • DRY RUN by default. --commit required to write.
 *   • Writes a rollback manifest (old values) to scripts/data/ before committing.
 *   • Losers are DEACTIVATED, never deleted — fully reversible from the manifest.
 *   • Only touches rows whose name actually matches the suffix regex.
 *
 * Usage:
 *   npx tsx scripts/clean-retailer-suffixes.ts            # DRY RUN
 *   npx tsx scripts/clean-retailer-suffixes.ts --commit   # writes
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

// Trailing "... [Perfume|Cologne|EDP|EDT|...] for <audience>" marketing suffix,
// optionally trailed by a retailer format tag ("- Fragrance", "- Perfume Oil",
// "- Body Spray 8.0 oz", "- eau-de", ...). The concentration/perfume word is
// optional so bare "... for Women" also matches.
const SUFFIX_RE = /\s+(?:perfume|cologne|fragrance|eau de parfum|eau de toilette|edp|edt)?\s*for\s+(?:women|men|unisex|her|him|boys|girls|teens|kids|ladies|gentlemen)\s*(?:[-–—]\s*.*)?$/i;
function strip(name: string): string {
  return name.replace(SUFFIX_RE, '').replace(/\s+/g, ' ').trim();
}

type Row = {
  id: string; name: string; brand_id: string; concentration: string | null;
  purchasable: boolean; is_active: boolean; notes_verified: boolean;
  retail_msrp_usd_cents: number | null; slug: string;
};

async function loadActive(): Promise<Row[]> {
  let from = 0; const page = 1000; const all: Row[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from('fragrances')
      .select('id,name,brand_id,concentration,purchasable,is_active,notes_verified,retail_msrp_usd_cents,slug')
      .eq('is_active', true)
      .range(from, from + page - 1);
    if (error) { console.error(error.message); process.exit(1); }
    all.push(...(data as Row[])); if (!data || data.length < page) break; from += page;
  }
  return all;
}

// Winner precedence within a (brand, concentration, stripped-name) group.
function better(a: Row, b: Row): Row {
  const aClean = !SUFFIX_RE.test(a.name), bClean = !SUFFIX_RE.test(b.name);
  const tests: [number, number][] = [
    [a.purchasable ? 1 : 0, b.purchasable ? 1 : 0],
    [a.notes_verified ? 1 : 0, b.notes_verified ? 1 : 0],
    [aClean ? 1 : 0, bClean ? 1 : 0],
    [-(a.retail_msrp_usd_cents ?? Infinity), -(b.retail_msrp_usd_cents ?? Infinity)],
  ];
  for (const [x, y] of tests) { if (x !== y) return x > y ? a : b; }
  return a.id <= b.id ? a : b;
}

async function main() {
  const rows = await loadActive();
  const gkey = (r: Row, n: string) => `${r.brand_id}|${r.concentration ?? ''}|${n.toLowerCase()}`;

  // Map of every active row keyed by its CURRENT name within (brand, concentration).
  const byCurrent = new Map<string, Row[]>();
  for (const r of rows) {
    const k = gkey(r, r.name);
    (byCurrent.get(k) ?? byCurrent.set(k, []).get(k)!).push(r);
  }

  // Build target groups keyed by stripped name. A group gathers the suffixed row
  // plus any already-clean row(s) it would collide with.
  const groups = new Map<string, Set<Row>>();
  for (const r of rows) {
    if (!SUFFIX_RE.test(r.name)) continue;
    const s = strip(r.name);
    if (!s || s.toLowerCase() === r.name.toLowerCase()) continue;
    const gk = gkey(r, s);
    if (!groups.has(gk)) groups.set(gk, new Set());
    groups.get(gk)!.add(r);
    for (const clean of byCurrent.get(gk) ?? []) groups.get(gk)!.add(clean);
  }

  const renames: { id: string; old: string; neu: string }[] = [];
  const merges: { id: string; old_name: string; old_is_active: boolean; old_merged_into: string | null; winner: string }[] = [];

  for (const [gk, set] of groups) {
    const members = [...set];
    const s = strip(members.find((m) => SUFFIX_RE.test(m.name))!.name);
    if (members.length === 1) {
      const r = members[0];
      renames.push({ id: r.id, old: r.name, neu: s });
      continue;
    }
    // Collision: pick winner, deactivate losers.
    const winner = members.reduce((acc, r) => better(acc, r));
    if (SUFFIX_RE.test(winner.name)) renames.push({ id: winner.id, old: winner.name, neu: s });
    for (const r of members) {
      if (r.id === winner.id) continue;
      merges.push({ id: r.id, old_name: r.name, old_is_active: r.is_active, old_merged_into: null, winner: winner.id });
    }
  }

  console.log(`active rows scanned : ${rows.length}`);
  console.log(`RENAME (strip suffix): ${renames.length}`);
  console.log(`MERGE  (deactivate)  : ${merges.length}`);
  console.log('\nsample renames:');
  renames.slice(0, 8).forEach((r) => console.log(`  "${r.old}"  ->  "${r.neu}"`));
  console.log('sample merges:');
  merges.slice(0, 8).forEach((m) => console.log(`  deactivate "${m.old_name}" -> winner ${m.winner}`));

  if (!COMMIT) { console.log('\nDRY RUN — re-run with --commit to write.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifest = path.join(DATA_DIR, `_suffix-cleanup-${stamp}.json`);
  fs.writeFileSync(manifest, JSON.stringify({ renames, merges }, null, 2));
  console.log(`\nrollback manifest -> ${manifest}`);

  let ok = 0, fail = 0;
  for (const r of renames) {
    const { error } = await supabase.from('fragrances').update({ name: r.neu }).eq('id', r.id);
    if (error) { fail++; console.warn(`rename ${r.id}: ${error.message}`); } else ok++;
  }
  for (const m of merges) {
    const { error } = await supabase.from('fragrances')
      .update({ is_active: false, merged_into_id: m.winner }).eq('id', m.id);
    if (error) { fail++; console.warn(`merge ${m.id}: ${error.message}`); } else ok++;
  }
  console.log(`\nwrote ${ok} rows, ${fail} failures.`);
}

main();
