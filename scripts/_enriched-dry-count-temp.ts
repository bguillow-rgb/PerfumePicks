/**
 * READ-ONLY dry count: how many TRULY net-new designer originals would
 * enriched-candidates.json add, deduped by brand + concentration-stripped name
 * against ALL existing fragrance rows (active + inactive). Writes nothing.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { CandidateFragrance, normalize } from './types';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const DATA_DIR = path.join(__dirname, 'data');
const IN_PATH = path.join(DATA_DIR, 'enriched-candidates.json');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing env'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const BRAND_ALIASES: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'brand-aliases.json'), 'utf-8'));
function canonicalBrand(raw: string): string {
  return BRAND_ALIASES[raw] ?? BRAND_ALIASES[raw.trim()] ?? raw.trim();
}

const CONCENTRATION_SUFFIXES = [
  'extrait de parfum', 'eau de parfum intense', 'eau de parfum',
  'eau de toilette intense', 'eau de toilette', 'eau de cologne',
  'eau fraiche', 'parfum', 'extrait', 'cologne', 'body mist', 'hair mist',
  'body spray', 'perfume oil', 'oil', 'solid', 'edp', 'edt', 'edc',
];
function stripConcentration(name: string): string {
  const n = normalize(name);
  for (const suffix of CONCENTRATION_SUFFIXES) {
    if (n.endsWith(' ' + suffix)) return n.slice(0, n.length - suffix.length - 1).trim();
    if (n === suffix) return n;
  }
  return n;
}
function matchKey(brand: string, name: string): string {
  return `${normalize(canonicalBrand(brand))}|${stripConcentration(name)}`;
}

async function main() {
  const enriched: CandidateFragrance[] = JSON.parse(fs.readFileSync(IN_PATH, 'utf-8'));
  console.log(`enriched-candidates.json rows: ${enriched.length}`);

  // unique candidate keys
  const candKeys = new Map<string, CandidateFragrance>();
  for (const c of enriched) candKeys.set(matchKey(c.brand, c.name), c);
  console.log(`unique candidate keys (brand+base-name): ${candKeys.size}`);

  // Existing catalog: ALL rows, build matchKey set
  const existing = new Set<string>();
  let activeCount = 0, totalRows = 0;
  let from = 0; const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('fragrances')
      .select('name, is_active, brands(name)')
      .range(from, from + PAGE - 1);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const r of data as any[]) {
      totalRows++;
      if (r.is_active) activeCount++;
      const brandName = r.brands?.name ?? '';
      existing.add(matchKey(brandName, r.name));
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`existing rows: ${totalRows} (active ${activeCount}) | unique existing keys: ${existing.size}`);

  let overlap = 0, netNew = 0;
  const sample: string[] = [];
  const brandTally = new Map<string, number>();
  for (const [key, c] of candKeys) {
    if (existing.has(key)) overlap++;
    else {
      netNew++;
      const b = canonicalBrand(c.brand);
      brandTally.set(b, (brandTally.get(b) ?? 0) + 1);
      if (sample.length < 30) sample.push(`${b} — ${c.name}`);
    }
  }

  console.log('\n──────────── VERDICT ────────────');
  console.log(`candidate originals          : ${candKeys.size}`);
  console.log(`already in catalog (any form): ${overlap}`);
  console.log(`NET-NEW designer originals   : ${netNew}`);
  console.log(`catalog rows: ${totalRows} → ${totalRows + netNew} (+${netNew})`);

  console.log('\nNet-new by brand (top 25):');
  [...brandTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
    .forEach(([b, n]) => console.log(`  ${String(n).padStart(4)}  ${b}`));

  console.log('\nSample net-new:');
  sample.forEach((s) => console.log(`  ${s}`));
}
main().catch((e) => { console.error(e); process.exit(1); });
