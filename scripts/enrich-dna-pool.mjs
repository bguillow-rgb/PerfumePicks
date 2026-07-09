/**
 * DNA V3 — M0 catalog backfill for the dna_eligible picker pool.
 *
 * Backfills, for every fragrance where dna_eligible=true AND is_active=true:
 *   1. top_accords — ONLY where empty, derived from the row's own accord_intensity
 *      keys sorted by intensity (grounded in existing catalog data, no LLM).
 *   2. release_year, community_projection, community_sillage, community_longevity —
 *      LLM-assisted (well-known designer/niche bottles; the model reasons from
 *      documented knowledge). community_* are 1-5 floats in 0.5 steps, matching
 *      the scale of the existing non-null rows (observed range 2.0-5.0).
 *
 * Guardrails (same spirit as enrich-notes-llm.mjs):
 *   1. Low-confidence rows are SKIPPED entirely (nothing written) and listed
 *      in the report. Per-field nulls from the LLM are also left untouched.
 *   2. Idempotent: only fills NULLs (or empty top_accords) — never overwrites
 *      an existing value. Re-runs are no-ops for filled rows.
 *   3. Values validated before write: year in [1900, current year+1] (int),
 *      community_* clamped to [1, 5] and rounded to the nearest 0.5.
 *   4. Additive UPDATEs to these 5 columns only. No other prod writes.
 *
 * Run (dry run, no writes — prints the full plan + coverage report):
 *   node scripts/enrich-dna-pool.mjs --dry-run
 * Run (real writes):
 *   node scripts/enrich-dna-pool.mjs
 */

import { readFileSync } from 'fs';

// ── load env from the repo root's .env.local (relative to this script) ──
const envPath = new URL('../.env.local', import.meta.url);
const env = readFileSync(envPath, 'utf8').split('\n');
for (const l of env) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
const SB = process.env.EXPO_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, AK = process.env.ANTHROPIC_API_KEY;
if (!SB || !KEY || !AK) { console.error('Missing SUPABASE_URL / SERVICE_ROLE_KEY / ANTHROPIC_API_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const MODEL = 'claude-opus-4-8';
const BATCH_SIZE = 8;
const MAX_RETRIES = 3;
const DRY_RUN = process.argv.includes('--dry-run') || !!process.env.DRY_RUN;
const THIS_YEAR = new Date().getFullYear();

const FILL_COLS = ['release_year', 'community_projection', 'community_sillage', 'community_longevity'];

const SYSTEM = `You are a fragrance database curator with deep knowledge of the designer and niche fragrance market (Fragrantica/Basenotes/brand-archive level).

For each fragrance below, return its original release year and community-consensus performance ratings. These are all well-known, widely reviewed commercial fragrances.

Return a STRICT JSON array, no markdown, same length and order as the input. Each object:
{ "idx": <number, echo input>, "release_year": <int or null>, "projection": <number or null>, "sillage": <number or null>, "longevity": <number or null>, "confidence": "high"|"medium"|"low" }

Rules:
- release_year is the ORIGINAL launch year of this exact fragrance (the specific flanker/concentration named, not the parent pillar). If a flanker's name and concentration identify a specific release, use that release's year.
- projection / sillage / longevity are on a 1-5 scale reflecting community consensus (Fragrantica-style aggregate opinion): 1 = very weak/short, 3 = moderate, 5 = beast-mode/very long-lasting. Use 0.5 steps where the consensus sits between whole numbers.
- Anchor examples for calibration: Creed Aventus ≈ 3/3/3, Baccarat Rouge 540 ≈ 4/4/5, 1 Million Elixir Intense ≈ 5/5/4, D&G Light Blue ≈ 3/3/3.
- If you do not confidently know a specific field, return null for that field rather than guessing.
- confidence reflects the row as a whole: "high" = you know this exact fragrance well; "medium" = solid inference from the line/concentration; "low" = you are not sure which fragrance this is or would be guessing. Low-confidence rows will be discarded, so be honest.`;

async function fetchPool() {
  const sel = 'id,name,release_year,community_projection,community_sillage,community_longevity,top_accords,accord_intensity,fragrance_family,concentration,gender,brands(name)';
  const url = `${SB}/rest/v1/fragrances?select=${sel}&dna_eligible=eq.true&is_active=eq.true&order=id.asc&limit=1000`;
  const r = await fetch(url, { headers: H });
  const rows = await r.json();
  if (!Array.isArray(rows)) { console.error('pool fetch failed:', JSON.stringify(rows).slice(0, 300)); process.exit(1); }
  return rows;
}

function coverage(rows) {
  const total = rows.length;
  const out = {};
  for (const c of FILL_COLS) out[c] = rows.filter((r) => r[c] != null).length;
  out.top_accords = rows.filter((r) => Array.isArray(r.top_accords) && r.top_accords.length > 0).length;
  out.fragrance_family = rows.filter((r) => r.fragrance_family != null).length;
  out._total = total;
  return out;
}

function printCoverage(label, cov) {
  console.log(`\n${label} (pool = ${cov._total}):`);
  for (const [k, v] of Object.entries(cov)) {
    if (k === '_total') continue;
    console.log(`  ${k.padEnd(22)} ${String(v).padStart(3)}/${cov._total}  (${((v / cov._total) * 100).toFixed(1)}%)`);
  }
}

function roundHalf(x) { return Math.round(x * 2) / 2; }
function cleanCommunity(v) {
  if (v == null || typeof v !== 'number' || !Number.isFinite(v)) return null;
  return roundHalf(Math.min(5, Math.max(1, v)));
}
function cleanYear(v) {
  if (v == null || !Number.isInteger(v) || v < 1900 || v > THIS_YEAR + 1) return null;
  return v;
}

async function inferBatch(rows) {
  const input = rows.map((x, i) => ({
    idx: i,
    brand: x.brands?.name ?? '',
    name: x.name,
    concentration: x.concentration ?? null,
    gender: x.gender ?? null,
    family: x.fragrance_family ?? null,
    known_accords: (x.top_accords?.length ? x.top_accords : Object.keys(x.accord_intensity ?? {})),
  }));

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4000,
          system: SYSTEM,
          messages: [{ role: 'user', content: `Provide release year + performance ratings for these ${rows.length} fragrances:\n\n${JSON.stringify(input, null, 2)}` }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const payload = await res.json();
      if (payload?.stop_reason === 'refusal') throw new Error('refusal stop_reason');
      const text = (payload?.content?.find((b) => b.type === 'text')?.text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
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

async function patchRow(id, body) {
  const up = await fetch(`${SB}/rest/v1/fragrances?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...H, 'content-type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!up.ok) { console.warn(`  write fail ${id}: ${up.status} ${(await up.text()).slice(0, 120)}`); return false; }
  return true;
}

async function main() {
  console.log(`${DRY_RUN ? '=== DRY RUN — no database writes ===' : '=== LIVE RUN ==='}\nmodel: ${MODEL}`);
  const rows = await fetchPool();
  const before = coverage(rows);
  printCoverage('BEFORE coverage', before);

  // ── Part A: top_accords gaps, derived from accord_intensity (no LLM) ──
  const accordGaps = rows.filter((r) => (!r.top_accords || r.top_accords.length === 0) && r.accord_intensity && Object.keys(r.accord_intensity).length > 0);
  console.log(`\nPart A — top_accords backfill from accord_intensity: ${accordGaps.length} bottle(s)`);
  for (const r of accordGaps) {
    const derived = Object.entries(r.accord_intensity)
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .map(([k]) => k)
      .slice(0, 6);
    console.log(`  ${(r.brands?.name ?? '?')} ${r.name}: [${derived.join(', ')}]`);
    if (!DRY_RUN) {
      if (await patchRow(r.id, { top_accords: derived })) r.top_accords = derived;
    }
  }
  const familyGaps = rows.filter((r) => r.fragrance_family == null);
  console.log(`Part A — fragrance_family audit: ${familyGaps.length} gap(s)${familyGaps.length ? ' — ' + familyGaps.map((r) => r.name).join(', ') : ' (complete, nothing to do)'}`);

  // ── Part B: LLM backfill of release_year + community_* ──
  const targets = rows.filter((r) => FILL_COLS.some((c) => r[c] == null));
  console.log(`\nPart B — LLM backfill targets (missing ≥1 of ${FILL_COLS.join('/')}): ${targets.length} bottle(s)\n`);

  const conf = { high: 0, medium: 0, low: 0, none: 0 };
  const skipped = [];
  let updated = 0, fieldWrites = 0, heldFields = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const parsed = await inferBatch(batch);
    if (!parsed) { batch.forEach((r) => skipped.push({ name: `${r.brands?.name ?? '?'} ${r.name}`, reason: 'batch failed' })); continue; }
    const byIdx = new Map(parsed.map((p) => [p.idx, p]));

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const label = `${row.brands?.name ?? '?'} ${row.name}`;
      const p = byIdx.get(j) || {};
      const c = p.confidence ?? 'none';
      conf[c] = (conf[c] ?? 0) + 1;

      // Guardrail 1: skip low/none confidence rows entirely
      if (c !== 'high' && c !== 'medium') { skipped.push({ name: label, reason: `confidence=${c}` }); continue; }

      // Build the patch: only fields that are NULL in the DB and non-null + valid from the LLM
      const candidate = {
        release_year: cleanYear(p.release_year),
        community_projection: cleanCommunity(p.projection),
        community_sillage: cleanCommunity(p.sillage),
        community_longevity: cleanCommunity(p.longevity),
      };
      const body = {};
      for (const col of FILL_COLS) {
        if (row[col] != null) continue;            // Guardrail 2: never overwrite
        if (candidate[col] == null) { heldFields++; continue; } // LLM abstained / invalid
        body[col] = candidate[col];
        fieldWrites++;
      }
      if (Object.keys(body).length === 0) { skipped.push({ name: label, reason: 'no usable fields returned' }); continue; }

      console.log(`  [${c}] ${label}: ${JSON.stringify(body)}`);
      if (DRY_RUN) { updated++; continue; }
      if (await patchRow(row.id, body)) { updated++; Object.assign(row, body); }
    }
    console.log(`  -- progress ${Math.min(i + BATCH_SIZE, targets.length)}/${targets.length} --`);
  }

  // ── Report ──
  const after = DRY_RUN ? null : coverage(await fetchPool());
  console.log(`\nconfidence spread: ${JSON.stringify(conf)}`);
  console.log(`${DRY_RUN ? 'WOULD UPDATE' : 'UPDATED'}: ${updated} bottle(s), ${fieldWrites} field(s); fields held (LLM abstained/invalid): ${heldFields}`);
  if (skipped.length) {
    console.log(`\nSKIPPED bottles (${skipped.length}):`);
    for (const s of skipped) console.log(`  - ${s.name}  [${s.reason}]`);
  } else {
    console.log('\nSKIPPED bottles: none');
  }
  printCoverage(DRY_RUN ? 'BEFORE coverage (unchanged — dry run)' : 'AFTER coverage', after ?? before);
  if (DRY_RUN) console.log('\n*** DRY RUN — no database writes performed. ***');
}

main().catch((e) => { console.error(e); process.exit(1); });
