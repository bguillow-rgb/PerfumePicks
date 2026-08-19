/**
 * dedupe-sku-variants — collapse retailer SKU variants into ONE canonical
 * fragrance. Dry-run by default.
 *
 * The affiliate feeds list each *size/format* of a fragrance as its own product
 * ("Zoologist Dragonfly Sample", "… Travel Spray", "… Deluxe Bottle"), and the
 * ETL ingested them as three separate fragrances. A user searching "dragonfly"
 * sees three rows for one scent. This collapses them:
 *
 *   1. Strip a CURATED trailing variant token (sample / tester / decant /
 *      travel spray / deluxe bottle / gift set / mini / "N ml" / "N oz") to get
 *      the base name. Concentration words (elixir, intense, parfum, EDP…) and
 *      flanker words (for her, noir…) are NEVER stripped — those are real
 *      distinct fragrances.
 *   2. Group by (brand_id, normalized base name).
 *   3. In each group pick ONE canonical, rename it to the clean base, and
 *      deactivate the rest (is_active=false, merged_into_id=canonical.id).
 *
 * Canonical preference: a row that is already clean (no variant suffix) >
 * full-bottle formats > travel > sample. Tie-breaks: user-referenced row wins
 * (never orphan user data), then purchasable, then has image, then oldest.
 *
 * SAFETY (mirrors fix-catalog-quality.ts):
 *   - Only name / is_active / merged_into_id are ever written. slug + id are
 *     never touched, so slug/fragrance_id-keyed user data is never orphaned.
 *   - If >1 row in a group is user-referenced, the whole group is HELD (a merge
 *     would strand one user's bottle). Reported, not auto-merged.
 *   - Soft delete only — fully reversible.
 *
 * Run:  npx tsx scripts/dedupe-sku-variants.ts            (dry-run)
 *       npx tsx scripts/dedupe-sku-variants.ts --apply    (writes)
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const sb = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type Frag = {
  id: string; name: string; brand_id: string | null; slug: string;
  purchasable: boolean | null; image_url: string | null;
  source_url: string | null; created_at: string;
};

// A trailing variant descriptor = a SKU/format tag, not part of the scent name.
// Matched only at the END of the name, optionally wrapped in ()/[]/-.
const VARIANT_WORD =
  '(?:samples?|testers?|decants?|travel\\s*sprays?|travel\\s*size|purse\\s*spray|' +
  'deluxe\\s*bottle|gift\\s*set|discovery\\s*set|value\\s*set|mini(?:ature)?s?|' +
  'refills?|\\d+(?:\\.\\d+)?\\s*(?:ml|mls|milliliters?|oz|ounces?|g|grams?))';
// Optional concentration token that can sit between the base and the variant
// ("… 2ml EDP spray") — allowed to be consumed as part of the SKU tail ONLY when
// followed by a real variant word, never on its own.
const CONC_OPT = '(?:\\s*(?:edp|edt|edc|parfum|cologne|eau\\s*de\\s*\\w+))?';
// LEADING SEPARATOR REQUIRED (`+`, not `*`): the variant tail must be preceded
// by whitespace/punct so we never bite a word-suffix ("mini" inside "Gemini").
const VARIANT_TAIL = new RegExp(
  `[\\s\\-–—(\\[]+${VARIANT_WORD}${CONC_OPT}(?:\\s*sprays?)?[\\s)\\]]*$`, 'i',
);
// Connective/possessive words that must never be left dangling at the end — if a
// strip produces "… of" / "… de" / "… &", the token was integral, so revert.
const MINOR_TAIL = new Set(['of', 'de', 'du', 'des', 'the', 'a', 'an', 'and', 'le', 'la', 'les', 'y', 'et', 'du', '&']);

/** Strip trailing variant tokens repeatedly. Returns {base, hadVariant}. */
function stripVariant(name: string): { base: string; hadVariant: boolean } {
  let out = name.trim();
  let hit = false;
  for (let i = 0; i < 4; i++) {
    const next = out.replace(VARIANT_TAIL, '').replace(/[\s\-–—(\[&]+$/, '').trim();
    if (next === out || next.length < 3) break;
    // Reverting guard: don't leave a dangling connective ("Bestsellers Set of").
    const lastWord = next.split(/\s+/).pop()!.replace(/[^a-z0-9&]/gi, '').toLowerCase();
    if (MINOR_TAIL.has(lastWord)) break;
    out = next; hit = true;
  }
  return { base: out, hadVariant: hit };
}

/** Format rank for canonical preference — higher = more canonical. */
function formatRank(name: string): number {
  const n = name.toLowerCase();
  if (/\b(sample|decant|tester)\b/.test(n)) return 1;
  if (/\btravel\s*spray|purse\s*spray|mini|miniature\b/.test(n)) return 2;
  if (/\b(deluxe\s*bottle|gift\s*set|value\s*set|discovery\s*set)\b/.test(n)) return 3;
  if (/\d+(\.\d+)?\s*(ml|oz)\b/.test(n)) return 3;
  return 5; // clean, no variant tag
}

async function fetchAll<T>(table: string, cols: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = []; let from = 0; const PAGE = 1000;
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

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  // User-referenced fragrance ids (never orphan these).
  const refTables = ['wardrobe_items', 'wear_logs', 'swipe_feedback', 'fragrance_reviews', 'compliments_log'];
  const userRef = new Set<string>();
  for (const t of refTables) {
    try {
      const rows = await fetchAll<{ fragrance_id: string }>(t, 'fragrance_id');
      rows.forEach((x) => x.fragrance_id && userRef.add(x.fragrance_id));
    } catch (e) { console.warn(`  (skip ${t}: ${(e as Error).message})`); }
  }
  console.log(`User-referenced fragrance ids: ${userRef.size}`);

  const frags = await fetchAll<Frag>(
    'fragrances',
    'id, name, brand_id, slug, purchasable, image_url, source_url, created_at',
    (q) => q.eq('is_active', true),
  );
  console.log(`Active fragrances: ${frags.length}\n`);

  // Group by brand + normalized base name.
  type Group = { key: string; base: string; rows: Frag[] };
  const groups = new Map<string, Group>();
  for (const f of frags) {
    const { base } = stripVariant(f.name);
    const key = `${f.brand_id ?? 'null'}|${base.toLowerCase().replace(/\s+/g, ' ')}`;
    if (!groups.has(key)) groups.set(key, { key, base, rows: [] });
    groups.get(key)!.rows.push(f);
  }

  const merges: { canonical: Frag; cleanName: string; kill: Frag[] }[] = [];
  const renames: { row: Frag; to: string }[] = [];   // lone variant rows just cleaned
  const held: { base: string; rows: Frag[] }[] = [];

  for (const g of groups.values()) {
    const anyVariant = g.rows.some((r) => stripVariant(r.name).hadVariant);
    if (g.rows.length === 1) {
      // Lone row: clean its name if it carries a variant tag, else leave it.
      const { base, hadVariant } = stripVariant(g.rows[0].name);
      if (hadVariant && base !== g.rows[0].name) renames.push({ row: g.rows[0], to: base });
      continue;
    }
    if (!anyVariant) continue; // a real multi-row group with no SKU tags — leave alone

    const refd = g.rows.filter((r) => userRef.has(r.id));
    if (refd.length > 1) { held.push({ base: g.base, rows: g.rows }); continue; }

    // Pick canonical: user-referenced first, then format rank, then purchasable,
    // then has image, then oldest.
    const canonical = [...g.rows].sort((a, b) => {
      const ua = userRef.has(a.id) ? 1 : 0, ub = userRef.has(b.id) ? 1 : 0;
      if (ua !== ub) return ub - ua;
      const fr = formatRank(b.name) - formatRank(a.name);
      if (fr !== 0) return fr;
      const pa = a.purchasable ? 1 : 0, pb = b.purchasable ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const ia = a.image_url ? 1 : 0, ib = b.image_url ? 1 : 0;
      if (ia !== ib) return ib - ia;
      return a.created_at.localeCompare(b.created_at);
    })[0];
    const kill = g.rows.filter((r) => r.id !== canonical.id);
    merges.push({ canonical, cleanName: g.base, kill });
  }

  const killCount = merges.reduce((n, m) => n + m.kill.length, 0);
  console.log(`── MERGE GROUPS: ${merges.length}  (rows to deactivate: ${killCount}) ──`);
  merges.slice(0, 40).forEach((m) => {
    console.log(`  ✓ keep [${m.canonical.name}]  →  rename "${m.cleanName}"`);
    m.kill.forEach((k) => console.log(`      ✗ deactivate: ${k.name}${userRef.has(k.id) ? ' (USER-REF!)' : ''}`));
  });
  if (merges.length > 40) console.log(`  … +${merges.length - 40} more groups`);

  console.log(`\n── LONE VARIANT RENAMES (clean name only): ${renames.length} ──`);
  renames.slice(0, 25).forEach((r) => console.log(`  "${r.row.name}"  →  "${r.to}"`));
  if (renames.length > 25) console.log(`  … +${renames.length - 25} more`);

  console.log(`\n── HELD (>1 user-referenced row — manual review): ${held.length} ──`);
  held.forEach((h) => { console.log(`  ${h.base}:`); h.rows.forEach((r) => console.log(`      ${r.name}${userRef.has(r.id) ? ' (USER-REF)' : ''}`)); });

  fs.writeFileSync('/tmp/dedupe_plan.json', JSON.stringify({ merges, renames, held }, null, 2));
  console.log(`\nFull plan → /tmp/dedupe_plan.json`);
  console.log(`\nSUMMARY: ${merges.length} merges, ${killCount} deactivations, ${renames.length} renames, ${held.length} held`);

  if (!APPLY) { console.log('\n(dry-run — re-run with --apply to write)'); return; }

  // ── APPLY ──
  let renamed = 0, killed = 0;
  for (const m of merges) {
    if (m.cleanName !== m.canonical.name) {
      const { error } = await sb.from('fragrances').update({ name: m.cleanName }).eq('id', m.canonical.id);
      if (error) throw new Error(`rename canonical ${m.canonical.id}: ${error.message}`);
      renamed++;
    }
    if (m.kill.length) {
      const { error } = await sb.from('fragrances')
        .update({ is_active: false, merged_into_id: m.canonical.id })
        .in('id', m.kill.map((k) => k.id));
      if (error) throw new Error(`deactivate group ${m.canonical.id}: ${error.message}`);
      killed += m.kill.length;
    }
  }
  for (const r of renames) {
    const { error } = await sb.from('fragrances').update({ name: r.to }).eq('id', r.row.id);
    if (error) throw new Error(`rename ${r.row.id}: ${error.message}`);
    renamed++;
  }
  console.log(`\n✓ applied: ${renamed} renames, ${killed} deactivations, ${held.length} held for review`);
}
main().catch((e) => { console.error(e); process.exit(1); });
