/**
 * LLM enrichment pass for the merged-candidates.json file.
 *
 * Halfwheel and cigarsinternational publish objective specs (wrapper, filler,
 * origin, MSRP) but not the subjective/derived fields our app relies on for
 * quiz matching: strength (1-5), body (1-5), price_tier (1-5), and
 * flavors[] (controlled-vocabulary flavor tags). This script fills those
 * fields by asking Claude Sonnet 4.5 to produce a strict JSON object per
 * cigar based on wrapper/binder/filler/origin/description/MSRP.
 *
 * Pipeline:
 *   1. Read scripts/data/merged-candidates.json.
 *   2. Batch the rows (10 per request to stay under output-token limits).
 *   3. Call ANTHROPIC_API_KEY endpoint with a strict JSON-mode system prompt.
 *   4. Merge the returned fields back into each row.
 *   5. Write scripts/data/enriched-candidates.json.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/enrich-catalog-llm.ts
 *   npx tsx scripts/enrich-catalog-llm.ts --resume    # skip rows already enriched
 *
 * Cost estimate: ~$0.30-0.60 for a 4,000-row enrichment batch on Sonnet 4.5.
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, 'data');
const IN_PATH = path.join(DATA_DIR, 'merged-candidates.json');
const OUT_PATH = path.join(DATA_DIR, 'enriched-candidates.json');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY. See Supabase Edge Function env for reference.');
  process.exit(1);
}

const MODEL = 'claude-sonnet-4-5';
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

// Keep the flavor vocabulary aligned with the existing corpus so quiz
// matching stays consistent. Source: src/features/quiz/scoring.ts keywords.
const FLAVOR_VOCAB = [
  'cream', 'vanilla', 'caramel', 'honey', 'chocolate', 'cocoa',
  'earth', 'leather', 'cedar', 'wood', 'oak',
  'pepper', 'spice', 'cinnamon', 'mineral',
  'nut', 'almond', 'peanut', 'cashew',
  'cherry', 'citrus', 'fruit', 'raisin', 'plum',
  'coffee', 'espresso', 'toast', 'bread',
  'tobacco', 'hay', 'grass', 'floral', 'tea',
  'barnyard', 'smoke', 'char',
];

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

function enrichedKey(r: CandidateRow): string {
  return `${r.brand}|${r.line}|${r.vitola ?? ''}`;
}

function buildPrompt(batch: CandidateRow[]): { system: string; user: string } {
  const system = `You are a cigar expert assistant. For each cigar in the input, estimate five fields:

1. strength — integer 1-5, where 1=mild, 2=mild-medium, 3=medium, 4=medium-full, 5=full/bold
2. body — integer 1-5, same scale for body/weight
3. price_tier — integer 1-5 based on MSRP per stick:
     1 = < $5, 2 = $5-7.99, 3 = $8-11.99, 4 = $12-19.99, 5 = $20+
   If no MSRP is provided, estimate from wrapper/origin/line positioning.
4. popularity_tier — integer 1-5 indicating how well-known the cigar is:
     5 — Iconic classic (Padrón 1964, Arturo Fuente Opus X, Cohiba Behike, Davidoff Winston Churchill)
     4 — Well-known mainstream (Liga Privada No. 9, My Father, Oliva Serie V, Rocky Patel Decade)
     3 — Respected boutique (Crowned Heads Four Kicks, Warped Futuro, RoMa Craft CroMagnon)
     2 — Niche / store pick (limited edition, regional exclusive, small-batch)
     1 — Deep cut / obscure (discontinued, private-label, very limited release)
5. flavors — array of 3-6 lowercase keyword tags drawn ONLY from this vocabulary:
     ${FLAVOR_VOCAB.join(', ')}

Rules:
- Base estimates on wrapper, binder, filler, origin, line positioning, and description when available.
- Be conservative on strength/body — most premium cigars sit in the 3-4 range.
- Return STRICT JSON. No markdown. No prose. No trailing comma.
- The output must be an array with exactly the same length as the input array, in the same order.
- Each output object must have ONLY these keys: key, strength, body, price_tier, popularity_tier, flavors.
- "key" must echo the input's "key" field exactly so we can match results back.`;

  const input = batch.map((r) => ({
    key: enrichedKey(r),
    brand: r.brand,
    line: r.line,
    vitola: r.vitola,
    wrapper: r.wrapper,
    binder: r.binder,
    filler: r.filler,
    origin: r.origin,
    msrp_usd: r.price_usd_cents ? (r.price_usd_cents / 100).toFixed(2) : null,
    description: r.description?.slice(0, 500) ?? null,
  }));

  const user = `Analyze these ${batch.length} cigars and return the JSON array:\n\n${JSON.stringify(input, null, 2)}`;
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
      max_tokens: 4000,
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
  // The prompt demands strict JSON, but Claude sometimes wraps in ```json```
  // anyway. Strip fences defensively.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

async function enrichBatch(batch: CandidateRow[]): Promise<CandidateRow[]> {
  const { system, user } = buildPrompt(batch);
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const parsed = await callClaude(system, user);
      if (!Array.isArray(parsed) || parsed.length !== batch.length) {
        throw new Error(`bad response length ${parsed?.length}`);
      }
      // Map results back by key so we don't rely on order alone.
      const byKey = new Map<string, any>(parsed.map((p: any) => [p.key, p]));
      return batch.map((row) => {
        const p = byKey.get(enrichedKey(row));
        if (!p) return row;
        const flavors = Array.isArray(p.flavors)
          ? p.flavors.filter((f: string) => FLAVOR_VOCAB.includes(f)).slice(0, 6)
          : [];
        const clamp = (n: any): number | null => {
          const v = Number(n);
          if (!Number.isFinite(v)) return null;
          return Math.max(1, Math.min(5, Math.round(v)));
        };
        return {
          ...row,
          strength: clamp(p.strength),
          body: clamp(p.body),
          price_tier: clamp(p.price_tier),
          popularity_tier: clamp(p.popularity_tier),
          flavors,
        };
      });
    } catch (e) {
      lastErr = e;
      console.warn(`  attempt ${attempt}/${MAX_RETRIES} failed:`, (e as Error).message);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  console.error('  giving up on batch:', lastErr);
  return batch; // return unenriched — merge step can still insert, quiz just won't score them
}

async function main() {
  const args = process.argv.slice(2);
  const resume = args.includes('--resume');

  if (!fs.existsSync(IN_PATH)) {
    console.error(`No input file at ${IN_PATH}. Run merge-scraped-sources.ts first.`);
    process.exit(1);
  }
  const input: CandidateRow[] = JSON.parse(fs.readFileSync(IN_PATH, 'utf-8'));

  const existing: CandidateRow[] = resume && fs.existsSync(OUT_PATH)
    ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf-8'))
    : [];
  const done = new Set(existing.map((r) => enrichedKey(r)));
  const toDo = input.filter((r) => !done.has(enrichedKey(r)));

  console.log(`input=${input.length} already_enriched=${existing.length} to_enrich=${toDo.length}`);

  const enriched: CandidateRow[] = [...existing];

  for (let i = 0; i < toDo.length; i += BATCH_SIZE) {
    const batch = toDo.slice(i, i + BATCH_SIZE);
    process.stdout.write(`[${i + batch.length}/${toDo.length}] enriching... `);
    const out = await enrichBatch(batch);
    enriched.push(...out);
    process.stdout.write(`ok\n`);
    // Flush to disk every batch — crash safety.
    fs.writeFileSync(OUT_PATH, JSON.stringify(enriched, null, 2));
  }

  console.log(`wrote ${enriched.length} enriched rows to ${OUT_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
