/**
 * dna-tier-recognizable — grow the Fragrance DNA picker pool.
 *
 * THE PROBLEM (found 2026-08-29): the picker showed 111 bottles out of 10,371
 * active. A user DM'd "Not impressed. Very few of my fragrances were in there."
 * We first read that as catalog gaps, but the catalog was never the binding
 * constraint — the PICKER GATE was.
 *
 * dna_eligible (scripts/dna-compute-eligible.ts) requires popularity_tier >= 3,
 * and tiers came from a curated seed doc (docs/perfume-picks-popularity-seed-v1.md)
 * that no longer exists in the repo, so nothing has re-tiered since. 8,947 bottles
 * already satisfy EVERY other eligibility rule (active, not discontinued, image
 * present, accords readable) and are held out of the picker by tier alone.
 *
 * Bumping all 8,947 is wrong: the grid is a RECOGNITION surface, and flooding it
 * with indie/marketplace long-tail (Sucreabeille 687, Arielle Shoshana 367,
 * Demeter 411) makes it worse, not better. So this tiers only bottles from houses
 * a collector would actually recognize, and asks the model to judge the specific
 * fragrance — a house being famous does not make every flanker recognizable.
 *
 * Tier meaning (matches dna-compute-eligible's >=3 gate):
 *   5 iconic/blockbuster · 4 well-known · 3 recognizable to enthusiasts
 *   0 => leave at 2 (stays catalog-only, never a picker tile)
 *
 * SAFETY: only popularity_tier is written. Dry-run by default; every prior value
 * is captured to a rollback file before the first write. Low-confidence rows are
 * skipped rather than guessed.
 *
 * Run:  npx tsx scripts/dna-tier-recognizable.ts            (dry-run)
 *       npx tsx scripts/dna-tier-recognizable.ts --commit
 *       LIMIT=200 npx tsx scripts/dna-tier-recognizable.ts  (sample first)
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: '.env.local' });

const COMMIT = process.argv.includes('--commit');
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
const MODEL = 'claude-haiku-4-5-20251001';
const AK = process.env.ANTHROPIC_API_KEY!;
const sb = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
if (!AK) { console.error('missing ANTHROPIC_API_KEY'); process.exit(1); }

/**
 * Houses a fragrance collector would plausibly own or recognize: designer
 * pillars, major niche, and the Middle-Eastern houses that dominate the
 * enthusiast conversation. Matched case-insensitively as a substring of the
 * brand name, so "Parfums de Marly" catches any casing/suffix variant.
 * Deliberately EXCLUDES indie/marketplace/curator brands — not a quality
 * judgement, just: they are not what a recognition grid is for.
 */
const HOUSES = [
  // designer
  'chanel','dior','christian dior','yves saint laurent','ysl','tom ford','gucci','prada','versace',
  'giorgio armani','armani','dolce','givenchy','hermes','hermès','guerlain','lancome','lancôme',
  'paco rabanne','rabanne','azzaro','valentino','carolina herrera','viktor','mugler','thierry mugler',
  'jean paul gaultier','burberry','calvin klein','ralph lauren','hugo boss','montblanc','mont blanc',
  'bvlgari','bulgari','cartier','chloe','chloé','marc jacobs','issey miyake','kenzo','lacoste',
  'moschino','narciso rodriguez','jimmy choo','tommy hilfiger','coach','michael kors','elizabeth arden',
  // niche
  'creed','parfums de marly','xerjoff','amouage','maison francis kurkdjian','mfk','initio',
  'jo malone','le labo','byredo','diptyque','frederic malle','frédéric malle','serge lutens',
  'maison margiela','kilian','by kilian','nishane','montale','mancera','roja','clive christian',
  'penhaligon','acqua di parma','bond no','memo paris','zoologist','tiziana terenzi','orto parisi',
  'nasomatto','escentric','juliette has a gun','etat libre','l artisan','artisan parfumeur','goutal',
  'atelier cologne','maison crivelli','parfums de nicolai','histoires de parfums','ex nihilo','bdk',
  // middle-eastern / value houses with real enthusiast mindshare
  'lattafa','afnan','armaf','rasasi','ajmal','al haramain','swiss arabian','arabian oud','asdaaf',
  'maison alhambra','french avenue','rayhaan','khadlaj','paris corner','maison asrar','zimaya',
];

type Row = { id: string; name: string; popularity_tier: number | null; brands: { name: string } | null };

const SYSTEM = `You rate how RECOGNIZABLE a fragrance is to someone who collects or shops fragrance, for a bottle-picker grid where users tap bottles they already own.

Return STRICT JSON array, no markdown, same length and order as the input. Each object:
{ "idx": <echo input index>, "tier": 5|4|3|0, "confidence": "high"|"medium"|"low" }

Tiers:
  5 = iconic blockbuster nearly any fragrance shopper knows (Sauvage, Bleu de Chanel, Aventus, Baccarat Rouge 540, Good Girl, La Vie Est Belle, Layton, Khamrah)
  4 = well-known, widely discussed and sold (Y EDP, Stronger With You, Oud Wood, Delina, Asad, Supremacy Not Only)
  3 = recognizable to enthusiasts but not mainstream (deeper niche pillars, notable flankers)
  0 = NOT recognizable — obscure flankers, body products, regional-only SKUs, or anything you do not genuinely recognize

Rules:
- A famous HOUSE does not make every product recognizable. Most house catalogs are long-tail; be strict.
- Use 0 whenever unsure. A wrong 3+ puts an unrecognizable bottle in a recognition grid, which is the exact failure we are fixing.
- Never invent. If the name looks like a gift set, sample, body lotion, or you do not know it, return 0.`;

async function rate(batch: { brand: string; name: string }[]): Promise<any[]> {
  const msg = 'Fragrances:\n' + batch.map((b, i) => `${i}. ${b.brand} — ${b.name}`).join('\n');
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': AK, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: SYSTEM, messages: [{ role: 'user', content: msg }] }),
      });
      if (!res.ok) { console.warn(`  LLM ${res.status}`); await new Promise(r => setTimeout(r, 1200 * (a + 1))); continue; }
      const d = await res.json();
      const t = d.content?.[0]?.text ?? '[]';
      return JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
    } catch (e) { console.warn(`  attempt ${a + 1}: ${(e as Error).message}`); await new Promise(r => setTimeout(r, 1200 * (a + 1))); }
  }
  return [];
}

async function main() {
  console.log(`Mode: ${COMMIT ? 'APPLY' : 'DRY-RUN'}${LIMIT ? ` (LIMIT ${LIMIT})` : ''}\n`);

  // Candidates: everything dna-compute-eligible would pass EXCEPT the tier gate.
  const all: Row[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb
      .from('fragrances')
      .select('id, name, popularity_tier, brands(name)')
      .eq('is_active', true).eq('is_discontinued', false)
      .not('image_url', 'is', null).neq('accord_intensity', '{}')
      .lt('popularity_tier', 3)
      .range(off, off + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  const inHouse = all.filter((r) => {
    const b = (r.brands?.name ?? '').toLowerCase();
    return b && HOUSES.some((h) => b.includes(h));
  });
  const candidates = LIMIT ? inHouse.slice(0, LIMIT) : inHouse;
  console.log(`tier-blocked pool: ${all.length}`);
  console.log(`  from recognizable houses: ${inHouse.length}  → rating ${candidates.length}\n`);

  const decisions: { row: Row; tier: number; conf: string }[] = [];
  for (let i = 0; i < candidates.length; i += 25) {
    const batch = candidates.slice(i, i + 25);
    const out = await rate(batch.map((r) => ({ brand: r.brands?.name ?? '', name: r.name })));
    const byIdx = new Map(out.map((o: any) => [o.idx, o]));
    batch.forEach((r, j) => {
      const o: any = byIdx.get(j);
      if (o && o.tier >= 3 && o.confidence !== 'low') decisions.push({ row: r, tier: o.tier, conf: o.confidence });
    });
    if ((i / 25) % 10 === 0) console.log(`  rated ${Math.min(i + 25, candidates.length)}/${candidates.length} → ${decisions.length} promotions so far`);
  }

  const byTier: Record<number, number> = {};
  decisions.forEach((d) => { byTier[d.tier] = (byTier[d.tier] ?? 0) + 1; });
  console.log(`\n── PROMOTIONS: ${decisions.length} of ${candidates.length} rated (${((decisions.length / Math.max(candidates.length,1)) * 100).toFixed(0)}%) ──`);
  console.log('by tier:', JSON.stringify(byTier));
  console.log('\nsample (30):');
  decisions.slice(0, 30).forEach((d) => console.log(`  t${d.tier} ${d.conf.padEnd(6)} ${d.row.brands?.name} — ${d.row.name}`));

  if (!COMMIT) { console.log(`\n(dry-run — re-run with --commit to write ${decisions.length} tiers)`); return; }
  if (!decisions.length) { console.log('\nnothing to write.'); return; }

  const rb = path.join(process.cwd(), 'scripts/data/rollback-dna-tiers.json');
  fs.writeFileSync(rb, JSON.stringify({ at: new Date().toISOString(), rows: decisions.map((d) => ({ id: d.row.id, popularity_tier: d.row.popularity_tier })) }, null, 2));
  console.log(`\nrollback → ${rb}`);

  let done = 0;
  for (const d of decisions) {
    const { error } = await sb.from('fragrances').update({ popularity_tier: d.tier }).eq('id', d.row.id);
    if (error) throw new Error(`update ${d.row.id}: ${error.message}`);
    if (++done % 200 === 0) console.log(`  wrote ${done}/${decisions.length}`);
  }
  console.log(`\n✓ tiered ${done} bottles. Now run: npx tsx scripts/dna-compute-eligible.ts --commit`);
}
main().catch((e) => { console.error(e); process.exit(1); });
