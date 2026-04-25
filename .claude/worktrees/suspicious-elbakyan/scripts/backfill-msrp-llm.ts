/**
 * Backfill `price_usd_cents` on catalog rows where it's NULL.
 *
 * Why this exists:
 *   The llm-expansion pipeline populated strength/body/price_tier/flavors but
 *   didn't ask the LLM for an actual MSRP per stick — only the 1-5 tier. The
 *   humidor flow seeds a cigar's price from cigars.price_usd_cents when a
 *   user adds it. With ~4,925 rows at NULL, those cigars were showing as
 *   $0.00 on add and inflating the "Collection value" tally to garbage.
 *
 * What this does:
 *   - SELECTs every cigar where price_usd_cents IS NULL
 *   - Batches (10 per LLM call) and asks Claude for a typical-MSRP-per-stick
 *     estimate grounded in brand + line + vitola + wrapper + origin +
 *     price_tier (which was already populated).
 *   - Clamps the LLM output to a sane range (USD cents: 150..10_000, i.e.
 *     $1.50..$100.00 per stick) so a hallucinated $5M price can't land.
 *   - UPDATEs each row individually. Only updates rows where
 *     price_usd_cents IS NULL at write time (defensive double-check), so if
 *     anything concurrently sets a price it won't get clobbered.
 *
 * Safety:
 *   - --dry (default): prints the plan + estimates for the first 20 rows,
 *     does not hit the DB for writes.
 *   - --commit: required flag for actual writes.
 *   - Resume-safe: at start, re-queries for NULL rows, so a mid-run crash
 *     can be recovered by just running --commit again.
 *   - Checkpoint log at /tmp/sp-msrp-backfill.log.
 *   - Never updates rows that already have a price — the .is('price_usd_cents', null)
 *     filter is on both the SELECT and the UPDATE.
 *
 * Usage:
 *   npx tsx scripts/backfill-msrp-llm.ts           # dry run
 *   npx tsx scripts/backfill-msrp-llm.ts --commit  # live
 *
 * Cost estimate:
 *   ~$0.20-0.40 total at Sonnet 4.5 pricing for ~4,900 rows.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env. Source .env.local first.');
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY. Source .env.local first.');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const MODEL = 'claude-sonnet-4-5';
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const LOG_PATH = '/tmp/sp-msrp-backfill.log';

// Clamp range for a single premium cigar's MSRP. Anything outside this range
// is treated as a hallucination and the row gets skipped — an LLM-emitted
// 0 or 500000 cents never hits the DB.
const MIN_CENTS = 150;   // $1.50
const MAX_CENTS = 10_000; // $100.00

interface Row {
  id: string;
  brand: string;
  line: string | null;
  vitola: string | null;
  wrapper: string | null;
  origin: string | null;
  price_tier: number | null;
  popularity_tier: number | null;
}

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch {}
}

function buildPrompt(batch: Row[]): { system: string; user: string } {
  const system = `You are a cigar-pricing expert. For each cigar, estimate its typical MSRP per single stick at a U.S. premium-tobacconist retailer, in U.S. cents (integer).

Ground your estimate in the provided fields (brand, line, vitola, wrapper, origin, price_tier, popularity_tier) and what you know about current premium-cigar pricing.

Tier reference (price_tier was already assigned during enrichment):
  1  →  typically < $5/stick       → roughly 300-499 cents
  2  →  typically $5-7.99/stick    → roughly 500-799 cents
  3  →  typically $8-11.99/stick   → roughly 800-1199 cents
  4  →  typically $12-19.99/stick  → roughly 1200-1999 cents
  5  →  typically $20+/stick       → roughly 2000-4500 cents (cap very rare cigars at 10000)

Large vitolas (Gordo, Double Corona, 6x60+) typically cost more than smaller ones in the same line. Iconic brands and limited releases skew higher within their tier.

Return STRICT JSON. No markdown. No prose. No trailing comma. The output must be an array with exactly the same length as the input, in the same order. Each object must have ONLY these keys: id, msrp_cents.

"id" must echo the input's "id" field exactly.
"msrp_cents" must be an integer in the range 150..10000. Out-of-range values will be rejected.`;

  const input = batch.map((r) => ({
    id: r.id,
    brand: r.brand,
    line: r.line,
    vitola: r.vitola,
    wrapper: r.wrapper,
    origin: r.origin,
    price_tier: r.price_tier,
    popularity_tier: r.popularity_tier,
  }));

  const user = `Estimate MSRP for these ${batch.length} cigars:\n\n${JSON.stringify(input, null, 2)}`;
  return { system, user };
}

async function callClaude(system: string, user: string): Promise<any[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`anthropic ${res.status}: ${body.slice(0, 200)}`);
  }
  const payload = await res.json();
  const text = payload?.content?.[0]?.text ?? '';
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

async function estimateBatch(batch: Row[]): Promise<Map<string, number>> {
  const { system, user } = buildPrompt(batch);
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const parsed = await callClaude(system, user);
      if (!Array.isArray(parsed)) throw new Error('non-array response');
      const out = new Map<string, number>();
      for (const p of parsed) {
        const id = String(p?.id ?? '');
        const cents = Number(p?.msrp_cents);
        if (!id || !Number.isInteger(cents) || cents < MIN_CENTS || cents > MAX_CENTS) continue;
        out.set(id, cents);
      }
      return out;
    } catch (e) {
      lastErr = e;
      log(`  attempt ${attempt}/${MAX_RETRIES} failed: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  log(`  giving up on batch: ${String(lastErr)}`);
  return new Map();
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  log(`starting MSRP backfill (commit=${commit})`);

  // Fetch all rows with NULL price. Paged to work around the 1000-row limit.
  const rows: Row[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb
      .from('cigars')
      .select('id,brand,line,vitola,wrapper,origin,price_tier,popularity_tier')
      .is('price_usd_cents', null)
      .range(from, from + pageSize - 1);
    if (error) { console.error(error); process.exit(1); }
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  log(`rows with NULL price_usd_cents: ${rows.length}`);

  if (rows.length === 0) {
    log('nothing to do.');
    return;
  }

  // Dry-run caps at 5 batches (50 rows) so the user can eyeball estimates
  // before paying for the full ~500-batch run. --commit runs everything.
  const DRY_SAMPLE_BATCHES = 5;
  const effectiveRows = commit ? rows : rows.slice(0, DRY_SAMPLE_BATCHES * BATCH_SIZE);
  log(`will process ${effectiveRows.length} rows (${commit ? 'full commit' : `dry-sample of first ${DRY_SAMPLE_BATCHES} batches`})`);

  const totalBatches = Math.ceil(effectiveRows.length / BATCH_SIZE);
  let estimated = 0;
  let updated = 0;
  let skipped = 0;
  const samples: Array<{ brand: string; line: string | null; vitola: string | null; cents: number }> = [];

  for (let i = 0; i < effectiveRows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const idx = Math.floor(i / BATCH_SIZE) + 1;
    const map = await estimateBatch(batch);
    estimated += map.size;
    skipped += batch.length - map.size;

    for (const row of batch) {
      const cents = map.get(row.id);
      if (cents == null) continue;
      if (samples.length < 20) samples.push({ brand: row.brand, line: row.line, vitola: row.vitola, cents });
      if (commit) {
        // Defensive filter: only write if still NULL. Avoids stomping any
        // concurrently-set value.
        const { error } = await sb
          .from('cigars')
          .update({ price_usd_cents: cents })
          .eq('id', row.id)
          .is('price_usd_cents', null);
        if (error) {
          log(`  update error id=${row.id}: ${error.message}`);
        } else {
          updated += 1;
        }
      }
    }

    if (idx % 10 === 0 || idx === totalBatches) {
      log(`batch ${idx}/${totalBatches}  estimated=${estimated}  updated=${updated}  skipped=${skipped}`);
    }
  }

  log('\n=== DONE ===');
  log(`rows needing price:     ${rows.length}`);
  log(`LLM estimates produced: ${estimated}`);
  log(`rows updated in DB:     ${updated}`);
  log(`skipped (clamp/parse):  ${skipped}`);

  console.log('\n--- sample of first 20 estimates ---');
  for (const s of samples) {
    const dollars = (s.cents / 100).toFixed(2);
    console.log(`  $${dollars.padStart(6)}   ${s.brand} | ${s.line} | ${s.vitola}`);
  }
  if (!commit) {
    console.log('\n(DRY RUN — no DB writes performed. Pass --commit to write.)');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
