/**
 * Import non-affiliate "originals" from enriched-candidates.json as
 * catalog-depth rows: visible + searchable + usable as a dupe original, but
 * NO buy button (purchasable=false) until an affiliate link is backfilled.
 *
 * Hard guarantees:
 *   • INSERT-ONLY. onConflict(slug) ignoreDuplicates=true → never overwrites an
 *     existing row's notes/scores/image/affiliate data. Safe to re-run.
 *   • Dedup by brand + concentration-stripped name against ALL existing rows
 *     (active + inactive) so we don't create a second copy of a bottle we carry
 *     in a different concentration/slug form.
 *   • Junk filter rejects scrape errors ("429 Too Many Requests"), brand-as-name,
 *     numeric-only and empty names before they can become a visible fragrance.
 *   • purchasable=false, is_active=true, notes_verified=false on every insert.
 *
 * Usage:
 *   npx tsx scripts/import-originals-no-affiliate.ts            # DRY RUN (no writes)
 *   npx tsx scripts/import-originals-no-affiliate.ts --commit   # writes
 *   ...optional: --cap=50   cap rows per brand (protects against indie SKU floods)
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { CandidateFragrance, normalize } from './types';
import { isDupe, isJunkListing } from './lib/affiliate-etl-base';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const DATA_DIR = path.join(__dirname, 'data');
const IN_PATH = path.join(DATA_DIR, 'enriched-candidates.json');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const COMMIT = process.argv.includes('--commit');
const capArg = process.argv.find((a) => a.startsWith('--cap='));
const CAP = capArg ? parseInt(capArg.split('=')[1], 10) : Infinity;

const BRAND_ALIASES: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'brand-aliases.json'), 'utf-8'));
function canonicalBrand(raw: string): string {
  return BRAND_ALIASES[raw] ?? BRAND_ALIASES[raw.trim()] ?? raw.trim();
}
function brandSlug(name: string): string { return normalize(name).replace(/\s+/g, '-'); }
function fragranceSlug(brand: string, name: string): string {
  return `${normalize(brand)}-${normalize(name)}`.replace(/\s+/g, '-');
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

// ── Junk filter ───────────────────────────────────────────────────────────────
const HTTP_ERR = /\b(400|401|403|404|405|408|409|410|429|500|502|503|504)\b/;
const ERR_PHRASES = /(too many requests|not found|forbidden|bad gateway|service unavailable|internal server error|access denied|gateway timeout|rate limit|unauthorized|page not found|are you a robot|just a moment|enable javascript|cloudflare)/i;
function isJunkName(brand: string, name: string): string | null {
  const raw = (name ?? '').trim();
  if (raw.length < 2) return 'too-short';
  if (ERR_PHRASES.test(raw)) return 'scrape-error';
  if (HTTP_ERR.test(raw) && /request|error|unavailable|gateway|forbidden|found/i.test(raw)) return 'http-error';
  if (/^\d+$/.test(normalize(raw))) return 'numeric-only';
  if (/^[^a-z0-9]*$/i.test(raw)) return 'no-alnum';
  // name is identical to the brand (e.g. "Byredo — Byredo")
  if (normalize(raw) === normalize(canonicalBrand(brand))) return 'name-equals-brand';
  return null;
}

// ── Non-perfume filter ─────────────────────────────────────────────────────────
// Name-based (candidates carry no product_type). Combines the cleanup scripts'
// classifiers (isJunkListing/isDupe) with skincare + bath/body/home patterns
// common to indie houses (Sucreabeille, Demeter). DELIBERATELY allows wearable
// forms — "perfume oil", "fragrance oil", "body mist", "body spray", "hair mist".
const NON_PERFUME = [
  // skincare / makeup (mirrors deactivate-non-fragrance.ts)
  /\bserum\b/i, /\bmoisturi[sz]/i, /\bnight\s+repair\b/i, /recovery\s+complex/i,
  /\bcleanser\b/i, /\btoner\b/i, /\bexfoliat/i, /\bface\s+peel\b/i, /\bampoule\b/i,
  /\beye\s+cream\b/i, /\bface\s+cream\b/i, /\bday\s+cream\b/i, /\bnight\s+cream\b/i,
  /\bhand\s+cream\b/i, /\bspf\s*\d/i, /\bsunscreen\b/i, /\bmascara\b/i, /\blipstick\b/i,
  /\blip\s+(balm|gloss|oil|scrub)\b/i, /\bconcealer\b/i, /\beyeshadow\b/i, /\bskin\s*care\b/i,
  /\bretinol\b/i, /\bhyaluronic\b/i, /\bcollagen\b/i, /facial\s+(treatment|cleanser|mask)/i,
  // bath / body (keep "body mist"/"body spray" — those are wearable)
  /\bbody\s+(lotion|wash|scrub|butter|souffl|cream|milk|polish|glaze|frosting)/i,
  /\bsugar\s+scrub\b/i, /\bbath\s+(bomb|salt|soak|fizz|melt)\b/i, /\bshower\s+(gel|oil|steamer)\b/i,
  /\bdusting\s+powder\b/i, /\bsoap\b/i, /\bshampoo\b/i, /\bconditioner\b/i,
  /\b(beard|massage|hair)\s+oil\b/i, /\bbeard\s+balm\b/i, /\bbody\s+oil\b/i, /\blotion\s+bar\b/i,
  /\bhand\s+sani/i, /\bdeodorant\b/i, /after\s*shave/i,
  // home / non-wearable
  /\bcandle\b/i, /\bwax\s+melt\b/i, /\bdiffuser\b/i, /\breed\b/i, /\broom\s+(spray|mist)\b/i,
  /\blinen\s+(spray|mist)\b/i, /\bpillow\s+(spray|mist)\b/i, /\bcar\s+(freshener|diffuser)\b/i,
];
function isNonPerfumeName(name: string): boolean {
  if (isJunkListing(name) || isDupe(name)) return true;
  return NON_PERFUME.some((re) => re.test(name));
}

// candidate.source → allowed notes_source vocabulary, else null
function mapNotesSource(src: string | undefined | null): string | null {
  const s = (src ?? '').toLowerCase();
  if (s.includes('fragrantica')) return 'fragrantica';
  if (s.includes('parfumo')) return 'parfumo';
  if (s.includes('llm') || s.includes('gpt') || s.includes('inferred')) return 'llm-inferred';
  if (s.includes('brand') || s.includes('shopify') || s.includes('direct') || s.includes('scrape')) return 'brand';
  return null;
}

// ── Field sanitizers — guarantee no CHECK/type constraint can fail ──────────────
const ALLOWED_CONC = new Set(['parfum', 'edp', 'edt', 'cologne', 'extrait', 'oil', 'solid', 'mist']);
const ALLOWED_GENDER = new Set(['feminine', 'masculine', 'unisex']);
const arr = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const conc = (v: any): string | null => (typeof v === 'string' && ALLOWED_CONC.has(v) ? v : null);
const gen = (v: any): string | null => (typeof v === 'string' && ALLOWED_GENDER.has(v) ? v : null);
const tier = (v: any): number | null => (Number.isFinite(v) && v >= 1 && v <= 5 ? Math.round(v) : null);
const yr = (v: any): number | null => (Number.isFinite(v) && v >= 1800 && v <= 2100 ? Math.round(v) : null);
const intCents = (v: any): number | null => (Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
// numeric(3,2): 0..1 scores → clamp to [0, 9.99], 2 decimals
const score = (v: any): number | null => (Number.isFinite(v) ? Math.min(9.99, Math.max(0, Math.round(v * 100) / 100)) : null);
const obj = (v: any): Record<string, number> => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

async function loadExistingKeys(): Promise<Set<string>> {
  const existing = new Set<string>();
  let from = 0; const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('fragrances').select('name, brands(name)').range(from, from + PAGE - 1);
    if (error) { console.error('fetch existing failed:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const r of data as any[]) existing.add(matchKey(r.brands?.name ?? '', r.name));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return existing;
}

async function main() {
  console.log(`Mode: ${COMMIT ? 'COMMIT (writes)' : 'DRY RUN (no writes)'}${CAP !== Infinity ? ` | per-brand cap=${CAP}` : ''}\n`);
  const enriched: CandidateFragrance[] = JSON.parse(fs.readFileSync(IN_PATH, 'utf-8'));
  const existing = await loadExistingKeys();
  console.log(`enriched rows: ${enriched.length} | existing catalog keys: ${existing.size}\n`);

  // Build net-new, junk-filtered, deduped, capped insert set
  const reasons = new Map<string, number>(); // rejection reason → count
  const seenKey = new Set<string>();          // dedup within candidates
  const perBrand = new Map<string, number>();
  const toInsert: Array<{ candidate: CandidateFragrance; brand: string; slug: string }> = [];

  const rejectedNonPerfume: string[] = [];
  for (const c of enriched) {
    const brand = canonicalBrand(c.brand);
    const junk = isJunkName(c.brand, c.name);
    if (junk) { reasons.set(junk, (reasons.get(junk) ?? 0) + 1); continue; }

    if (isNonPerfumeName(c.name)) {
      reasons.set('non-perfume', (reasons.get('non-perfume') ?? 0) + 1);
      if (rejectedNonPerfume.length < 40) rejectedNonPerfume.push(`${brand} — ${c.name}`);
      continue;
    }

    const key = matchKey(c.brand, c.name);
    if (existing.has(key)) { reasons.set('already-in-catalog', (reasons.get('already-in-catalog') ?? 0) + 1); continue; }
    if (seenKey.has(key)) { reasons.set('dupe-within-file', (reasons.get('dupe-within-file') ?? 0) + 1); continue; }

    const n = perBrand.get(brand) ?? 0;
    if (n >= CAP) { reasons.set('over-brand-cap', (reasons.get('over-brand-cap') ?? 0) + 1); continue; }

    seenKey.add(key);
    perBrand.set(brand, n + 1);
    toInsert.push({ candidate: c, brand, slug: fragranceSlug(brand, c.name) });
  }

  console.log('Rejections:');
  [...reasons.entries()].sort((a, b) => b[1] - a[1]).forEach(([r, n]) => console.log(`  ${String(n).padStart(5)}  ${r}`));
  console.log(`\nWILL INSERT: ${toInsert.length} net-new originals (purchasable=false, is_active=true)`);
  console.log('Top brands in insert set:');
  [...perBrand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([b, n]) => console.log(`  ${String(n).padStart(4)}  ${b}`));

  console.log('\nSample REJECTED as non-perfume (verify these are body/face/home, not real scents):');
  rejectedNonPerfume.forEach((s) => console.log(`  ✗ ${s}`));

  if (!COMMIT) {
    console.log('\nDRY RUN — nothing written. Re-run with --commit to insert.');
    return;
  }

  // ── Write path ────────────────────────────────────────────────────────────
  // 1. ensure brands
  const brandIds = new Map<string, string>();
  const uniqueBrands = [...new Set(toInsert.map((t) => t.brand))];
  const brandRows = uniqueBrands.map((name) => ({ name, slug: brandSlug(name) }));
  await supabase.from('brands').upsert(brandRows, { onConflict: 'slug', ignoreDuplicates: true });
  const { data: bData } = await supabase.from('brands').select('id, slug').in('slug', uniqueBrands.map(brandSlug));
  for (const r of bData ?? []) brandIds.set(r.slug, r.id);

  // 2. build sanitized rows — drop any without a resolved brand_id (NOT NULL guard)
  const rows = [];
  let droppedNoBrand = 0;
  for (const { candidate: c, brand, slug } of toInsert) {
    const brand_id = brandIds.get(brandSlug(brand));
    if (!brand_id) { droppedNoBrand++; continue; }
    rows.push({
      slug,
      name: c.name,
      brand_id,
      release_year: yr(c.release_year),
      concentration: conc(c.concentration),
      fragrance_family: typeof c.fragrance_family === 'string' ? c.fragrance_family : null,
      gender: gen(c.gender),
      top_notes: arr(c.top_notes),
      heart_notes: arr(c.heart_notes),
      base_notes: arr(c.base_notes),
      top_accords: arr(c.top_accords),
      accord_intensity: obj(c.accord_intensity),
      community_longevity: score(c.community_longevity),
      community_sillage: score(c.community_sillage),
      community_projection: score(c.community_projection),
      compliment_score: score(c.compliment_score),
      versatility_score: score(c.versatility_score),
      office_safe_score: score(c.office_safe_score),
      price_tier: tier(c.price_tier),
      retail_msrp_usd_cents: intCents(c.retail_msrp_usd_cents),
      image_url: typeof c.image_url === 'string' ? c.image_url : null,
      source: typeof c.source === 'string' ? c.source : null,
      source_url: typeof c.source_url === 'string' ? c.source_url : null,
      notes_source: mapNotesSource(c.source),
      notes_verified: false,
      is_active: true,
      purchasable: false,
    });
  }
  if (droppedNoBrand) console.log(`(dropped ${droppedNoBrand} rows with unresolved brand_id)`);

  // 3. insert in batches; ignoreDuplicates → existing slugs are never overwritten.
  //    On batch error, fall back to per-row so one bad row can't kill 199 good ones.
  const insertedSlugs: string[] = [];
  let failed = 0; const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('fragrances').upsert(batch, { onConflict: 'slug', ignoreDuplicates: true });
    if (!error) {
      batch.forEach((r) => insertedSlugs.push(r.slug));
      console.log(`  batch ${i + 1}–${Math.min(i + BATCH, rows.length)} / ${rows.length} ok`);
    } else {
      console.warn(`  batch ${i} error (${error.message}) → retrying per-row`);
      for (const r of batch) {
        const { error: e2 } = await supabase.from('fragrances').upsert([r], { onConflict: 'slug', ignoreDuplicates: true });
        if (e2) { failed++; console.warn(`    SKIP ${r.slug}: ${e2.message}`); }
        else insertedSlugs.push(r.slug);
      }
    }
  }

  // 4. rollback manifest
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rbPath = path.join(DATA_DIR, `_imported-originals-${ts}.json`);
  fs.writeFileSync(rbPath, JSON.stringify({ count: insertedSlugs.length, slugs: insertedSlugs }, null, 2));

  console.log(`\nDone. sent ${rows.length} | failed ${failed} | rollback manifest: ${rbPath}`);
  console.log(`Rollback (if needed): delete from fragrances where purchasable=false and slug in (<slugs in manifest>);`);
}
main().catch((e) => { console.error(e); process.exit(1); });
