/**
 * Final step in the scrape-merge-enrich-insert pipeline.
 *
 * Reads  scripts/data/enriched-candidates.json
 * Writes rows into Supabase `cigars` table, batched.
 *
 * Quality gate (hard filter, rows that fail are logged + skipped):
 *   - brand and line are non-empty
 *   - vitola is non-empty (otherwise the swap-vitola feature can't work)
 *   - wrapper OR origin is populated
 *   - strength, body, price_tier are all integers 1..5 (from LLM enrichment)
 *   - flavors[] has at least 2 entries
 *
 * Rows that pass are inserted with image_status='live' so the CigarImage
 * component renders the scraped image by default. Brands can still request
 * takedown → we flip that row's image_status to 'takedown' via one SQL and
 * the app falls back to the placeholder + "Add a photo" affordance.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/insert-enriched-catalog.ts --dry
 *   npx tsx scripts/insert-enriched-catalog.ts --commit
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const IN_PATH = path.join(__dirname, 'data', 'enriched-candidates.json');
const REJECTED_PATH = path.join(__dirname, 'data', 'insert-rejected.json');

interface CandidateRow {
  brand: string;
  line: string;
  name: string;
  vitola: string | null;
  wrapper: string | null;
  binder: string | null;
  filler: string[];
  origin: string | null;
  price_usd_cents: number | null;
  image_url: string | null;
  description: string | null;
  strength: number | null;
  body: number | null;
  price_tier: number | null;
  popularity_tier: number | null;
  flavors: string[];
  sources: string[];
}

const BATCH_SIZE = 50;

// Strict quality gate. Rows failing any of these are dropped, not inserted.
// Rationale: the quiz scorer weights by flavor intersection, so a row with no
// flavors dilutes results; a row with no wrapper or origin can't be explained
// in the "Why this match" reasons block. Drop + log instead of inserting bad data.
function validate(r: CandidateRow): string | null {
  if (!r.brand?.trim()) return 'missing brand';
  if (!r.line?.trim()) return 'missing line';
  if (!r.vitola?.trim()) return 'missing vitola';
  if (!r.wrapper?.trim()) return 'missing wrapper';
  if (!r.origin?.trim()) return 'missing origin';
  for (const [k, v] of [['strength', r.strength], ['body', r.body], ['price_tier', r.price_tier]] as const) {
    if (!Number.isInteger(v as any) || (v as number) < 1 || (v as number) > 5) return `invalid ${k}`;
  }
  if (!Array.isArray(r.flavors) || r.flavors.length < 2) return 'too few flavors';
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');

  if (!fs.existsSync(IN_PATH)) {
    console.error(`No input file at ${IN_PATH}. Run enrich-catalog-llm.ts first.`);
    process.exit(1);
  }
  const rows: CandidateRow[] = JSON.parse(fs.readFileSync(IN_PATH, 'utf-8'));
  console.log(`loaded ${rows.length} enriched rows`);

  const keep: CandidateRow[] = [];
  const reject: Array<{ reason: string; row: CandidateRow }> = [];
  for (const r of rows) {
    const err = validate(r);
    if (err) reject.push({ reason: err, row: r });
    else keep.push(r);
  }
  console.log(`quality gate: keep=${keep.length} reject=${reject.length}`);
  fs.writeFileSync(REJECTED_PATH, JSON.stringify(reject, null, 2));

  if (!commit) {
    console.log('--dry (or no --commit): not writing to DB. Pass --commit to insert.');
    return;
  }

  // Batch insert with conflict handling. The unique key on cigars is implicit —
  // we rely on the merge step to have already deduped against existing rows,
  // so a plain insert is safe.
  let inserted = 0;
  let errors = 0;
  for (let i = 0; i < keep.length; i += BATCH_SIZE) {
    const batch = keep.slice(i, i + BATCH_SIZE).map((r) => ({
      brand: r.brand,
      line: r.line,
      name: r.name,
      vitola: r.vitola,
      strength: r.strength,
      body: r.body,
      price_tier: r.price_tier,
      popularity_tier: r.popularity_tier,
      wrapper: r.wrapper,
      binder: r.binder,
      filler: r.filler,
      origin: r.origin,
      flavors: r.flavors,
      description: r.description,
      image_url: r.image_url,
      image_status: 'live',
      price_usd_cents: r.price_usd_cents,
    }));
    const { data, error } = await sb.from('cigars').insert(batch).select('id');
    if (error) {
      console.error(`batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += (data?.length ?? 0);
      process.stdout.write(`[${inserted}/${keep.length}] inserted\n`);
    }
  }

  console.log(`\nDONE. inserted=${inserted} errors=${errors}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
