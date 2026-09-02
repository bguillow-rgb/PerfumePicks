/**
 * Catalog data-quality cleanup — three phases, dry-run by default.
 *
 * (a) Re-brand mis-attributed collabs. Fragrances scraped from a retailer/
 *     curator site (Arquiste, Arielle Shoshana, Sucreabeille) but actually made
 *     by a different, explicitly-named house (e.g. `"VACATION" by Vacation®`).
 *     Reattach to the real brand (create it if missing) + clean the display name.
 *     CURATED allow-list only — never heuristic — because brand identity is a
 *     judgment call. Person-name collabs (Kelly Rutherford, Michelle Visage) are
 *     intentionally HELD, not guessed.
 *
 * (b) Deactivate Sucreabeille marketplace NON-fragrances (stickers, dice,
 *     coasters, lip paint, face masks, deodorant, sample packs). Soft delete
 *     (is_active=false), reversible. HELD if user-referenced (safety contract,
 *     mirrors deactivate-junk-listings.ts).
 *
 * (c) Name-polish scan (DRY-RUN ONLY unless --apply-names): title-case ALL-CAPS
 *     raw-scrape names, and strip a redundant brand token duplicated inside the
 *     fragrance name. Broad + edge-case-prone → gated behind its own flag.
 *
 * IMPORTANT: only brand_id / name / is_active are ever written. slug and id are
 * never touched, so slug-keyed user data (wardrobe/wear) is never orphaned.
 *
 * Run:  npx tsx scripts/fix-catalog-quality.ts                 (dry-run all)
 *       npx tsx scripts/fix-catalog-quality.ts --apply         (writes a + b)
 *       npx tsx scripts/fix-catalog-quality.ts --apply --apply-names  (+ c)
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { brandSlug } from './lib/affiliate-etl-base';
dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const APPLY_NAMES = process.argv.includes('--apply-names');

const sb = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// ─── (a) curated re-brand map ────────────────────────────────────────────────
// Only unambiguous fragrance houses named explicitly in the current name.
const REBRAND: { id: string; newBrand: string; newName: string; was: string }[] = [
  { id: '85e820d0-8ae1-465f-b43a-c20201116228', newBrand: 'Vacation',                 newName: 'Vacation',       was: '“VACATION” by Vacation®' },
  { id: '3d63743f-718f-461d-b9d8-3d1d76bfd6d2', newBrand: 'Vacation',                 newName: 'After Sun',      was: '“AFTER SUN” by Vacation®' },
  { id: '2216cac5-6183-40e0-8bb3-deaadbedfff6', newBrand: 'BORNTOSTANDOUT',           newName: 'Fugazzi',        was: 'FUGAZZI by BORNTOSTANDOUT®' },
  { id: '669bd605-1328-4802-9852-a9450dbb31d0', newBrand: 'Amura Perfumes',           newName: 'Jasmine Dreams', was: 'Jasmine Dreams by Amura Perfumes' },
  { id: '0798ad5c-dd41-428e-af75-7ca4d9a63ec0', newBrand: 'Ethéré Parfum',            newName: 'Autumn',         was: 'Autumn 10ml by Ethéré Parfum' },
  { id: '2174e13e-eb35-410a-83e6-b1e8f06e9737', newBrand: 'Treading Water Perfume',   newName: 'Judith',         was: 'Judith 2ml EDP spray by Treading Water Perfume' },
  { id: '42880d65-1556-4529-a5bf-9c88fd4f2582', newBrand: 'OSM Olfactory Sense Memory', newName: 'Foreverness',  was: 'OSM 15-Foreverness by OSM Olfactory Sense Memory' },
];

// Person-name collabs held for manual confirmation (brand identity ambiguous).
const HELD_COLLABS = [
  '9b57a614-3b05-4c0e-8c5e-f548af0a5138  Rose Première by Kelly Rutherford',
  'ff2fceed-8c86-4f3b-a78a-3213a07b72ca  Wednesday by Michelle Visage',
];

// ─── (b) curated Sucreabeille non-fragrance junk (explicit for auditability) ──
const JUNK: { id: string; name: string }[] = [
  { id: '52e88167-4636-4fc5-af8a-6f6aea3b5f1f', name: 'Beam highlighter by Fat and the Moon' },
  { id: '8af9c73a-0e04-4ddc-ad01-cbbb6df215d9', name: 'Belly Birth Balm by Fat and the Moon' },
  { id: '0d5a366d-36fd-4e42-abd9-0a77d5905451', name: 'Corpse Water In-Shower + In-Bath Skin Smoothie by Kheimistrii' },
  { id: '3668bd7c-cb96-4b3f-b252-8968338b1117', name: 'Creepy Cute Fruits Sticker Pack by Snail Bear' },
  { id: '6bc26b72-4bd1-44d3-bd65-bea797b195bb', name: 'Glow highlighter by Fat and the Moon' },
  { id: '28457ef5-e98a-404d-9b15-870118d7cec2', name: 'Green clay face mask by Camria Beauty' },
  { id: '1a483108-6bb6-400e-9968-a5757d906f93', name: 'Hand-drawn Bird and Mushroom Vinyl Stickers by Forrest Chel Art' },
  { id: '2e20dfdc-2108-41a2-9fe2-af2509907fda', name: 'Mortar and Pestle lip paint by Fat and the Moon' },
  { id: 'd8c84e4f-07de-4bb5-aac0-8de54dedb1fa', name: 'Sucreabeille Bee Coaster by Oly Pots' },
  { id: '0bd1b797-e1c6-4ded-a9e8-02211e1d4712', name: 'Sucreabeille Bee D20 Dice by Dicey Dice' },
  { id: '574c2ca7-8ee5-4b4f-8f9a-1bfd9ab8f396', name: 'Vanilla + Rose Whipped Deo Cream by Lunar Glow Skin Co' },
  { id: 'd6970ec6-aa87-45b1-95dd-a84f1b71a590', name: 'Wood Nymph lip paint by Fat and the Moon' },
  { id: 'cd1303ac-e3be-4a83-ac2c-a0276e14112b', name: 'Sample Pack of Perfume Oils by Lala Land Scents' },
];

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

/** Find a brand by slug, or create it. Returns brand id. */
async function ensureBrand(name: string): Promise<string> {
  const slug = brandSlug(name);
  const { data: existing } = await sb.from('brands').select('id').eq('slug', slug).maybeSingle();
  if (existing?.id) return existing.id;
  const id = crypto.randomUUID();
  if (APPLY) {
    const { error } = await sb.from('brands').insert({ id, name, slug });
    if (error) throw new Error(`create brand ${name}: ${error.message}`);
  }
  console.log(`    + created brand "${name}" [${slug}]${APPLY ? '' : ' (dry-run)'}`);
  return id;
}

// ─── (c) name-polish helpers ─────────────────────────────────────────────────
const MINOR = new Set(['a','an','and','or','the','of','de','du','des','le','la','les','by','for','in','on','to','n','et','il']);
const KEEP_UPPER = new Set([
  'EDP','EDT','EDC','OSM','OG','II','III','IV','VI','XX','DNA','NYC','UK','USA','UAE',
  'DKNY','YSL','CK','MCM','BDK','MFK','TF','JPG','PDM','GA','XJ','DS','L',
]);
// Concentration / qualifier words that must never be dropped as a "brand" strip.
const CONC = /\b(elixir|intense|extrait|parfum|cologne|edp|edt|edc|absolu|absolue|eau|essence|forte|sport|noir|oud)\b/i;
/** A short all-consonant token (DKNY, YSL, MCM) is almost always an acronym brand. */
function looksAcronym(bare: string): boolean {
  if (MINOR.has(bare.toLowerCase())) return false;   // "by", "n" etc. are not acronyms
  return bare.length >= 2 && bare.length <= 4 && !/[aeiou]/i.test(bare) && bare === bare.toUpperCase();
}
function titleCaseName(s: string): string {
  const words = s.split(/\s+/);
  return words.map((w, i) => {
    const bare = w.replace(/[^a-z0-9]/gi, '');
    if (KEEP_UPPER.has(bare.toUpperCase()) || looksAcronym(bare)) return w.toUpperCase();
    const lw = w.toLowerCase();
    if (i !== 0 && MINOR.has(bare.toLowerCase())) return lw;
    return lw.charAt(0).toUpperCase() + lw.slice(1);
  }).join(' ');
}
function isAllCaps(s: string): boolean {
  const letters = s.replace(/[^A-Za-z]/g, '');
  return letters.length > 3 && s === s.toUpperCase() && /[A-Z]/.test(s);
}
/** Strip a brand token duplicated at the very start or end of the name. */
function stripRedundantBrand(name: string, brand: string): string | null {
  const b = brand.trim();
  if (b.length < 3) return null;
  const esc = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = name;
  out = out.replace(new RegExp(`\\s+${esc}\\s*$`, 'i'), '');   // trailing "… Hermès"
  out = out.replace(new RegExp(`^${esc}\\s+(?=\\S)`, 'i'), ''); // leading "Prada …"
  out = out.replace(/[\s&/,+-]+$/, '').trim();   // drop any dangling connector ("Peace Love &")
  // Guard: don't nuke the whole name, and don't touch legit "X by <brand>" names.
  if (out === name.trim() || out.length < 2) return null;
  if (/\bby\s+$/i.test(name.slice(0, name.length - b.length))) return null;
  // Guard: never strip if the removed span carried a concentration/qualifier word
  // (e.g. brand "Caviar Elixir" would wrongly eat "Elixir" off a real name).
  const removed = name.replace(out, ' ');
  if (CONC.test(removed)) return null;
  // Guard: a strip that leaves a dangling connective ("Perles De" ← Lalique,
  // "Eau De" ← Murano) means the brand was integral to the name — skip it.
  const lastWord = out.split(/\s+/).pop()!.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (MINOR.has(lastWord)) return null;
  // Guard: eponymous / title names where the brand is part of the name
  // ("Mon Guerlain"→"Mon", "My Burberry"→"My", "I Am Juicy Couture"→"I Am").
  // If every remaining word is a title/possessive/connective, the strip is wrong.
  const TITLE = new Set([...MINOR, 'mon','ma','mes','my','mr','miss','mrs','ms','i','am','uomo','mio','mia']);
  const outWords = out.split(/\s+/).map((w) => w.replace(/[^a-z0-9]/gi, '').toLowerCase());
  if (outWords.every((w) => TITLE.has(w))) return null;
  // Guard: result collapses to a bare concentration word or a roman numeral.
  if (CONC.test(out) && out.split(/\s+/).length === 1) return null;
  if (/^[IVXLC]+$/i.test(out.replace(/[^a-z0-9]/gi, ''))) return null;
  return out;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${APPLY_NAMES ? ' +names' : ''}\n`);

  // ── (a) re-brand collabs ───────────────────────────────────────────────────
  console.log('── (a) Re-brand mis-attributed collabs ──');
  for (const r of REBRAND) {
    const brandId = await ensureBrand(r.newBrand);
    console.log(`  "${r.was}"  →  [${r.newBrand}] "${r.newName}"`);
    if (APPLY) {
      const { error } = await sb.from('fragrances')
        .update({ brand_id: brandId, name: r.newName }).eq('id', r.id);
      if (error) throw new Error(`rebrand ${r.id}: ${error.message}`);
    }
  }
  console.log(`  HELD (person-name collabs, confirm brand identity):`);
  HELD_COLLABS.forEach((h) => console.log(`    ${h}`));

  // ── (b) deactivate Sucreabeille junk ───────────────────────────────────────
  console.log('\n── (b) Deactivate Sucreabeille non-fragrances ──');
  const refTables = ['wardrobe_items', 'wear_logs', 'swipe_feedback', 'fragrance_reviews', 'compliments_log'];
  const userRef = new Set<string>();
  for (const t of refTables) {
    try {
      const rows = await fetchAll<{ fragrance_id: string }>(t, 'fragrance_id');
      rows.forEach((x) => x.fragrance_id && userRef.add(x.fragrance_id));
    } catch (e) { console.warn(`  (skip ${t}: ${(e as Error).message})`); }
  }
  const junkToKill = JUNK.filter((j) => !userRef.has(j.id));
  const junkHeld = JUNK.filter((j) => userRef.has(j.id));
  junkToKill.forEach((j) => console.log(`  deactivate: ${j.name}`));
  junkHeld.forEach((j) => console.log(`  HELD (user-referenced): ${j.name}`));
  if (APPLY && junkToKill.length) {
    const { error } = await sb.from('fragrances')
      .update({ is_active: false }).in('id', junkToKill.map((j) => j.id));
    if (error) throw new Error(`deactivate junk: ${error.message}`);
  }
  console.log(`  → ${junkToKill.length} to deactivate, ${junkHeld.length} held`);

  // ── (c) name polish (scan; apply only with --apply-names) ──────────────────
  console.log('\n── (c) Name polish (ALL-CAPS + redundant brand) ──');
  const brands = await fetchAll<{ id: string; name: string }>('brands', 'id, name');
  const bname = new Map(brands.map((b) => [b.id, b.name]));
  const frags = await fetchAll<{ id: string; name: string; brand_id: string }>(
    'fragrances', 'id, name, brand_id', (q) => q.eq('is_active', true),
  );
  const proposals: { id: string; from: string; to: string; kind: string }[] = [];
  for (const f of frags) {
    let target = f.name;
    let kind = '';
    if (isAllCaps(target)) { target = titleCaseName(target); kind = 'caps'; }
    const stripped = stripRedundantBrand(target, bname.get(f.brand_id) || '');
    if (stripped) { target = stripped; kind = kind ? 'caps+brand' : 'brand'; }
    if (target !== f.name) proposals.push({ id: f.id, from: f.name, to: target, kind });
  }
  const caps = proposals.filter((p) => p.kind.includes('caps')).length;
  const brnd = proposals.filter((p) => p.kind.includes('brand')).length;
  console.log(`  proposals: ${proposals.length}  (caps:${caps}, redundant-brand:${brnd})`);
  console.log('  sample (30):');
  proposals.slice(0, 30).forEach((p) => console.log(`    [${p.kind}] "${p.from}"  →  "${p.to}"`));
  require('fs').writeFileSync('/tmp/name_proposals.json', JSON.stringify(proposals, null, 2));
  console.log(`  full list written to /tmp/name_proposals.json`);
  if (APPLY_NAMES) {
    let done = 0;
    for (const p of proposals) {
      const { error } = await sb.from('fragrances').update({ name: p.to }).eq('id', p.id);
      if (error) throw new Error(`rename ${p.id}: ${error.message}`);
      if (++done % 100 === 0) console.log(`    renamed ${done}/${proposals.length}`);
    }
    console.log(`  ✓ applied ${done} name fixes`);
  } else {
    console.log('  (dry-run — re-run with --apply --apply-names to write phase c)');
  }

  console.log('\nDone.');
}
main().catch((e) => { console.error(e); process.exit(1); });
