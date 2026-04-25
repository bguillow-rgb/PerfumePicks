/**
 * LLM enrichment pass for merged-candidates.json.
 *
 * Brand sites and Fragrantica publish notes/accords/community performance, but
 * the spec also calls for derived scores that no source publishes:
 *   - compliment_score   (0..1)  — how often does it draw compliments?
 *   - versatility_score  (0..1)  — how broadly does it work?
 *   - office_safe_score  (0..1)  — appropriate for daytime/professional?
 *
 * We also use the LLM as a *fallback* to fill missing accords + family when
 * Fragrantica didn't have them, and to normalize the family taxonomy to a
 * controlled vocabulary so filtering works consistently.
 *
 * Pipeline:
 *   1. Read scripts/data/merged-candidates.json.
 *   2. Batch (10 per request).
 *   3. Call Claude Sonnet 4.5 with strict JSON-mode prompt.
 *   4. Merge filled fields back into rows.
 *   5. Write scripts/data/enriched-candidates.json (resumable).
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/enrich-catalog-llm.ts
 *   npx tsx scripts/enrich-catalog-llm.ts --resume    # skip already enriched
 *
 * Cost estimate: ~$0.50–$1.00 per 1,000 fragrances on Sonnet 4.5.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CandidateFragrance, candidateKey } from './types';

const DATA_DIR = path.join(__dirname, 'data');
const IN_PATH = path.join(DATA_DIR, 'merged-candidates.json');
const OUT_PATH = path.join(DATA_DIR, 'enriched-candidates.json');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY.');
  process.exit(1);
}

const MODEL = 'claude-sonnet-4-5';
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

// Controlled vocab for fragrance_family — keep in sync with the filter chips
// in app/(tabs)/discover.tsx.
const FAMILY_VOCAB = [
  'floral', 'oriental', 'woody', 'fresh', 'gourmand',
  'chypre', 'fougère', 'aromatic', 'leather', 'aquatic', 'green', 'citrus',
];

// Controlled vocab for accords — single source of truth across the app.
const ACCORD_VOCAB = [
  'floral', 'rose', 'jasmine', 'iris', 'orange-blossom', 'tuberose', 'lily',
  'fruity', 'citrus', 'green', 'aquatic', 'aromatic',
  'amber', 'oriental', 'spicy', 'warm-spicy', 'fresh-spicy',
  'woody', 'sandalwood', 'cedar', 'oud', 'vetiver', 'patchouli',
  'sweet', 'vanilla', 'gourmand', 'caramel', 'honey', 'almond', 'coconut',
  'powdery', 'musky', 'animalic', 'leather', 'tobacco', 'smoky',
  'fresh', 'cool', 'mineral', 'salty', 'ozonic',
  'soft-spicy', 'lavender', 'herbal', 'tea', 'earthy', 'mossy',
];

interface LLMOutput {
  key: string;
  fragrance_family: string | null;
  top_accords: string[];
  accord_intensity: Record<string, number>;
  compliment_score: number;
  versatility_score: number;
  office_safe_score: number;
}

function buildPrompt(batch: CandidateFragrance[]): { system: string; user: string } {
  const system = `You are a perfume expert. For each fragrance in the input, return:

1. fragrance_family — exactly one value from this list:
   ${FAMILY_VOCAB.join(', ')}

2. top_accords — array of 3-6 lowercase tags drawn ONLY from this vocabulary:
   ${ACCORD_VOCAB.join(', ')}
   If "given_accords" is non-empty in the input, normalize/dedupe those into the vocab and reuse them.
   If empty, infer from the notes pyramid + brand positioning.

3. accord_intensity — object mapping each top_accord to an integer 1-5
   (1 = whisper, 5 = dominant signature). Must include every accord in top_accords.

4. compliment_score — float in [0..1]. Probability this fragrance draws compliments
   in social settings. Anchors: 0.95 = Baccarat Rouge 540, MFK Grand Soir, Tom Ford Tobacco Vanille.
   0.5 = pleasant but unremarkable. 0.2 = niche/challenging.

5. versatility_score — float in [0..1]. Breadth of occasions/seasons.
   Anchors: 0.95 = Chanel Coco Mademoiselle (works almost anywhere).
   0.3 = Tom Ford Tuscan Leather (powerful but situational).

6. office_safe_score — float in [0..1]. Appropriateness for daytime/professional settings.
   Anchors: 0.95 = Jo Malone Lime Basil & Mandarin (ultra-safe).
   0.1 = Tom Ford Lost Cherry (loud, sweet, distracting).

Rules:
- Return STRICT JSON. No markdown. No prose. No trailing comma.
- Output array MUST have the same length as input, in the same order.
- Each output object MUST have ONLY: key, fragrance_family, top_accords, accord_intensity,
  compliment_score, versatility_score, office_safe_score.
- "key" must echo the input's "key" exactly so we can match results back.
- Score fields must be floats with 2 decimals.`;

  const input = batch.map((r) => ({
    key: candidateKey(r),
    brand: r.brand,
    name: r.name,
    concentration: r.concentration,
    given_family: r.fragrance_family,
    given_accords: r.top_accords,
    top_notes: r.top_notes,
    heart_notes: r.heart_notes,
    base_notes: r.base_notes,
  }));

  const user = `Analyze these ${batch.length} fragrances and return the JSON array:\n\n${JSON.stringify(input, null, 2)}`;
  return { system, user };
}

async function callClaude(system: string, user: string): Promise<LLMOutput[]> {
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
    throw new Error(`anthropic ${res.status}: ${body.slice(0, 300)}`);
  }
  const payload = await res.json();
  const text = payload?.content?.[0]?.text ?? '';
  // Defensive: Claude sometimes wraps in ```json``` despite the prompt.
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

function clamp01(n: any): number | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(1, Number(v.toFixed(2))));
}

function clampInt15(n: any): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 3;
  return Math.max(1, Math.min(5, Math.round(v)));
}

async function enrichBatch(batch: CandidateFragrance[]): Promise<CandidateFragrance[]> {
  const { system, user } = buildPrompt(batch);
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const parsed = await callClaude(system, user);
      if (!Array.isArray(parsed) || parsed.length !== batch.length) {
        throw new Error(`bad response length ${parsed?.length}`);
      }
      const byKey = new Map<string, LLMOutput>(parsed.map((p) => [p.key, p]));
      return batch.map((row) => {
        const p = byKey.get(candidateKey(row));
        if (!p) return row;
        const top_accords = Array.isArray(p.top_accords)
          ? p.top_accords
              .filter((a) => ACCORD_VOCAB.includes(a))
              .slice(0, 6)
          : row.top_accords;
        const accord_intensity: Record<string, number> = {};
        for (const a of top_accords) {
          accord_intensity[a] = clampInt15(p.accord_intensity?.[a]);
        }
        return {
          ...row,
          fragrance_family: FAMILY_VOCAB.includes(p.fragrance_family ?? '')
            ? (p.fragrance_family as string)
            : row.fragrance_family,
          top_accords,
          accord_intensity,
          compliment_score: clamp01(p.compliment_score) ?? row.compliment_score,
          versatility_score: clamp01(p.versatility_score) ?? row.versatility_score,
          office_safe_score: clamp01(p.office_safe_score) ?? row.office_safe_score,
        };
      });
    } catch (e) {
      lastErr = e;
      console.warn(`  attempt ${attempt}/${MAX_RETRIES} failed:`, (e as Error).message);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  console.error('  giving up on batch:', lastErr);
  return batch;
}

async function main() {
  const args = process.argv.slice(2);
  const resume = args.includes('--resume');

  if (!fs.existsSync(IN_PATH)) {
    console.error(`No input file at ${IN_PATH}. Run merge-scraped-sources.ts first.`);
    process.exit(1);
  }
  const input: CandidateFragrance[] = JSON.parse(fs.readFileSync(IN_PATH, 'utf-8'));
  const existing: CandidateFragrance[] = resume && fs.existsSync(OUT_PATH)
    ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf-8'))
    : [];
  const done = new Set(existing.map((r) => candidateKey(r)));
  const toDo = input.filter((r) => !done.has(candidateKey(r)));

  console.log(`input=${input.length} already_enriched=${existing.length} to_enrich=${toDo.length}`);
  const enriched: CandidateFragrance[] = [...existing];

  for (let i = 0; i < toDo.length; i += BATCH_SIZE) {
    const batch = toDo.slice(i, i + BATCH_SIZE);
    process.stdout.write(`[${i + batch.length}/${toDo.length}] enriching... `);
    const out = await enrichBatch(batch);
    enriched.push(...out);
    process.stdout.write(`ok\n`);
    fs.writeFileSync(OUT_PATH, JSON.stringify(enriched, null, 2));   // crash-safe flush every batch
  }

  console.log(`wrote ${enriched.length} enriched rows to ${OUT_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
