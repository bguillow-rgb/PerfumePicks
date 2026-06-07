/**
 * canonicalize-catalog — reversible catalog data-quality canonicalization.
 *
 * Fixes the raw-Perfumania-feed defects quantified by audit-catalog-quality.ts:
 *
 *   A. HTML-entity brand names  ("Dolce &amp; Gabbana" → "Dolce & Gabbana").
 *   B. Brand de-duplication      — entity brands that have a CLEAN twin get their
 *      fragrances repointed onto the twin (brand_id merge); entity brands with no
 *      twin are renamed in place.
 *   C. Fragrance slug regeneration for every affected fragrance, so the "amp"
 *      token disappears from the slug. If the regenerated slug collides with an
 *      already-existing row (i.e. the fragrance is a true encoding-twin of a row
 *      under the clean brand), the entity row is QUARANTINED (is_active=false)
 *      instead — we never break the unique-slug constraint and never delete.
 *   D. Junk-brand quarantine     — "Bundle & Save" / wholesale / assorted brands.
 *   E. Non-fragrance SKU quarantine — dusting powder, body cream/lotion/milk,
 *      shower gel, bath, soap, hair mist, shampoo, gift set, coffret, talc,
 *      deodorant, after-bath splash.  TESTERS ARE NOT QUARANTINED (real product).
 *
 * Everything is REVERSIBLE: quarantine = is_active=false (the app filters on
 * is_active=true everywhere), brand/slug rewrites are deterministic and logged.
 * User data (wardrobe / wear_logs / reviews) keys on the fragrance UUID, never
 * the slug, so slug rewrites are safe.
 *
 * DRY RUN by default — prints the full plan and writes nothing. Pass --commit.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/canonicalize-catalog.ts
 *   set -a && source .env.local && set +a && npx tsx scripts/canonicalize-catalog.ts --commit
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fragranceSlug, normalizeStr, brandSlug } from './lib/affiliate-etl-base';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const COMMIT = process.argv.includes('--commit');

// ── HTML-entity decode (covers what the audit flagged in brand names) ──────────
const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/gi, '&')
    .replace(/&#0?39;|&#x27;|&rsquo;/gi, "'")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&hellip;/gi, '…')
    .replace(/&ndash;|&mdash;/gi, '-')
    .replace(/\s{2,}/g, ' ')
    .trim();

const ENTITY = /&(amp|#0?39|#x27|quot|#34|lt|gt|nbsp|reg|trade|eacute|egrave|deg|hellip|ndash|mdash|rsquo|lsquo|ldquo|rdquo);/i;

// ── Junk brand (whole brand is non-product) ───────────────────────────────────
const JUNK_BRAND = /bundle\s*&?\s*save|\bwholesale\b|\bassorted\b/i;

// ── Non-fragrance SKU names (TESTERS EXCLUDED ON PURPOSE) ──────────────────────
const NONFRAG_NAME =
  /\b(dusting powder|body cream|body lotion|body milk|body butter|shower gel|bath gel|bubble bath|after\s?bath splash|after\s?shave|aftershave|\bsoap\b|hair mist|hair perfume|shampoo|conditioner|gift set|\bcoffret\b|\btalc\b|deodorant|deo stick|antiperspirant|\d\s?piece\b|value set|mini set)\b/i;

type Brand = { id: string; name: string };
type Frag = { id: string; name: string; slug: string; brand_id: string; is_active: boolean };

async function fetchAll<T>(table: string, cols: string): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let o = 0; ; o += PAGE) {
    const { data, error } = await supabase.from(table).select(cols).range(o, o + PAGE - 1);
    if (error) { console.error(table, error.message); process.exit(1); }
    if (!data || !data.length) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

type BrandPlan =
  | { kind: 'merge'; brand: Brand; decoded: string; twinId: string }
  | { kind: 'rename'; brand: Brand; decoded: string };

type FragUpdate = { id: string; from: string; to: string; brand_id?: string; reason: string };

async function main() {
  console.log(`canonicalize-catalog  (${COMMIT ? 'COMMIT' : 'DRY RUN'})\n`);

  const brands = await fetchAll<Brand>('brands', 'id, name');
  const frags = await fetchAll<Frag>('fragrances', 'id, name, slug, brand_id, is_active');
  const brandById = new Map(brands.map((b) => [b.id, b]));
  console.log(`brands: ${brands.length}   fragrances: ${frags.length}   active: ${frags.filter((f) => f.is_active).length}\n`);

  // Global slug ownership (slug -> fragrance id) for collision detection.
  const slugOwner = new Map<string, string>();
  for (const f of frags) slugOwner.set(f.slug, f.id);

  // Index brands by normalized name to find clean twins.
  const brandsByNorm = new Map<string, Brand[]>();
  for (const b of brands) {
    const k = normalizeStr(b.name);
    (brandsByNorm.get(k) ?? brandsByNorm.set(k, []).get(k)!).push(b);
  }
  const fragsByBrand = new Map<string, Frag[]>();
  for (const f of frags) (fragsByBrand.get(f.brand_id) ?? fragsByBrand.set(f.brand_id, []).get(f.brand_id)!).push(f);

  // ── Plan A/B: entity brands → merge or rename ────────────────────────────────
  const brandPlans: BrandPlan[] = [];
  for (const b of brands) {
    if (!ENTITY.test(b.name)) continue;
    const decoded = decodeEntities(b.name);
    const twin = (brandsByNorm.get(normalizeStr(decoded)) ?? []).find((x) => x.id !== b.id);
    if (twin) brandPlans.push({ kind: 'merge', brand: b, decoded, twinId: twin.id });
    else brandPlans.push({ kind: 'rename', brand: b, decoded });
  }

  console.log('=== A/B  ENTITY BRANDS ===');
  for (const p of brandPlans) {
    const n = (fragsByBrand.get(p.brand.id) ?? []).length;
    const tw = p.kind === 'merge' ? ` → MERGE into "${brandById.get(p.twinId)!.name}"` : ` → RENAME to "${p.decoded}"`;
    console.log(`  "${p.brand.name}" (${n} frags)${tw}`);
  }

  // ── Plan C: fragrance slug regen (+ brand repoint for merges) ────────────────
  const fragUpdates: FragUpdate[] = [];
  const quarantine = new Map<string, string>(); // fragId -> reason (deduped)
  const willOwn = new Map<string, string>(slugOwner); // simulate slug table after frees/claims

  for (const p of brandPlans) {
    const targetBrandId = p.kind === 'merge' ? p.twinId : p.brand.id;
    for (const f of fragsByBrand.get(p.brand.id) ?? []) {
      const newSlug = fragranceSlug(p.decoded, f.name);
      if (newSlug === f.slug) {
        // slug already clean; just repoint brand if merging
        if (p.kind === 'merge') fragUpdates.push({ id: f.id, from: f.slug, to: f.slug, brand_id: targetBrandId, reason: 'repoint' });
        continue;
      }
      const owner = willOwn.get(newSlug);
      if (owner && owner !== f.id) {
        // true encoding-twin of an existing row → quarantine this entity row
        quarantine.set(f.id, `dup-of ${newSlug}`);
        continue;
      }
      // claim the new slug, free the old one
      willOwn.delete(f.slug);
      willOwn.set(newSlug, f.id);
      fragUpdates.push({ id: f.id, from: f.slug, to: newSlug, brand_id: p.kind === 'merge' ? targetBrandId : undefined, reason: p.kind });
    }
  }

  console.log(`\n=== C  FRAGRANCE SLUG REGEN ===`);
  console.log(`  rewrites: ${fragUpdates.length}   collision-quarantines: ${quarantine.size}`);
  for (const u of fragUpdates.slice(0, 12)) console.log(`    ${u.from}  →  ${u.to}${u.brand_id ? '  [repoint]' : ''}`);
  if (quarantine.size) console.log('  collision samples:', [...quarantine.entries()].slice(0, 8).map(([id, r]) => r));

  // ── Plan D: junk brands → quarantine all their frags ─────────────────────────
  const junkBrandIds = new Set(brands.filter((b) => JUNK_BRAND.test(b.name)).map((b) => b.id));
  let junkBrandFrags = 0;
  for (const f of frags) {
    if (junkBrandIds.has(f.brand_id) && f.is_active) { quarantine.set(f.id, 'junk-brand'); junkBrandFrags++; }
  }
  console.log(`\n=== D  JUNK BRANDS ===`);
  console.log('  brands:', brands.filter((b) => JUNK_BRAND.test(b.name)).map((b) => b.name));
  console.log(`  active frags to quarantine: ${junkBrandFrags}`);

  // ── Plan E: non-fragrance SKU names → quarantine ─────────────────────────────
  let nonFrag = 0;
  const nfSamples: string[] = [];
  for (const f of frags) {
    if (!f.is_active) continue;
    if (quarantine.has(f.id)) continue;
    if (NONFRAG_NAME.test(f.name)) { quarantine.set(f.id, 'non-fragrance'); nonFrag++; if (nfSamples.length < 12) nfSamples.push(f.name); }
  }
  console.log(`\n=== E  NON-FRAGRANCE SKUs (testers excluded) ===`);
  console.log(`  active frags to quarantine: ${nonFrag}`);
  console.log('  samples:', nfSamples);

  console.log(`\n=== TOTALS ===`);
  console.log(`  brand renames: ${brandPlans.filter((p) => p.kind === 'rename').length}`);
  console.log(`  brand merges:  ${brandPlans.filter((p) => p.kind === 'merge').length}`);
  console.log(`  frag slug rewrites: ${fragUpdates.length}`);
  console.log(`  frag quarantines:   ${quarantine.size}`);

  if (!COMMIT) {
    console.log('\nDRY RUN — nothing written. Re-run with --commit to apply.');
    return;
  }

  // ── APPLY ────────────────────────────────────────────────────────────────────
  console.log('\nApplying...');

  // 1. Brand renames (decode in place). Merges leave the orphan entity brand as-is.
  for (const p of brandPlans) {
    if (p.kind !== 'rename') continue;
    const { error } = await supabase.from('brands').update({ name: p.decoded, slug: brandSlug(p.decoded) }).eq('id', p.brand.id);
    if (error) { console.error(`brand rename ${p.brand.name}:`, error.message); process.exit(1); }
  }
  console.log(`  ✓ renamed ${brandPlans.filter((p) => p.kind === 'rename').length} brands`);

  // 2. Fragrance slug rewrites (+ brand repoint). One row at a time — slug is unique.
  let done = 0;
  for (const u of fragUpdates) {
    const patch: Record<string, unknown> = {};
    if (u.to !== u.from) patch.slug = u.to;
    if (u.brand_id) patch.brand_id = u.brand_id;
    if (!Object.keys(patch).length) continue;
    const { error } = await supabase.from('fragrances').update(patch).eq('id', u.id);
    if (error) { console.error(`frag update ${u.from}:`, error.message); process.exit(1); }
    if (++done % 25 === 0) console.log(`    slug rewrites ${done}/${fragUpdates.length}`);
  }
  console.log(`  ✓ rewrote ${done} fragrance slugs/brands`);

  // 3. Quarantine (is_active=false) in chunks.
  const qIds = [...quarantine.keys()];
  for (let i = 0; i < qIds.length; i += 200) {
    const chunk = qIds.slice(i, i + 200);
    const { error } = await supabase.from('fragrances').update({ is_active: false }).in('id', chunk);
    if (error) { console.error('quarantine chunk:', error.message); process.exit(1); }
  }
  console.log(`  ✓ quarantined ${qIds.length} fragrances (is_active=false)`);

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
