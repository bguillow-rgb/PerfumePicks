/**
 * ETL: AromaPassions (Awin) → Supabase  (purchasable dupes + clone_house pairs)
 *
 * AromaPassions (Awin advertiser 34989, feed F2027) is a perfume-dupe house —
 * every product is "Inspired by {original}". On --commit this script:
 *
 *   1. Imports each distinct dupe product as a PURCHASABLE catalog row under the
 *      "AromaPassions" brand, named after the original it clones (B-style, e.g.
 *      "Baccarat Rouge 540 (Inspired)"), with the Awin affiliate deep link as its
 *      buy link and the cheapest IN-STOCK USD variant price. Identity is stable:
 *      slug = "aromapassions-<original.slug>" (survives feed retitles), tagged
 *      source='aromapassions' (hidden from keyword search, drives the delisting
 *      reconciliation), upserted overwrite-on-conflict so restocks re-activate.
 *      Dupes that fall out of the feed are deactivated (is_active/purchasable=false).
 *
 *   2. Resolves each "Inspired by {original}" to a single catalog row, auto-
 *      creating parseable-but-missing originals as non-purchasable FK targets
 *      (mirrors import-clone-dupes), and writes the fragrance_dupes pairs
 *      (source='clone_house', VERIFIED — renders in Budget Dupes).
 *
 * Why the pair wiring lives here and not in import-clone-dupes.ts: many popular
 * originals (Baccarat Rouge 540, Aventus, Eros, Black Opium…) exist as MULTIPLE
 * catalog rows — concentration variants (edp + parfum), junk "Bundle & Save"
 * rows, and duplicate brand rows. import-clone-dupes' resolver treats >1 match as
 * ambiguous and skips, which would drop exactly the highest-value dupes. Here we
 * disambiguate deterministically (prefer active + real brand, then the canonical
 * shortest slug) so those pairs land.
 *
 * Unparsed / no-brand "Inspired by" strings (feed junk) are skipped: no original
 * ⇒ no B-style name ⇒ no purchasable dupe to wire.
 *
 * A JSON audit/rollback record of every pair + auto-created original is written
 * before any fragrance_dupes write.
 *
 * Required env (.env.local):
 *   SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   set -a && . ./.env.local && set +a && npx tsx scripts/etl-aromapassions.ts            # dry run
 *   set -a && . ./.env.local && set +a && npx tsx scripts/etl-aromapassions.ts --commit   # import + wire
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import {
  brandSlug,
  fragranceSlug,
  parseConcentration,
} from './lib/affiliate-etl-base';
import { normalize } from './types';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const COMMIT = process.argv.includes('--commit');
const FEED = process.argv.find((a) => a.startsWith('--feed='))?.slice('--feed='.length) || '/tmp/aroma.csv';
const OUT = path.join(__dirname, 'data', 'aromapassions-dupes.json');

const DUPE_BRAND = 'AromaPassions';
const RETAILER_ID = 'aromapassions';
const SOURCE_TAG = 'aromapassions';   // fragrances.source discriminator (hide from search, self-heal delisting)
const DEFAULT_MATCH = 85;             // inspired-by oil dupe; editorial default (uniform — not a measured score)
const TIER = 'clone_house';           // openly markets as inspired-by → verified
const MIN_FEED_ROWS = 600;            // feed is ~708; abort below this (truncated/broken download guard)

// Junk "brands" that are not a real house — never pick as an original FK target.
const JUNK_BRANDS = new Set(['bundle save', 'bundle and save']);
// Preferred concentration for a canonical original (mainstream retail version).
const CONC_RANK: Record<string, number> = { edp: 0, edt: 1, parfum: 2, extrait: 3, cologne: 4, oil: 5 };

// ─── CSV ────────────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift()!.map((h) => h.replace(/^\ufeff/, ''));
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

type Brand = { id: string; name: string; norm: string };
type Frag = {
  id: string; name: string; brand: string; slug: string;
  conc: string | null; active: boolean; purchasable: boolean;
  norm: string; bnorm: string;
};

async function fetchBrands(): Promise<Brand[]> {
  const out: Brand[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await supabase.from('brands').select('id, name').range(off, off + 999);
    if (!data?.length) break;
    for (const b of data) out.push({ id: b.id, name: b.name, norm: normalize(b.name) });
    if (data.length < 1000) break;
  }
  return out;
}
async function fetchFrags(): Promise<Frag[]> {
  const out: Frag[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await supabase
      .from('fragrances')
      .select('id, name, slug, concentration, is_active, purchasable, brands(name)')
      .range(off, off + 999);
    if (!data?.length) break;
    for (const r of data as any[]) {
      const brand = r.brands?.name ?? '';
      out.push({
        id: r.id, name: r.name ?? '', brand, slug: r.slug ?? '',
        conc: r.concentration ?? null, active: r.is_active ?? false, purchasable: r.purchasable ?? false,
        norm: normalize(r.name ?? ''), bnorm: normalize(brand),
      });
    }
    if (data.length < 1000) break;
  }
  return out;
}

// common feed typos / aliases -> canonical brand token used in catalog
const BRAND_FIX: Record<string, string> = {
  'mfk': 'maison francis kurkdjian',
  'maison francis kurkdjian mfk': 'maison francis kurkdjian',
  'vk rlf': 'viktor rolf',
  'givnchy': 'givenchy',
  'taur': 'tauer',
  'ysl': 'yves saint laurent',
  'yves saint lrnt': 'yves saint laurent',
  'yves saint lrnt ysl': 'yves saint laurent',
  'd g': 'dolce gabbana',
  'dg': 'dolce gabbana',
  'pdm': 'parfums de marly',
  'parfums de mrly': 'parfums de marly',
  'marly': 'parfums de marly',
  'mrly': 'parfums de marly',
  'jpg': 'jean paul gaultier',
  'd': 'dior',
  'ch': 'carolina herrera',
  'intio': 'initio',
  'initio': 'initio parfums prives',
  'givnchy linterdit': 'givenchy',
  'tf': 'tom ford',
  'vc a': 'van cleef arpels',
  'ck': 'calvin klein',
  'ysl l homme': 'yves saint laurent',
  'montblanc': 'mont blanc',
  'victoria secret': 'victorias secret',
  'louis vuitton': 'louis vuitton',
  'mark jacobs': 'marc jacobs',
  'killian': 'kilian',
  'by kilian': 'kilian',
  'ralph laren': 'ralph lauren',
  'bvlgri': 'bulgari',
  'bvlgari': 'bulgari',
  'paco rabane': 'paco rabanne',
  'armani': 'giorgio armani',
  'guccci': 'gucci',
  'maison martin margiela paris replica': 'maison margiela',
  'maison martin margiela paris': 'maison margiela',
  'maison martin margiela': 'maison margiela',
  'dptyque': 'diptyque',
  'diptq': 'diptyque',
  'glsr': 'glossier',
};

function splitOriginal(raw: string, brands: Brand[]): { brand: string; name: string } | null {
  const s = raw.replace(/\b(eau de parfum|eau de toilette|edp|edt|parfum|cologne|for (men|women|her|him)|unisex)\b/gi, ' ')
               .replace(/\s+/g, ' ').trim();
  const ns = normalize(s);
  const cand = [...brands.map((b) => b.norm), ...Object.keys(BRAND_FIX)]
    .filter((bn) => bn && (ns.startsWith(bn + ' ') || ns === bn))
    .sort((a, b) => b.length - a.length)[0];
  if (!cand) return null;
  const brandNorm = BRAND_FIX[cand] || cand;
  let rest = ns.slice(cand.length).trim();
  if (!rest) return null;
  const noise = new Set<string>(['perfumes', 'perfume', 'fragrances', 'fragrance', 'parfums', 'parfum',
    ...brandNorm.split(' '), ...cand.split(' ')]);
  const toks = rest.split(' ');
  while (toks.length > 1 && noise.has(toks[0])) toks.shift();
  rest = toks.join(' ');
  if (!rest) return null;
  const disp = brands.find((b) => b.norm === brandNorm)?.name
    || raw.split(/\s+/).slice(0, cand.split(' ').length).join(' ');
  return { brand: disp, name: rest };
}

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

/** Choose the single best catalog row to use as the original FK target. */
function pickCanonical(cands: Frag[]): Frag {
  return [...cands].sort((a, b) => {
    const aj = JUNK_BRANDS.has(a.bnorm) ? 1 : 0, bj = JUNK_BRANDS.has(b.bnorm) ? 1 : 0;
    if (aj !== bj) return aj - bj;                       // real brand before junk
    if (a.active !== b.active) return a.active ? -1 : 1; // active before inactive
    const ar = CONC_RANK[a.conc ?? ''] ?? 9, br = CONC_RANK[b.conc ?? ''] ?? 9;
    if (ar !== br) return ar - br;                       // mainstream concentration
    return a.slug.length - b.slug.length;                // canonical (shortest) slug
  })[0];
}

type Side = { brand: string; name: string };
type Orig =
  | { status: 'matched'; row: Frag }
  | { status: 'missing'; side: Side };

/** Map a parsed "Inspired by" original to a catalog row, or mark it for
 *  auto-create, or null when unusable (no brand prefix / fuzzy ambiguous). */
/** A name is unusable as a fragrance if it's empty, has no letters, or is just
 *  a leaked size/quantity token (e.g. "30 ml 1 oz"). */
function isJunkName(name: string): boolean {
  const n = name.trim();
  if (n.length < 2) return true;
  if (!/[a-z]/i.test(n)) return true;                  // no letters
  if (/^\d[\d.\s]*(ml|oz|fl)?\b/i.test(n)) return true; // starts with a size/number
  return false;
}

function resolveOriginal(
  raw: string, brands: Brand[], brandNorms: Set<string>,
  byBN: Map<string, Frag[]>, byN: Map<string, Frag[]>, frags: Frag[],
): Orig | null {
  const split = splitOriginal(raw, brands);
  if (!split) return null;
  const bn = `${normalize(split.brand)}|${normalize(split.name)}`;
  const exact = byBN.get(bn);
  if (exact?.length) return { status: 'matched', row: pickCanonical(exact) };
  const nHit = byN.get(normalize(split.name)) ?? [];
  if (nHit.length === 1) return { status: 'matched', row: nHit[0] };
  if (nHit.length > 1) {
    // name shared across brands — keep only brand-compatible rows, then pick one
    const tb = normalize(split.brand);
    const compat = nHit.filter((f) => f.bnorm.includes(tb) || tb.includes(f.bnorm));
    if (compat.length) return { status: 'matched', row: pickCanonical(compat) };
    return null; // genuinely ambiguous across unrelated brands
  }
  const tn = normalize(split.name), tb = normalize(split.brand);
  const fuzzy = frags.filter((f) =>
    (f.bnorm.includes(tb) || tb.includes(f.bnorm)) &&
    Math.abs(f.norm.length - tn.length) <= 3 && lev(f.norm, tn) <= 2);
  if (fuzzy.length === 1) return { status: 'matched', row: fuzzy[0] };
  // parseable but new → auto-create, ONLY when the brand resolves to a real
  // catalog brand (never invent a typo brand) and the name isn't size/junk.
  if (!brandNorms.has(normalize(split.brand))) return null;
  if (isJunkName(split.name)) return null;
  return { status: 'missing', side: split };
}

function label(s: Side): string { return `${s.brand} — ${s.name}`; }

// ─── Dupe upsert (dedicated — overwrites-on-conflict, owns identity) ──────────
//
// The shared upsertProducts() can't be used for these rows: it derives slug from
// brand+name (so the identity drifts when AromaPassions retitles a product), uses
// ignoreDuplicates so a restocked/repriced dupe is never refreshed, and never sets
// source/purchasable. These dupes need a STABLE identity (slug = aromapassions-<
// original.slug>) and must re-activate + refresh on every run, so we own the write.

type DupeRow = {
  slug: string;                 // aromapassions-<original.slug> — stable across retitles
  name: string;                 // "<Original Name> (Inspired)" (B-style display)
  conc: string | null;
  image_url: string | null;
  affiliate_url: string;
  price_cents: number | null;
};

async function upsertDupes(rows: DupeRow[], brandId: string): Promise<{ upserted: number; linked: number }> {
  const BATCH = 200;
  let upserted = 0, linked = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const fragRows = batch.map((r) => ({
      slug: r.slug, name: r.name, brand_id: brandId,
      concentration: r.conc, gender: 'unisex',
      image_url: r.image_url, is_active: true, purchasable: true, source: SOURCE_TAG,
    }));
    // onConflict:slug with ignoreDuplicates=false ⇒ overwrite: re-activates restocked
    // dupes and refreshes price/image/name display.
    const { error } = await supabase.from('fragrances').upsert(fragRows, { onConflict: 'slug' });
    if (error) { console.error('      dupe upsert failed:', error.message); process.exit(1); }
    upserted += fragRows.length;

    const slugs = batch.map((r) => r.slug);
    const { data } = await supabase.from('fragrances').select('id, slug').in('slug', slugs);
    const idBySlug = new Map<string, string>();
    for (const x of data ?? []) idBySlug.set(x.slug, x.id);

    const links = batch
      .map((r) => {
        const id = idBySlug.get(r.slug);
        if (!id) return null;
        return { fragrance_id: id, retailer: RETAILER_ID, url: r.affiliate_url, price_cents: r.price_cents, last_seen_at: new Date().toISOString() };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (links.length) {
      const { error: lErr } = await supabase.from('fragrance_retailer_links').upsert(links, { onConflict: 'fragrance_id,retailer' });
      if (lErr) console.warn('      retailer links upsert failed:', lErr.message);
      else linked += links.length;
    }
  }
  return { upserted, linked };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading catalog…');
  const [brands, frags] = await Promise.all([fetchBrands(), fetchFrags()]);
  console.log(`Brands: ${brands.length}  Fragrances: ${frags.length}`);

  const byBN = new Map<string, Frag[]>();
  const byN = new Map<string, Frag[]>();
  for (const f of frags) {
    const k = `${f.bnorm}|${f.norm}`;
    (byBN.get(k) ?? byBN.set(k, []).get(k)!).push(f);
    (byN.get(f.norm) ?? byN.set(f.norm, []).get(f.norm)!).push(f);
  }
  const brandNorms = new Set(brands.map((b) => b.norm));

  const rows = parseCSV(fs.readFileSync(FEED, 'utf-8'));
  console.log(`Feed rows: ${rows.length}`);

  // Feed sanity guard — a truncated/broken download must NOT trigger the delisting
  // pass and wipe the whole catalog of dupes. Abort loud before any write.
  if (rows.length < MIN_FEED_ROWS) {
    console.error(`Feed has only ${rows.length} rows (< ${MIN_FEED_ROWS}). Refusing to run — likely a truncated/broken download.`);
    process.exit(1);
  }

  // Collapse variants → one product per handle, keep cheapest IN-STOCK USD price.
  type Prod = { handle: string; title: string; ib: string; image: string; deepLink: string; priceCents: number };
  const byHandle = new Map<string, Prod>();
  let oos = 0, badCur = 0;
  for (const r of rows) {
    const handle = (r.link || '').split('?')[0];
    if (!handle) continue;
    const parts = (r.title || '').split('|').map((p) => p.trim());
    const ibSeg = parts.find((p) => /inspired by/i.test(p));
    if (!ibSeg) continue;
    const ib = ibSeg.replace(/^.*?inspired by\s+/i, '').trim();
    if (!ib) continue;

    // Availability: skip rows that aren't in stock (a product with ≥1 in-stock
    // variant still lands; a fully-OOS product drops and gets delisted below).
    if ((r.availability || '').toLowerCase().replace(/\s+/g, '_') !== 'in_stock') { oos++; continue; }

    // Currency guard: Awin Google-schema price is "<amount> <CUR>". We sell in USD;
    // never import a EUR/GBP amount as if it were dollars.
    const [amtStr, cur] = (r.price || '').trim().split(/\s+/);
    if (cur && cur.toUpperCase() !== 'USD') { badCur++; continue; }
    const cents = Math.round(parseFloat(amtStr || '') * 100);

    const existing = byHandle.get(handle);
    if (!existing) {
      byHandle.set(handle, {
        handle, title: r.title || '', ib,
        image: r.image_link || '', deepLink: r.aw_deep_link || '',
        priceCents: Number.isFinite(cents) && cents > 0 ? cents : 0,
      });
    } else if (Number.isFinite(cents) && cents > 0 && (existing.priceCents === 0 || cents < existing.priceCents)) {
      existing.priceCents = cents;
    }
  }
  console.log(`Distinct in-stock USD products: ${byHandle.size}  (skipped ${oos} out-of-stock, ${badCur} non-USD)`);

  type StagedPair = { dupeSlug: string; original: Orig; match_pct: number; note: string };
  const byDupe = new Map<string, { row: DupeRow; staged: StagedPair }>();
  let skipped = 0, noLink = 0;
  const skips: string[] = [];

  for (const p of byHandle.values()) {
    if (!p.deepLink.startsWith('https://www.awin1.com/cread.php')) { noLink++; continue; }
    const orig = resolveOriginal(p.ib, brands, brandNorms, byBN, byN, frags);
    if (!orig) { skipped++; skips.push(p.ib); continue; }

    // Stable identity: key the dupe to the ORIGINAL's slug, not the feed title.
    // AromaPassions retitling a product can't fork it into a second catalog row.
    const origSlug = orig.status === 'matched'
      ? orig.row.slug
      : fragranceSlug(orig.side.brand, orig.side.name);
    const origName = orig.status === 'matched' ? orig.row.name : orig.side.name;
    const dSlug = `aromapassions-${origSlug}`;
    const price = p.priceCents > 0 ? p.priceCents : null;

    const existing = byDupe.get(dSlug);
    if (existing) {
      // two AP products clone the same original → keep the cheaper price + its link
      if (price !== null && (existing.row.price_cents === null || price < existing.row.price_cents)) {
        existing.row.price_cents = price;
        existing.row.affiliate_url = p.deepLink;
      }
      existing.row.image_url = existing.row.image_url || (p.image || null);
      continue;
    }

    byDupe.set(dSlug, {
      row: {
        slug: dSlug, name: `${origName} (Inspired)`,
        conc: parseConcentration(p.title), image_url: p.image || null,
        affiliate_url: p.deepLink, price_cents: price,
      },
      staged: {
        dupeSlug: dSlug, original: orig, match_pct: DEFAULT_MATCH,
        note: `AromaPassions inspired-by (Awin); ${p.ib}`,
      },
    });
  }

  const staged = [...byDupe.values()].map((v) => v.staged);
  const dupeRows = [...byDupe.values()].map((v) => v.row);
  const matched = staged.filter((s) => s.original.status === 'matched').length;
  const missingOriginals = new Map<string, Side>();   // slug -> Side
  for (const s of staged) {
    if (s.original.status === 'missing') {
      missingOriginals.set(fragranceSlug(s.original.side.brand, s.original.side.name), s.original.side);
    }
  }

  console.log('\n── PLAN ──');
  console.log(`  dupe products to import : ${dupeRows.length}`);
  console.log(`  originals matched       : ${matched}`);
  console.log(`  originals to auto-create: ${missingOriginals.size}  (non-purchasable FK targets)`);
  console.log(`  skipped (unparsed/junk) : ${skipped}`);
  console.log(`  skipped (no deep link)  : ${noLink}`);
  if (skips.length) {
    console.log('\n── skipped "Inspired by" strings (top 30) ──');
    skips.slice(0, 30).forEach((s) => console.log('  ' + s));
  }

  // Audit/rollback record (pairs + auto-created originals) written before any write.
  fs.writeFileSync(OUT, JSON.stringify({
    _README: 'Auto-generated by etl-aromapassions.ts — audit/rollback record. The ETL itself wires these pairs on --commit.',
    generated_at: new Date().toISOString(),
    auto_created_originals: [...missingOriginals.values()].map(label),
    pairs: staged.map((s) => ({
      dupe_slug: s.dupeSlug,
      original: s.original.status === 'matched'
        ? { brand: s.original.row.brand, name: s.original.row.name, id: s.original.row.id }
        : { brand: s.original.side.brand, name: s.original.side.name, status: 'will-create' },
      match_pct: s.match_pct, tier: TIER, note: s.note,
    })),
  }, null, 2));
  console.log(`\nAudit record → ${path.relative(process.cwd(), OUT)} (${staged.length} pairs)`);

  if (!COMMIT) {
    console.log('\nDRY RUN — no catalog rows written. Re-run with --commit to import dupes + wire pairs.');
    return;
  }

  // ── Stage 1: import the purchasable AromaPassions dupe rows ──────────────────
  console.log(`\n[1/4] Importing ${dupeRows.length} AromaPassions dupe products…`);
  await supabase.from('brands').upsert(
    [{ name: DUPE_BRAND, slug: brandSlug(DUPE_BRAND) }],
    { onConflict: 'slug', ignoreDuplicates: true },
  );
  const { data: dbRow } = await supabase.from('brands').select('id').eq('slug', brandSlug(DUPE_BRAND)).maybeSingle();
  if (!dbRow?.id) { console.error('      could not resolve AromaPassions brand id'); process.exit(1); }
  const res = await upsertDupes(dupeRows, dbRow.id);
  console.log(`      upserted: ${res.upserted} dupe rows | retailer links: ${res.linked}`);

  // ── Reconciliation: delist dupes that fell out of the feed ───────────────────
  // Any prior source='aromapassions' row whose slug isn't in THIS run's produced
  // set is no longer sold (discontinued / permanently OOS) → deactivate so it stops
  // rendering in Budget Dupes. Self-healing; the feed-size guard above protects this.
  const producedSlugs = new Set(dupeRows.map((r) => r.slug));
  const { data: priorAP } = await supabase.from('fragrances').select('id, slug').eq('source', SOURCE_TAG);
  const stale = (priorAP ?? []).filter((r) => !producedSlugs.has(r.slug)).map((r) => r.id);
  if (stale.length) {
    const { error: delErr } = await supabase.from('fragrances')
      .update({ is_active: false, purchasable: false }).in('id', stale);
    console.log(delErr ? `      delist FAIL: ${delErr.message}` : `      delisted ${stale.length} dupes no longer in feed.`);
  } else {
    console.log('      no stale dupes to delist.');
  }

  // ── Stage 2: auto-create missing originals (non-purchasable FK targets) ──────
  if (missingOriginals.size) {
    console.log(`[3/4] Auto-creating ${missingOriginals.size} missing originals…`);
    const uniqueBrands = [...new Set([...missingOriginals.values()].map((s) => s.brand))];
    await supabase.from('brands').upsert(
      uniqueBrands.map((name) => ({ name, slug: brandSlug(name) })),
      { onConflict: 'slug', ignoreDuplicates: true },
    );
    const { data: bData } = await supabase.from('brands').select('id, slug').in('slug', uniqueBrands.map(brandSlug));
    const brandIds = new Map<string, string>();
    for (const r of bData ?? []) brandIds.set(r.slug, r.id);
    const origRows = [];
    for (const s of missingOriginals.values()) {
      const brand_id = brandIds.get(brandSlug(s.brand));
      if (!brand_id) { console.warn(`      SKIP create (no brand_id): ${label(s)}`); continue; }
      origRows.push({
        slug: fragranceSlug(s.brand, s.name), name: s.name, brand_id,
        notes_verified: false, is_active: true, purchasable: false, source: 'clone-dupe-original',
      });
    }
    const { error } = await supabase.from('fragrances').upsert(origRows, { onConflict: 'slug', ignoreDuplicates: true });
    if (error) { console.error('      original auto-create failed:', error.message); process.exit(1); }
    console.log(`      created/ensured ${origRows.length} original rows.`);
  }

  // ── Stage 4: resolve ids and write fragrance_dupes pairs ─────────────────────
  console.log('[4/4] Wiring fragrance_dupes pairs…');
  const allSlugs = [
    ...staged.map((s) => s.dupeSlug),
    ...staged.filter((s) => s.original.status === 'missing').map((s) => fragranceSlug(s.original.side.brand, s.original.side.name)),
  ];
  const slugToId = new Map<string, string>();
  for (let i = 0; i < allSlugs.length; i += 500) {
    const { data } = await supabase.from('fragrances').select('id, slug').in('slug', allSlugs.slice(i, i + 500));
    for (const r of data ?? []) slugToId.set(r.slug, r.id);
  }

  const toInsert: { original_id: string; dupe_id: string; match_pct: number; source: string; note: string }[] = [];
  const problems: string[] = [];
  for (const s of staged) {
    const dupeId = slugToId.get(s.dupeSlug);
    if (!dupeId) { problems.push(`dupe row missing: ${s.dupeSlug}`); continue; }
    const originalId = s.original.status === 'matched'
      ? s.original.row.id
      : slugToId.get(fragranceSlug(s.original.side.brand, s.original.side.name));
    if (!originalId) { problems.push(`original row missing for ${s.dupeSlug}`); continue; }
    if (originalId === dupeId) { problems.push(`self-pair skipped: ${s.dupeSlug}`); continue; }
    toInsert.push({ original_id: originalId, dupe_id: dupeId, match_pct: s.match_pct, source: TIER, note: s.note });
  }

  const { error: pairErr } = await supabase.from('fragrance_dupes').upsert(toInsert, { onConflict: 'original_id,dupe_id' });
  if (pairErr) { console.error('      fragrance_dupes upsert failed:', pairErr.message); process.exit(1); }
  console.log(`      upserted ${toInsert.length} clone_house pairs.`);
  if (problems.length) {
    console.log(`\n── problems (${problems.length}) ──`);
    problems.slice(0, 20).forEach((p) => console.log('  • ' + p));
  }
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
