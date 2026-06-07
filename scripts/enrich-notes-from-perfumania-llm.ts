/**
 * enrich-notes-from-perfumania-llm — fill EMPTY note pyramids from the product
 * copy of the Perfumania SKU we already affiliate-link to.
 *
 * Why this is zero-ToS-risk: Perfumania is our CJ affiliate. Their public
 * Shopify body_html is product copy we are licensed to surface as a publisher.
 * We are NOT scraping a third-party fragrance database — we read the description
 * of a product whose buy-link we already host, and use an LLM (Haiku) to pull
 * the note pyramid out of that prose.
 *
 * Honesty / provenance (mirrors backfill-notes-provenance.ts):
 *   - These notes are LLM-EXTRACTED from retail copy, not a verified pyramid
 *     scrape. So we stamp notes_source='llm-inferred' (the schema's vocabulary
 *     for exactly this) and notes_verified=FALSE. They never earn the
 *     "Notes verified ✓" badge — that stays reserved for positively-attributed
 *     Fragrantica/brand scrapes.
 *
 * Safety:
 *   - DRY RUN by default. --commit to write.
 *   - Only ever touches frags whose pyramid is currently EMPTY (idempotent;
 *     re-running skips anything now populated). Reversible: writes only the note
 *     columns + the two provenance columns on rows that had no notes before.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/enrich-notes-from-perfumania-llm.ts
 *   set -a && source .env.local && set +a && npx tsx scripts/enrich-notes-from-perfumania-llm.ts --commit
 *   ... optional: --limit 50   (cap for a cheap trial run)
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing Supabase env.'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY.'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const COMMIT = process.argv.includes('--commit');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity; })();
const MODEL = 'claude-haiku-4-5-20251001';
const CONCURRENCY = 6;

const BASE = 'https://perfumania.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

const stripHtml = (s: string) => (s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

// Extract the perfumania product handle from a CJ-wrapped retailer-link URL.
function handleFromUrl(url: string): string | null {
  const m = url.match(/[?&]url=([^&]+)/);
  const dest = m ? decodeURIComponent(m[1]) : url;
  const h = dest.match(/\/products\/([^/?#]+)/);
  return h ? h[1] : null;
}

// Cheap pre-filter: does the prose plausibly NAME notes/ingredients? Skips pure
// marketing fluff so we don't spend LLM calls that will return nothing.
const PLAUSIBLE = /\b(notes?|accord|bergamot|jasmine|vanilla|musk|amber|oud|rose|sandalwood|patchouli|cedar|saffron|tonka|vetiver|lavender|citrus|woody|floral|spic|leather|tobacco)\b/i;

async function fetchAllPerfumania(): Promise<Map<string, string>> {
  const byHandle = new Map<string, string>();
  for (let page = 1; ; page++) {
    let products: any[] = [];
    for (let a = 1; a <= 4; a++) {
      try {
        const res = await fetch(`${BASE}/products.json?limit=250&page=${page}`, { headers: { 'User-Agent': UA } });
        if (res.status === 429 || res.status === 503) { await new Promise((r) => setTimeout(r, a * 3000)); continue; }
        if (!res.ok) { products = []; break; }
        products = ((await res.json()) as { products: any[] }).products ?? [];
        break;
      } catch { await new Promise((r) => setTimeout(r, a * 2000)); }
    }
    if (!products.length) break;
    for (const p of products) byHandle.set(String(p.handle), stripHtml(p.body_html));
    await new Promise((r) => setTimeout(r, 400));
  }
  return byHandle;
}

async function fetchAll<T>(table: string, cols: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let o = 0; ; o += 1000) {
    let q = sb.from(table).select(cols).range(o, o + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) { console.error(table, error.message); process.exit(1); }
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

type Pyramid = { top: string[]; heart: string[]; base: string[] };

const titleCase = (s: string) => s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function cleanList(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (typeof x === 'string' ? x : ''))
    .map((x) => x.replace(/\b(notes?|accord)\b/gi, '').replace(/[^a-zA-Z' -]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((x) => x.length > 1 && x.length < 40)
    .map(titleCase)
    .filter((x, i, a) => a.indexOf(x) === i)
    .slice(0, 12);
}

async function extract(name: string, brand: string, desc: string): Promise<Pyramid | null> {
  const prompt = `You extract fragrance note pyramids from retail product copy. Output ONLY JSON.

Product: ${brand} — ${name}
Copy: """${desc.slice(0, 1200)}"""

Return {"top":[],"heart":[],"base":[]} listing only ACTUAL fragrance notes/ingredients you can identify from the copy (e.g. "Bergamot", "Jasmine", "Sandalwood"). Rules:
- Use real note/ingredient names only. NEVER invent notes that aren't in the copy.
- Do NOT include adjectives ("fresh", "warm"), marketing words, or generic phrases ("clean notes", "aromatic notes").
- If the copy only describes a vibe without naming real notes, return all three arrays empty.
- If notes are listed but not split by tier, put your best guess of opening/mid/dry-down; otherwise put them in "heart".
Output JSON only, no prose.`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });
      const txt = res.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) return null;
      const parsed = JSON.parse(m[0]);
      const pyr = { top: cleanList(parsed.top), heart: cleanList(parsed.heart), base: cleanList(parsed.base) };
      if (pyr.top.length + pyr.heart.length + pyr.base.length === 0) return null;
      return pyr;
    } catch (e: any) {
      if (attempt === 3) { console.error(`  extract failed for ${name}: ${e.message}`); return null; }
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  return null;
}

async function main() {
  console.log(`enrich-notes-from-perfumania-llm  (${COMMIT ? 'COMMIT' : 'DRY RUN'})  model=${MODEL}\n`);

  console.log('Fetching Perfumania body_html by handle...');
  const descByHandle = await fetchAllPerfumania();
  console.log(`  perfumania products: ${descByHandle.size}`);

  type Frag = { id: string; name: string; brand_id: string; top_notes: string[] | null; heart_notes: string[] | null; base_notes: string[] | null };
  const frags = await fetchAll<Frag>('fragrances', 'id,name,brand_id,top_notes,heart_notes,base_notes', (q) => q.eq('is_active', true));
  const brands = await fetchAll<{ id: string; name: string }>('brands', 'id,name');
  const brandById = new Map(brands.map((b) => [b.id, b.name]));
  const empty = frags.filter((f) => ((f.top_notes?.length ?? 0) + (f.heart_notes?.length ?? 0) + (f.base_notes?.length ?? 0)) === 0);

  type Link = { fragrance_id: string; url: string | null };
  const links = await fetchAll<Link>('fragrance_retailer_links', 'fragrance_id,url', (q) => q.eq('retailer', 'perfumania'));
  const handleByFrag = new Map<string, string>();
  for (const l of links) { const h = l.url ? handleFromUrl(l.url) : null; if (h) handleByFrag.set(l.fragrance_id, h); }

  // Build the work list: empty frag → plausible perfumania prose.
  const work: { f: Frag; desc: string }[] = [];
  for (const f of empty) {
    const h = handleByFrag.get(f.id);
    if (!h) continue;
    const desc = descByHandle.get(h);
    if (!desc || desc.length < 40 || !PLAUSIBLE.test(desc)) continue;
    work.push({ f, desc });
  }
  const todo = work.slice(0, LIMIT === Infinity ? work.length : LIMIT);
  console.log(`\nnote-empty active frags: ${empty.length}`);
  console.log(`candidates w/ plausible perfumania prose: ${work.length}   processing: ${todo.length}\n`);

  let extracted = 0, none = 0, written = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async ({ f, desc }) => {
      const pyr = await extract(f.name, brandById.get(f.brand_id) ?? '', desc);
      return { f, pyr };
    }));
    for (const { f, pyr } of results) {
      if (!pyr) { none++; continue; }
      extracted++;
      if (extracted <= 15) console.log(`  ✓ ${f.name}  T:[${pyr.top.join(', ')}] H:[${pyr.heart.join(', ')}] B:[${pyr.base.join(', ')}]`);
      if (COMMIT) {
        const { error } = await sb.from('fragrances').update({
          top_notes: pyr.top, heart_notes: pyr.heart, base_notes: pyr.base,
          notes_source: 'llm-inferred', notes_verified: false,
        }).eq('id', f.id);
        if (error) { console.error(`  update ${f.id}: ${error.message}`); } else written++;
      }
    }
    if ((i + CONCURRENCY) % 60 === 0 || i + CONCURRENCY >= todo.length) {
      console.log(`  ...processed ${Math.min(i + CONCURRENCY, todo.length)}/${todo.length}  (extracted ${extracted}, none ${none})`);
    }
  }

  console.log(`\n=== RESULT ===`);
  console.log(`processed: ${todo.length}   extracted a pyramid: ${extracted}   no usable notes: ${none}`);
  if (COMMIT) console.log(`written to DB: ${written}  (notes_source='llm-inferred', notes_verified=false)`);
  else console.log(`DRY RUN — nothing written. Re-run with --commit (optionally --limit N first).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
