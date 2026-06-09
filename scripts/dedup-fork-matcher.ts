/**
 * Fork dedup matcher: collapses duplicate fragrance rows that are the SAME scent
 * forked across feeds by naming differences (e.g. "Sauvage" vs "Sauvage Cologne
 * for Men"), while keeping every retailer buy-link.
 *
 * Safety contract (Mark Z conservative mandate):
 *   - GENDER-LOCKED. A line that has BOTH a men and a women variant is split by
 *     gender (men / women / unisex / unmarked kept as separate survivors) so
 *     distinct scents are NEVER merged. Only single-gender (or unmarked-only)
 *     lines collapse — that's where the cross-feed naming mismatch lives.
 *   - LINK-PRESERVING. A loser's retailer links migrate to the survivor before
 *     the loser is deactivated, so no Perfumania/FragranceShop buy-link is lost.
 *   - SOFT delete only (is_active=false). Reversible; no FK cascade.
 *   - HELD-FOR-REVIEW. Any subgroup whose loser is referenced by a user
 *     (wardrobe / wear log / swipe / review / compliment) is skipped entirely
 *     and printed for manual review — never auto-merged.
 *   - Idempotent: re-running merges nothing new.
 *
 * Run:  npx tsx scripts/dedup-fork-matcher.ts            (dry-run, default)
 *       npx tsx scripts/dedup-fork-matcher.ts --apply    (writes)
 *       npx tsx scripts/dedup-fork-matcher.ts --limit 50 (cap groups for a test)
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { normalizeStr } from './lib/affiliate-etl-base';
dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity;
})();

const sb = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function fetchAll<T>(table: string, cols: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let q = sb.from(table).select(cols).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

type Gender = 'men' | 'women' | 'unisex' | 'unmarked';

/** Marketed gender token in the ORIGINAL name; unmarked when none stated. */
function genderOf(name: string): Gender {
  if (/\bfor\s+(women|her)\b/i.test(name)) return 'women';
  if (/\bfor\s+(men|him)\b/i.test(name)) return 'men';
  if (/\bunisex\b/i.test(name)) return 'unisex';
  return 'unmarked';
}

/**
 * A dash-tail (" - <tail>") is strippable ONLY when it is pure size / packaging /
 * concentration-of-the-same-scent. If anything alphabetic survives the packaging
 * whitelist it's treated as a distinct flanker (e.g. "Eau Fraiche", "Millesime",
 * "Pdt", "Mint") and the tail is KEPT — so flankers never collapse into the base.
 */
function isFormatTail(tail: string): boolean {
  let t = tail.toLowerCase();
  t = t.replace(/\(.*?\)/g, ' ');                          // (Refillable)
  t = t.replace(/[\d.,]+/g, ' ');                          // sizes
  t = t.replace(/\b(refillable|fragrance|perfume|cologne|body|hair|mist|spray|splash|natural|vaporisateur|deluxe|edt|edp|edc|eau|de|parfum|toilette|extrait|oz|ml|fl)\b/gi, ' ');
  return t.replace(/[^a-z]/gi, '').length === 0;
}

/** Strip variant/concentration/size/gender suffixes → canonical scent name. */
function canonicalName(name: string): string {
  let n = name;
  n = n.replace(/\s+-\s+(.*)$/, (m, tail) => (isFormatTail(tail) ? '' : m));  // packaging tail only
  n = n.replace(/\s+(cologne|perfume|fragrance|eau\s+de\s+\w+)?\s*for\s+(men|women|him|her|unisex)\b.*$/i, '');
  n = n.replace(/\b(eau\s+de\s+parfum|eau\s+de\s+toilette|eau\s+de\s+cologne|extrait\s+de\s+parfum|parfum|cologne|perfume|fragrance|edt|edp|spray|tester|unboxed)\b/gi, ' ');
  n = n.replace(/\s+\d[\d.]*\s*(oz|ml|fl\.?\s*oz)\b.*$/i, ' ');
  return n.replace(/\s+/g, ' ').trim();
}

interface Frag { id: string; name: string; slug: string; brand_id: string; }
interface Link { id: string; fragrance_id: string; retailer: string; }

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}${LIMIT !== Infinity ? ` | limit ${LIMIT} groups` : ''}\n`);

  const brands = await fetchAll<{ id: string; name: string }>('brands', 'id, name');
  const brandName = new Map(brands.map((b) => [b.id, b.name]));

  const frags = await fetchAll<Frag>('fragrances', 'id, name, slug, brand_id', (q) => q.eq('is_active', true));
  console.log(`Active fragrances: ${frags.length}`);

  // links per fragrance
  const links = await fetchAll<Link>('fragrance_retailer_links', 'id, fragrance_id, retailer');
  const linksByFrag = new Map<string, Link[]>();
  for (const l of links) {
    if (!linksByFrag.has(l.fragrance_id)) linksByFrag.set(l.fragrance_id, []);
    linksByFrag.get(l.fragrance_id)!.push(l);
  }

  // user references → HOLD
  const refTables = ['wardrobe_items', 'wear_logs', 'swipe_feedback', 'fragrance_reviews', 'compliments_log'];
  const userRef = new Set<string>();
  for (const t of refTables) {
    try {
      const rows = await fetchAll<{ fragrance_id: string }>(t, 'fragrance_id');
      rows.forEach((r) => r.fragrance_id && userRef.add(r.fragrance_id));
    } catch (e) { console.warn(`  (skip ${t}: ${(e as Error).message})`); }
  }
  console.log(`Distinct fragrances referenced by users: ${userRef.size}\n`);

  // ── Group gender-blind by (brand, canonical scent) ──
  const byCanon = new Map<string, Frag[]>();
  for (const f of frags) {
    const bn = brandName.get(f.brand_id) ?? '';
    const canon = `${normalizeStr(bn).replace(/\s+/g, '-')}-${normalizeStr(canonicalName(f.name)).replace(/\s+/g, '-')}`;
    if (!byCanon.has(canon)) byCanon.set(canon, []);
    byCanon.get(canon)!.push(f);
  }

  // ── Build SAFE subgroups ──
  // If a line has BOTH men and women → split by gender (protect distinct scents).
  // Otherwise (single gender or unmarked-only) → collapse the whole line.
  const subgroups: { key: string; members: Frag[] }[] = [];
  for (const [canon, group] of byCanon) {
    if (group.length < 2) continue;
    const genders = new Set(group.map((f) => genderOf(f.name)));
    const dualGender = genders.has('men') && genders.has('women');
    if (dualGender) {
      const byG = new Map<Gender, Frag[]>();
      for (const f of group) {
        const g = genderOf(f.name);
        if (!byG.has(g)) byG.set(g, []);
        byG.get(g)!.push(f);
      }
      for (const [g, members] of byG) if (members.length > 1) subgroups.push({ key: `${canon}__${g}`, members });
    } else {
      subgroups.push({ key: canon, members: group });
    }
  }

  // ── Plan merges ──
  let groupsToMerge = 0, losersToDeactivate = 0, linksToMigrate = 0;
  let heldGroups = 0, heldLosers = 0;
  const heldReview: string[] = [];
  const samples: string[] = [];
  const plan: { survivor: Frag; losers: Frag[] }[] = [];

  let processed = 0;
  for (const { key, members } of subgroups) {
    if (processed >= LIMIT) break;
    processed++;

    // survivor = most retailer links, tie → shortest slug (cleanest)
    const ranked = [...members].sort((a, b) =>
      (linksByFrag.get(b.id)?.length ?? 0) - (linksByFrag.get(a.id)?.length ?? 0) || a.slug.length - b.slug.length);
    const survivor = ranked[0];
    const losers = ranked.slice(1);

    // HOLD whole subgroup if any loser is user-referenced
    if (losers.some((l) => userRef.has(l.id))) {
      heldGroups++;
      heldLosers += losers.length;
      if (heldReview.length < 40) {
        heldReview.push(`  [${key}] survivor="${survivor.name}" | held losers: ${losers.map((l) => `"${l.name}"${userRef.has(l.id) ? ' (USER REF)' : ''}`).join(', ')}`);
      }
      continue;
    }

    groupsToMerge++;
    losersToDeactivate += losers.length;
    // links the survivor doesn't already carry
    const survivorRetailers = new Set((linksByFrag.get(survivor.id) ?? []).map((l) => l.retailer));
    for (const l of losers) {
      for (const link of linksByFrag.get(l.id) ?? []) {
        if (!survivorRetailers.has(link.retailer)) { linksToMigrate++; survivorRetailers.add(link.retailer); }
      }
    }
    if (samples.length < 20) {
      samples.push(`  [${key}] survivor="${survivor.name}" ← ${losers.map((l) => `"${l.name}"`).join(', ')}`);
    }
    plan.push({ survivor, losers });
  }

  console.log(`══ FORK MERGE PLAN ══`);
  console.log(`  Subgroups (gender-locked):     ${subgroups.length}`);
  console.log(`  Groups to merge:               ${groupsToMerge}`);
  console.log(`  Loser rows to deactivate:      ${losersToDeactivate}`);
  console.log(`  Retailer links to migrate:     ${linksToMigrate}`);
  console.log(`  HELD groups (user-referenced): ${heldGroups}  (losers: ${heldLosers})`);
  console.log(`\nSample merges:`);
  samples.forEach((s) => console.log(s));
  if (heldReview.length) {
    console.log(`\nHeld-for-review (manual):`);
    heldReview.forEach((s) => console.log(s));
  }

  if (!APPLY) { console.log(`\nDry-run only. Re-run with --apply to write.`); return; }

  // ── Apply: migrate links, then deactivate losers ──
  console.log(`\nApplying...`);
  let migrated = 0, deactivated = 0;
  for (const { survivor, losers } of plan) {
    const survivorRetailers = new Set((linksByFrag.get(survivor.id) ?? []).map((l) => l.retailer));
    for (const l of losers) {
      for (const link of linksByFrag.get(l.id) ?? []) {
        if (survivorRetailers.has(link.retailer)) continue;   // survivor already has this retailer
        const { error } = await sb.from('fragrance_retailer_links')
          .update({ fragrance_id: survivor.id }).eq('id', link.id);
        if (error) { console.warn(`  link migrate failed ${link.id}: ${error.message}`); continue; }
        survivorRetailers.add(link.retailer);
        migrated++;
      }
    }
    const { error: deErr } = await sb.from('fragrances')
      .update({ is_active: false }).in('id', losers.map((l) => l.id));
    if (deErr) { console.warn(`  deactivate failed: ${deErr.message}`); continue; }
    deactivated += losers.length;
  }
  console.log(`\n✓ Migrated ${migrated} links | deactivated ${deactivated} loser rows (soft, reversible).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
