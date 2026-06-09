/**
 * scripts/enrich-catalog.ts
 *
 * Two-pass enrichment for fragrances that have no notes data (newly ingested
 * affiliate products), plus a gender backfill pass.
 *
 * Usage:
 *   npx ts-node scripts/enrich-catalog.ts [options]
 *
 * Options:
 *   --dry-run          Show counts, don't write to DB
 *   --limit N          Only process N fragrances in Pass 2 (default: unlimited)
 *   --pass 1|2|3       Run only a specific pass
 *   --brand "Burberry" Filter to a specific brand
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// ─── Load env ─────────────────────────────────────────────────────────────────

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

const DRY_RUN   = args.includes('--dry-run');
const LIMIT     = getFlag('--limit') ? parseInt(getFlag('--limit')!, 10) : Infinity;
const PASS_ONLY = getFlag('--pass')  ? parseInt(getFlag('--pass')!, 10)  : null;
const BRAND     = getFlag('--brand') ?? null;

// ─── String normalization (copied inline from affiliate-etl-base.ts) ──────────

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fragranceSlug(brand: string, name: string): string {
  const b = normalizeStr(brand).replace(/\s+/g, '-');
  const n = normalizeStr(name).replace(/\s+/g, '-');
  return `${b}-${n}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnrichedCandidate {
  brand:                string;
  name:                 string;
  release_year?:        number | null;
  fragrance_family?:    string | null;
  gender?:              string | null;
  top_notes?:           string[];
  heart_notes?:         string[];
  base_notes?:          string[];
  top_accords?:         string[];
  accord_intensity?:    Record<string, number>;
  community_longevity?: number | null;
  community_sillage?:   number | null;
  community_projection?:number | null;
  compliment_score?:    number | null;
  versatility_score?:   number | null;
  office_safe_score?:   number | null;
}

interface FragranceRow {
  id:     string;
  slug:   string;
  name:   string;
  brand:  string; // from brands join
  gender: string | null;
}

interface EnrichPayload {
  top_notes?:            string[];
  heart_notes?:          string[];
  base_notes?:           string[];
  top_accords?:          string[];
  accord_intensity?:     Record<string, number>;
  fragrance_family?:     string;
  gender?:               string;
  community_longevity?:  number;
  community_sillage?:    number;
  community_projection?: number;
  compliment_score?:     number;
  versatility_score?:    number;
  office_safe_score?:    number;
  release_year?:         number;
  description?:          string;
}

// ─── Check for description column ─────────────────────────────────────────────

// FRAGRANCE_SELECT in useCatalogStore.ts does NOT include `description`,
// so the column may not exist. We'll probe at runtime and skip writing it if absent.
let HAS_DESCRIPTION_COLUMN: boolean | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

async function checkDescriptionColumn(supabase: AnySupabase): Promise<boolean> {
  if (HAS_DESCRIPTION_COLUMN !== null) return HAS_DESCRIPTION_COLUMN;

  // Attempt a select of `description` on one row
  const { error } = await supabase
    .from('fragrances')
    .select('description')
    .limit(1);

  HAS_DESCRIPTION_COLUMN = !error;
  if (!HAS_DESCRIPTION_COLUMN) {
    console.log('  Note: `description` column not found in fragrances table — will skip writing it.');
  }
  return HAS_DESCRIPTION_COLUMN;
}

// ─── Pass 1 — Local match ─────────────────────────────────────────────────────

async function runPass1(
  supabase: AnySupabase,
  unenrichedRows: FragranceRow[],
): Promise<{ matched: FragranceRow[]; unmatched: FragranceRow[]; count: number }> {
  // Load enriched-candidates.json
  const candidatesPath = path.resolve(__dirname, 'data/enriched-candidates.json');
  const rawCandidates: EnrichedCandidate[] = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));

  // Build slug → candidate map
  const candidateMap = new Map<string, EnrichedCandidate>();
  for (const c of rawCandidates) {
    if (c.brand && c.name) {
      candidateMap.set(fragranceSlug(c.brand, c.name), c);
    }
  }

  let localMatched = 0;
  const matched: FragranceRow[]   = [];
  const unmatched: FragranceRow[] = [];

  for (const row of unenrichedRows) {
    const slug      = fragranceSlug(row.brand, row.name);
    const candidate = candidateMap.get(slug);

    if (!candidate) {
      unmatched.push(row);
      continue;
    }

    // Require at least top_notes to have content to be worth updating
    const hasNotes =
      (candidate.top_notes && candidate.top_notes.length > 0) ||
      (candidate.top_accords && candidate.top_accords.length > 0);

    if (!hasNotes) {
      unmatched.push(row);
      continue;
    }

    matched.push(row);

    if (DRY_RUN) continue;

    const payload: EnrichPayload = {};
    if (candidate.top_notes)            payload.top_notes            = candidate.top_notes;
    if (candidate.heart_notes)          payload.heart_notes          = candidate.heart_notes;
    if (candidate.base_notes)           payload.base_notes           = candidate.base_notes;
    if (candidate.top_accords)          payload.top_accords          = candidate.top_accords;
    if (candidate.accord_intensity)     payload.accord_intensity     = candidate.accord_intensity;
    if (candidate.fragrance_family)     payload.fragrance_family     = candidate.fragrance_family;
    if (candidate.community_longevity != null) payload.community_longevity  = candidate.community_longevity;
    if (candidate.community_sillage   != null) payload.community_sillage    = candidate.community_sillage;
    if (candidate.community_projection != null) payload.community_projection = candidate.community_projection;
    if (candidate.compliment_score    != null) payload.compliment_score     = candidate.compliment_score;
    if (candidate.versatility_score   != null) payload.versatility_score    = candidate.versatility_score;
    if (candidate.office_safe_score   != null) payload.office_safe_score    = candidate.office_safe_score;
    if (candidate.release_year        != null) payload.release_year         = candidate.release_year;

    const { error } = await supabase
      .from('fragrances')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(payload as any)
      .eq('id', row.id);

    if (error) {
      console.warn(`  [Pass 1] Failed to update ${row.brand} - ${row.name}: ${error.message}`);
    } else {
      localMatched++;
    }
  }

  if (DRY_RUN) localMatched = matched.length;

  return { matched, unmatched, count: localMatched };
}

// ─── Pass 2 — Claude enrichment ───────────────────────────────────────────────

const ENRICH_TOOL: Anthropic.Tool = {
  name: 'enrich_fragrance',
  description: 'Provide accurate fragrance enrichment data based on the actual fragrance.',
  input_schema: {
    type: 'object' as const,
    properties: {
      top_notes: {
        type: 'array',
        items: { type: 'string' },
        description: '3-6 top notes, e.g. ["bergamot", "pink pepper", "blackcurrant"]',
      },
      heart_notes: {
        type: 'array',
        items: { type: 'string' },
        description: '3-5 heart notes',
      },
      base_notes: {
        type: 'array',
        items: { type: 'string' },
        description: '2-4 base notes',
      },
      top_accords: {
        type: 'array',
        items: { type: 'string' },
        description: '2-4 accords from: floral, woody, musky, fresh, citrus, sweet, spicy, aromatic, gourmand, aquatic, earthy, powdery, fruity, green, amber, leather, oud',
      },
      accord_intensity: {
        type: 'object',
        description: 'Map of accord name → intensity (1-5)',
        additionalProperties: { type: 'number' },
      },
      fragrance_family: {
        type: 'string',
        description: 'One of: floral, woody, oriental, fresh, fougere, chypre, gourmand, aquatic, aromatic',
      },
      gender: {
        type: 'string',
        description: 'masculine | feminine | unisex',
      },
      community_longevity: {
        type: 'number',
        description: '1-5, where 1=poor, 3=moderate, 5=excellent',
      },
      community_sillage: {
        type: 'number',
        description: '1-5, where 1=skin scent, 3=moderate, 5=beast mode',
      },
      community_projection: {
        type: 'number',
        description: '1-5',
      },
      compliment_score: {
        type: 'number',
        description: '0.0-1.0',
      },
      versatility_score: {
        type: 'number',
        description: '0.0-1.0',
      },
      office_safe_score: {
        type: 'number',
        description: '0.0-1.0',
      },
      description: {
        type: 'string',
        description: '2-3 sentences describing how the fragrance smells, its character, and who would wear it — written for a fragrance app user, not a perfumer',
      },
    },
    required: ['top_notes', 'heart_notes', 'base_notes', 'top_accords'],
  },
};

async function enrichSingle(
  anthropic: Anthropic,
  row: FragranceRow,
): Promise<EnrichPayload | null> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: 'You are a fragrance expert with encyclopedic knowledge of perfumes. Given a fragrance name and brand, provide accurate notes, accords, and characteristics based on the actual fragrance. Only use tool_use, never free text.',
    tools: [ENRICH_TOOL],
    tool_choice: { type: 'tool', name: 'enrich_fragrance' },
    messages: [
      {
        role: 'user',
        content: `Enrich this fragrance: ${row.brand} - ${row.name}`,
      },
    ],
  });

  // Find the tool_use block
  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') return null;

  const input = toolBlock.input as Record<string, unknown>;

  // If both notes AND accords are empty, the model doesn't know this fragrance — skip
  // (require at least one of: top_notes or top_accords to have content)
  const hasNotes   = (input.top_notes   as string[] | undefined)?.length ?? 0 > 0;
  const hasAccords = (input.top_accords as string[] | undefined)?.length ?? 0 > 0;
  if (!hasNotes && !hasAccords) return null;

  // Normalize field names Claude sometimes returns incorrectly
  if (input.top_accords_intensity && !input.accord_intensity) {
    input.accord_intensity = input.top_accords_intensity;
    delete input.top_accords_intensity;
  }
  if ((input as any).accordion_intensity && !input.accord_intensity) {
    input.accord_intensity = (input as any).accordion_intensity;
    delete (input as any).accordion_intensity;
  }
  // Normalize gender to DB constraint values: masculine | feminine | unisex
  if (input.gender === 'men' || input.gender === 'male')     input.gender = 'masculine';
  if (input.gender === 'women' || input.gender === 'female') input.gender = 'feminine';

  return input as EnrichPayload;
}

async function runPass2(
  supabase: AnySupabase,
  rows: FragranceRow[],
  hasDescriptionColumn: boolean,
): Promise<{ enriched: number; skipped: number }> {
  if (!ANTHROPIC_API_KEY) {
    console.log('  ANTHROPIC_API_KEY not set — skipping Pass 2.');
    return { enriched: 0, skipped: rows.length };
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Sort by brand then name for resumability
  const sorted = [...rows].sort((a, b) => {
    const brandCmp = a.brand.localeCompare(b.brand);
    return brandCmp !== 0 ? brandCmp : a.name.localeCompare(b.name);
  });

  // Apply --limit
  const toProcess = isFinite(LIMIT) ? sorted.slice(0, LIMIT) : sorted;

  const BATCH_SIZE = 10;
  let enriched = 0;
  let skipped  = 0;
  const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch      = toProcess.slice(i, i + BATCH_SIZE);
    const batchNum   = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`  Processing batch ${batchNum}/${totalBatches}...\r`);

    const results = await Promise.all(
      batch.map((row) =>
        enrichSingle(anthropic, row).catch((err) => {
          console.warn(`\n  [Pass 2] API error for ${row.brand} - ${row.name}: ${err.message}`);
          return null;
        }),
      ),
    );

    for (let j = 0; j < batch.length; j++) {
      const row     = batch[j];
      const payload = results[j];

      if (!payload) {
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        enriched++;
        continue;
      }

      // Strip description if column doesn't exist
      const dbPayload: EnrichPayload = { ...payload };
      if (!hasDescriptionColumn) {
        delete dbPayload.description;
      }

      const { error } = await supabase
        .from('fragrances')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(dbPayload as any)
        .eq('id', row.id);

      if (error) {
        console.warn(`\n  [Pass 2] Failed to update ${row.brand} - ${row.name}: ${error.message}`);
        skipped++;
      } else {
        enriched++;
      }
    }

    // 100ms delay between batches to avoid rate limits
    if (i + BATCH_SIZE < toProcess.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  process.stdout.write('\n');
  return { enriched, skipped };
}

// ─── Pass 3 — Gender backfill ─────────────────────────────────────────────────

const WOMEN_RE = /\bpour\s+femme\b|\bfor\s+women\b|\bfor\s+her\b|\bwomen'?s\b|\bfemme\b/i;
const MEN_RE   = /\bpour\s+homme\b|\bfor\s+men\b|\bfor\s+him\b|\bmen'?s\b|\bhomme\b/i;

async function runPass3(
  supabase: AnySupabase,
): Promise<{ updated: number }> {
  // Fetch fragrances where gender is null or 'unisex'
  let query = supabase
    .from('fragrances')
    .select('id, slug, name, gender, brands(name)')
    .or('gender.is.null,gender.eq.unisex');

  if (BRAND) {
    // We need to join through brands — filter by brand name after fetch
    // (PostgREST doesn't allow filtering on joined columns via .eq in this form easily)
  }

  const { data, error } = await query;
  if (error) {
    console.warn(`  [Pass 3] Failed to fetch rows: ${error.message}`);
    return { updated: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = (data ?? []) as unknown as Array<{ id: string; name: string; gender: string | null; brands: { name: string } | null }>;

  if (BRAND) {
    const brandNorm = normalizeStr(BRAND);
    rows = rows.filter((r) => normalizeStr(r.brands?.name ?? '') === brandNorm);
  }

  let updated = 0;

  for (const row of rows) {
    const title = row.name;
    let newGender: 'feminine' | 'masculine' | null = null;

    if (WOMEN_RE.test(title)) newGender = 'feminine';
    else if (MEN_RE.test(title)) newGender = 'masculine';

    if (!newGender) continue;
    if (row.gender === newGender) continue;

    if (DRY_RUN) {
      updated++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from('fragrances')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ gender: newGender } as any)
      .eq('id', row.id);

    if (updateErr) {
      console.warn(`  [Pass 3] Failed to update gender for ${row.name}: ${updateErr.message}`);
    } else {
      updated++;
    }
  }

  return { updated };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Check description column once
  const hasDescriptionColumn = await checkDescriptionColumn(supabase);

  // ── Fetch unenriched fragrances ──────────────────────────────────────────

  let unenrichedQuery = supabase
    .from('fragrances')
    .select('id, slug, name, gender, brands(name)')
    .eq('top_notes',   '{}')
    .limit(10000)
    .eq('top_accords', '{}');

  if (BRAND) {
    // Filter by brand name via brands join — fetch all then filter client-side
    // because PostgREST doesn't easily do .eq on joined tables with this select shape
  }

  const { data: unenrichedData, error: fetchErr } = await unenrichedQuery;
  if (fetchErr) {
    console.error('Failed to fetch unenriched fragrances:', fetchErr.message);
    process.exit(1);
  }

  let unenriched = (unenrichedData ?? []).map((row: any) => ({
    id:     row.id as string,
    slug:   row.slug as string,
    name:   row.name as string,
    brand:  (row.brands as { name: string } | null)?.name ?? '',
    gender: row.gender as string | null,
  })) as FragranceRow[];

  if (BRAND) {
    const brandNorm = normalizeStr(BRAND);
    unenriched = unenriched.filter((r) => normalizeStr(r.brand) === brandNorm);
  }

  // ── Pass 1 ───────────────────────────────────────────────────────────────

  let pass1Matched  = 0;
  let pass1Unmatched: FragranceRow[] = unenriched;

  if (!PASS_ONLY || PASS_ONLY === 1) {
    console.log(`\nPass 1 (local match): ${unenriched.length} fragrances to enrich`);

    const { matched, unmatched, count } = await runPass1(supabase, unenriched);
    pass1Matched   = count;
    pass1Unmatched = unmatched;

    console.log(`  ✓ Matched ${pass1Matched} from enriched-candidates.json`);
    console.log(`  ✗ Unmatched: ${unmatched.length}`);
  }

  // ── Pass 2 ───────────────────────────────────────────────────────────────

  let pass2Enriched = 0;
  let pass2Skipped  = 0;

  if (!PASS_ONLY || PASS_ONLY === 2) {
    const toEnrich = PASS_ONLY === 2 ? unenriched : pass1Unmatched;
    console.log(`\nPass 2 (Claude enrichment): ${toEnrich.length} fragrances`);

    const { enriched, skipped } = await runPass2(supabase, toEnrich, hasDescriptionColumn);
    pass2Enriched = enriched;
    pass2Skipped  = skipped;

    console.log(`  ✓ Enriched: ${pass2Enriched}`);
    console.log(`  ✗ Unknown (skipped): ${pass2Skipped}`);
  }

  // ── Pass 3 ───────────────────────────────────────────────────────────────

  let pass3Updated = 0;

  if (!PASS_ONLY || PASS_ONLY === 3) {
    const { updated } = await runPass3(supabase);
    pass3Updated = updated;
    console.log(`\nPass 3 (gender backfill): updated ${pass3Updated} fragrances`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  console.log(
    `\nDone. Local: ${pass1Matched} | AI: ${pass2Enriched} | Skipped: ${pass2Skipped} | Gender fixed: ${pass3Updated}` +
    (DRY_RUN ? '  (dry run — no DB writes)' : ''),
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
