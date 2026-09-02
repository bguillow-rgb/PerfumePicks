/**
 * LLM note-pyramid enrichment for purchasable, active, zero-note bottles.
 *
 * Infers top/heart/base notes for bottles that have none, using documented
 * (Fragrantica/Basenotes/brand-copy level) composition knowledge. Writes ONLY
 * high+medium confidence rows; low-confidence rows are held (left untouched).
 *
 * Run (dry run, no writes — prints fill rate):
 *   DRY_RUN=1 LIMIT=100 node scripts/enrich-notes-llm.mjs
 * Run (real writes):
 *   node scripts/enrich-notes-llm.mjs
 *
 * Guardrails:
 *   1. Discard low confidence — only high+medium are written.
 *   2. Provenance stamp: notes_source='llm-inferred', notes_verified=false.
 *   3. Never write an all-empty pyramid (skip if all three tiers blank).
 *   4. Idempotent — only targets zero-note rows, so re-runs skip filled bottles.
 */

import { readFileSync } from 'fs';

// ── load env from .env.local ──
const env = readFileSync(process.env.HOME + '/PerfumePicks/.env.local', 'utf8').split('\n');
for (const l of env) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
const SB = process.env.EXPO_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, AK = process.env.ANTHROPIC_API_KEY;
if (!SB || !KEY || !AK) { console.error('Missing SUPABASE_URL / SERVICE_ROLE_KEY / ANTHROPIC_API_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const MODEL = 'claude-sonnet-4-5';
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const DRY_RUN = !!process.env.DRY_RUN;
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;

const SYSTEM = `You are a master perfumer and fragrance database curator. For each fragrance, return its note pyramid based on documented, publicly-known composition (Fragrantica/Basenotes/brand copy level of knowledge).

Return STRICT JSON array, no markdown, same length and order as input. Each object:
{ "idx": <number, echo input>, "top_notes": [..], "heart_notes": [..], "base_notes": [..], "confidence": "high"|"medium"|"low" }

Rules:
- Notes are Title Case single ingredients (e.g. "Bergamot", "Bulgarian Rose", "White Musk"). No prose.
- 2-5 notes per tier. Use real perfumery ingredients, never invent marketing words.
- If you do NOT actually know this specific fragrance's composition, DO NOT guess wildly. Return empty arrays and confidence:"low". A blank is better than a fabricated pyramid.
- "medium" = inferred from family/accords/house style but not documented. "high" = you know the actual published notes.`;

function titleClean(a) {
  if (!Array.isArray(a)) return [];
  return a.map((s) => String(s).trim()).filter(Boolean).slice(0, 5);
}

async function inferBatch(rows) {
  const input = rows.map((x, i) => ({
    idx: i,
    brand: x.brands?.name ?? '',
    name: x.name,
    year: x.release_year ?? null,
    concentration: x.concentration ?? null,
    family: x.fragrance_family ?? null,
    gender: x.gender ?? null,
    known_accords: x.top_accords ?? [],
  }));

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: SYSTEM, messages: [{ role: 'user', content: `Infer note pyramids for these ${rows.length} fragrances:\n\n${JSON.stringify(input, null, 2)}` }] }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const payload = await res.json();
      const text = (payload?.content?.[0]?.text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed) || parsed.length !== rows.length) throw new Error(`bad length ${parsed?.length}`);
      return parsed;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  console.warn('  batch failed after retries:', lastErr?.message);
  return null;
}

async function main() {
  const sel = 'id,name,release_year,concentration,fragrance_family,gender,top_accords,brand_id,brands(name)';
  const cap = LIMIT ?? 5000;
  const url = `${SB}/rest/v1/fragrances?select=${sel}&is_active=eq.true&purchasable=eq.true&top_notes=eq.{}&heart_notes=eq.{}&base_notes=eq.{}&order=id.asc&limit=${cap}`;
  const r = await fetch(url, { headers: H });
  const rows = await r.json();
  if (!Array.isArray(rows)) { console.error('fetch failed:', JSON.stringify(rows)); process.exit(1); }
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Fetched ${rows.length} purchasable zero-note bottles.\n`);

  const conf = { high: 0, medium: 0, low: 0, none: 0 };
  let written = 0, skippedEmpty = 0, held = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const parsed = await inferBatch(batch);
    if (!parsed) continue;
    const byIdx = new Map(parsed.map((p) => [p.idx, p]));

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const p = byIdx.get(j) || {};
      const c = p.confidence ?? 'none';
      conf[c] = (conf[c] ?? 0) + 1;

      // Guardrail 1: hold low (and anything not high/medium)
      if (c !== 'high' && c !== 'medium') { held++; continue; }

      const top = titleClean(p.top_notes), heart = titleClean(p.heart_notes), base = titleClean(p.base_notes);
      // Guardrail 3: never write an all-empty pyramid
      if (!top.length && !heart.length && !base.length) { skippedEmpty++; continue; }

      if (DRY_RUN) { written++; continue; }

      // Guardrail 2: provenance stamp
      const body = { top_notes: top, heart_notes: heart, base_notes: base, notes_source: 'llm-inferred', notes_verified: false };
      const up = await fetch(`${SB}/rest/v1/fragrances?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { ...H, 'content-type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(body),
      });
      if (up.ok) written++; else console.warn(`  write fail ${row.id}: ${up.status} ${(await up.text()).slice(0, 120)}`);
    }
    process.stdout.write(`\r  [${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}] ${DRY_RUN ? 'would-write' : 'written'} ${written} · held(low) ${held}`);
  }

  console.log(`\n\nconfidence spread: ${JSON.stringify(conf)}`);
  console.log(`${DRY_RUN ? 'WOULD WRITE' : 'WROTE'}: ${written} (high+medium, non-empty)`);
  console.log(`HELD (low/none): ${held}`);
  console.log(`SKIPPED (all-empty despite high/med): ${skippedEmpty}`);
  const fillPct = rows.length ? ((written / rows.length) * 100).toFixed(1) : '0';
  console.log(`fill rate: ${fillPct}%`);
  if (DRY_RUN) console.log('\n*** DRY RUN — no database writes performed. ***');
}

main().catch((e) => { console.error(e); process.exit(1); });
