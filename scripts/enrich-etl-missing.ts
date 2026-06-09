/**
 * Targeted LLM enrichment for active ETL frags that still have empty top_accords.
 *
 * Unlike enrich-catalog-llm.ts (which works from merged-candidates.json),
 * this script reads directly from Supabase and writes back directly — no JSON files.
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
 *     npx tsx scripts/enrich-etl-missing.ts
 *
 * Safe to re-run: only processes rows where top_accords is still empty.
 * ~2,891 frags → ~290 batches → ~5 min, ~$1.30.
 */

import { createClient } from '@supabase/supabase-js';
import { candidateKey, normalize } from './types';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const MODEL = 'claude-sonnet-4-5';
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const PAGE_SIZE = 500;

const FAMILY_VOCAB = [
  'floral', 'oriental', 'woody', 'fresh', 'gourmand',
  'chypre', 'fougère', 'aromatic', 'leather', 'aquatic', 'green', 'citrus',
];
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

interface DbRow {
  id: string;
  slug: string;
  name: string;
  concentration: string | null;
  fragrance_family: string | null;
  gender: string | null;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  top_accords: string[];
  brands: { name: string } | null;
}

function clamp01(n: any): number { const v = Number(n); return Number.isFinite(v) ? Math.max(0, Math.min(1, Number(v.toFixed(2)))) : 0.5; }
function clampInt15(n: any): number { const v = Number(n); return Number.isFinite(v) ? Math.max(1, Math.min(5, Math.round(v))) : 3; }

function buildPrompt(rows: DbRow[]): { system: string; user: string } {
  const system = `You are a perfume expert. For each fragrance in the input, return:

1. fragrance_family — exactly one value from: ${FAMILY_VOCAB.join(', ')}
2. top_accords — array of 3-6 lowercase tags from ONLY: ${ACCORD_VOCAB.join(', ')}
3. accord_intensity — object mapping each top_accord to integer 1-5
4. compliment_score — float [0..1]. Anchors: 0.95=Baccarat Rouge 540, 0.5=pleasant, 0.2=niche
5. versatility_score — float [0..1]. Anchors: 0.95=Chanel Coco Mademoiselle, 0.3=Tom Ford Tuscan Leather
6. office_safe_score — float [0..1]. Anchors: 0.95=Jo Malone Lime Basil & Mandarin, 0.1=Tom Ford Lost Cherry

Rules: Return STRICT JSON array, no markdown. Same length as input, same order.
Each object: { key, fragrance_family, top_accords, accord_intensity, compliment_score, versatility_score, office_safe_score }
"key" must echo input key exactly. Scores are floats with 2 decimals.`;

  const input = rows.map((r) => ({
    key: `${normalize(r.brands?.name ?? '')}|${normalize(r.name)}`,
    brand: r.brands?.name ?? '',
    name: r.name,
    concentration: r.concentration,
    given_family: r.fragrance_family,
    top_notes: r.top_notes ?? [],
    heart_notes: r.heart_notes ?? [],
    base_notes: r.base_notes ?? [],
  }));

  return { system, user: `Analyze these ${rows.length} fragrances:\n\n${JSON.stringify(input, null, 2)}` };
}

async function enrichAndUpdate(rows: DbRow[]): Promise<number> {
  const { system, user } = buildPrompt(rows);
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 4000, system, messages: [{ role: 'user', content: user }] }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const payload = await res.json();
      const text = (payload?.content?.[0]?.text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed) || parsed.length !== rows.length) throw new Error(`bad length ${parsed?.length}`);

      const byKey = new Map(parsed.map((p: any) => [p.key, p]));
      let updated = 0;
      for (const row of rows) {
        const key = `${normalize(row.brands?.name ?? '')}|${normalize(row.name)}`;
        const p = byKey.get(key) as any;
        if (!p) continue;
        const top_accords = Array.isArray(p.top_accords) ? p.top_accords.filter((a: string) => ACCORD_VOCAB.includes(a)).slice(0, 6) : [];
        if (!top_accords.length) continue;
        const accord_intensity: Record<string, number> = {};
        for (const a of top_accords) accord_intensity[a] = clampInt15(p.accord_intensity?.[a]);
        const { error } = await supabase.from('fragrances').update({
          top_accords,
          accord_intensity,
          fragrance_family: FAMILY_VOCAB.includes(p.fragrance_family ?? '') ? p.fragrance_family : (row.fragrance_family ?? null),
          compliment_score: clamp01(p.compliment_score),
          versatility_score: clamp01(p.versatility_score),
          office_safe_score: clamp01(p.office_safe_score),
        }).eq('id', row.id);
        if (!error) updated++;
      }
      return updated;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  console.warn('  batch failed after retries:', (lastErr as Error).message);
  return 0;
}

async function main() {
  let offset = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;

  // Fetch count first
  const { count } = await supabase.from('fragrances').select('*', { count: 'exact', head: true })
    .eq('is_active', true).eq('top_accords', '{}');
  console.log(`Frags to enrich: ${count}`);

  while (true) {
    const { data, error } = await supabase
      .from('fragrances')
      .select('id, slug, name, concentration, fragrance_family, gender, top_notes, heart_notes, base_notes, top_accords, brands(name)')
      .eq('is_active', true)
      .eq('top_accords', '{}')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) { console.error('fetch error:', error.message); break; }
    if (!data?.length) break;

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE) as DbRow[];
      const updated = await enrichAndUpdate(batch);
      totalUpdated += updated;
      totalProcessed += batch.length;
      process.stdout.write(`\r  [${totalProcessed}/${count}] updated ${totalUpdated}`);
    }

    // Don't advance offset — each iteration re-queries frags with empty top_accords,
    // so successfully updated rows drop out of the result set automatically.
    if (data.length < PAGE_SIZE) break;
  }

  console.log(`\nDone. Processed: ${totalProcessed} | Updated: ${totalUpdated}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
