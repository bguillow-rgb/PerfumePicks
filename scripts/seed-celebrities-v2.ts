/**
 * Precise celebrity→fragrance seeder (v2).
 *
 * Replaces the loose `ILIKE '%name%'` v1, which attached celebs to flankers,
 * testers and "(Inspired)" dupes. Here each bottle is resolved to its CANONICAL
 * active row by exact (case-insensitive) name match, scoped to the brand, and
 * ranked by purchasable → popularity_tier → cleanest name. Misses are reported,
 * never force-matched.
 *
 * EVIDENCE RULE (enforced here, not by discipline): a row is `verified: true`
 * ONLY when it carries a non-empty `source_url` pointing at a primary source
 * that states the relationship (brand campaign/press page, dated interview, or
 * cited biography). A celeb with no source_url is still written, but as
 * `verified: false` — and the app only renders verified rows, so unverified
 * claims never reach a user. This is what makes "research-driven seeding" safe:
 * the burden is a working link, not someone's say-so. The seeder REPORTS every
 * unverified target so the gap is visible, never silent.
 *
 * Dry run (default): npx tsx scripts/seed-celebrities-v2.ts
 * Write:             WRITE=1 npx tsx scripts/seed-celebrities-v2.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
const s = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const WRITE = process.env.WRITE === '1';

type Celeb = {
  name: string;
  category: string;
  source: string;       // relationship kind: 'brand_ambassador' | 'interview' | 'biography' | 'social_media' | 'paparazzi' | 'brand_founder'
  source_url?: string;  // primary-source link. REQUIRED for verified:true; omit/empty → row written verified:false.
};
type Target = {
  brand?: string;        // brand keyword (ilike) for scoping
  name: string;          // exact (case-insensitive) catalog name of the canonical bottle
  conc?: string;         // preferred concentration tiebreak (e.g. 'edt')
  celebs: Celeb[];
};

const TARGETS: Target[] = [
  // ── Brand ambassadors with a fetched primary-source link → write verified:true ──
  { brand: 'Dior', name: 'Sauvage', celebs: [{ name: 'Johnny Depp', category: 'actor', source: 'brand_ambassador', source_url: 'https://hypebeast.com/2022/8/johnny-depp-dior-sauvage-fragrance-ambassador-return-contract-renewal' }] },
  { brand: 'Chanel', name: 'Bleu de Chanel', conc: 'edp', celebs: [
    { name: 'Timothée Chalamet', category: 'actor', source: 'brand_ambassador', source_url: 'https://graziamagazine.com/us/articles/timothee-chalamet-new-face-bleu-de-chanel-fragrance/' },
    { name: 'Jacob Elordi', category: 'actor', source: 'brand_ambassador', source_url: 'https://hypebeast.com/2026/4/jacob-elordi-officially-new-face-of-bleu-de-chanel-announcement' },
  ] },
  { brand: 'Dior', name: 'Miss Dior', celebs: [{ name: 'Natalie Portman', category: 'actor', source: 'brand_ambassador', source_url: 'https://www.luxurydaily.com/miss-dior-natalie-portman-2021/' }] },
  { brand: 'Dior', name: "J'adore", celebs: [{ name: 'Charlize Theron', category: 'actor', source: 'brand_ambassador', source_url: 'https://hauteliving.com/2022/09/charlize-theron-dior-jadore-parfum-deau/718301/' }] },
  { brand: 'Creed', name: 'Green Irish Tweed', celebs: [{ name: 'King Charles', category: 'royal', source: 'biography', source_url: 'https://www.newbeauty.com/king-charles-fragrance/' }] },
  // CORRECTED: Acqua di Giò face is Aaron Taylor-Johnson, not Chris Hemsworth (Hemsworth → Boss Bottled).
  { brand: 'Armani', name: 'Acqua di Gio', celebs: [{ name: 'Aaron Taylor-Johnson', category: 'actor', source: 'brand_ambassador', source_url: 'https://www.malemodelscene.net/mens-fragrance/aaron-taylor-johnson-armani-acqua-di-gio/' }] },
  { brand: 'Chanel', name: 'Coco Mademoiselle', celebs: [{ name: 'Keira Knightley', category: 'actor', source: 'brand_ambassador', source_url: 'https://www.myfacehunter.com/2021/04/keira-knightley-stars-in-coco.html' }] },
  { brand: 'Lancôme', name: 'La Vie Est Belle', celebs: [{ name: 'Julia Roberts', category: 'actor', source: 'brand_ambassador', source_url: 'https://cosmeticsbusiness.com/lanc-me-and-julia-roberts-spread-happiness-with-new-la-vie-est-belle-film-145931' }] },
  { brand: 'Saint Laurent', name: 'Black Opium', celebs: [{ name: 'Zoe Kravitz', category: 'actor', source: 'brand_ambassador', source_url: 'https://www.hellomagazine.com/healthandbeauty/skincare-and-fragrances/2018071350234/zoe-kravitz-fronts-ysl-black-opium-campaign/' }] },
  { brand: 'Dolce', name: 'Light Blue', celebs: [{ name: 'David Gandy', category: 'model', source: 'brand_ambassador', source_url: 'https://en.wikipedia.org/wiki/David_Gandy' }] },
  { brand: 'Rabanne', name: 'Invictus', celebs: [{ name: 'Nick Youngquest', category: 'athlete', source: 'brand_ambassador', source_url: 'https://www.beautyscene.net/fragrances-for-men/nick-youngquest-for-paco-rabanne-invictus/' }] },
  { brand: 'Gucci', name: 'Bloom', celebs: [{ name: 'Florence Welch', category: 'musician', source: 'brand_ambassador', source_url: 'https://smagazineofficial.com/beauty/florence-welch-gucci-bloom-campaign-101122690' }] },
  { brand: 'Gucci', name: 'Guilty Pour Homme', celebs: [{ name: 'Jared Leto', category: 'actor', source: 'brand_ambassador', source_url: 'https://cosmeticsbusiness.com/gucci-unveils-guiltynotguilty-fragrance-campaign-with-jared-leto-120481' }] },
  { brand: 'Chanel', name: 'Chanel No 5 Eau de Parfum', celebs: [
    { name: 'Marilyn Monroe', category: 'actor', source: 'biography', source_url: 'https://www.marieclaire.com/beauty/makeup/a8509/marie-claire-marilyn-monroe-chanel-obsession/' },
    { name: 'Nicole Kidman', category: 'actor', source: 'biography', source_url: 'https://en.wikipedia.org/wiki/No._5_the_Film' },
    { name: 'Brad Pitt', category: 'actor', source: 'brand_ambassador', source_url: 'https://www.thelocal.fr/20121012/brad-pitt-first-male-face-of-chanel-no5/' },
    { name: 'Margot Robbie', category: 'actor', source: 'brand_ambassador', source_url: 'https://cosmeticsbusiness.com/margot-robbie-unveiled-as-face-of-chanel-no-5' },
    { name: 'Lily-Rose Depp', category: 'actor', source: 'brand_ambassador', source_url: 'https://graziadaily.co.uk/beauty-hair/makeup/lily-rose-depp-chanel-no5-perfume/' },
  ] },
  { brand: 'Dior', name: 'Dior Homme', celebs: [
    { name: 'Robert Pattinson', category: 'actor', source: 'brand_ambassador', source_url: 'https://www.thewrap.com/twilight-star-robert-pattinson-named-new-face-dior-homme-scent-96856/' },
    { name: 'Jude Law', category: 'actor', source: 'brand_ambassador', source_url: 'https://sidewalkhustle.com/jude-law-for-dior-homme-cologne-2013-campaign/' },
  ] },
  { brand: 'Dior', name: 'Hypnotic Poison', celebs: [{ name: 'Monica Bellucci', category: 'actor', source: 'brand_ambassador', source_url: 'https://auparfum.bynez.com/Monica-Bellucci-s-envenime-pour-Dior' }] },
  { brand: 'Lancôme', name: 'Idole', celebs: [{ name: 'Zendaya', category: 'actor', source: 'brand_ambassador', source_url: 'https://cosmeticsbusiness.com/lanc-me-unveils-id-le-campaign-starring-ambassador-zendaya-coleman-157736' }] },
  // CORRECTED: Willow Smith is a Dior Addict face (Dior Perfumes family), not Mugler Alien.
  { brand: 'Dior', name: 'Dior Addict', celebs: [
    { name: 'Anya Taylor-Joy', category: 'actor', source: 'brand_ambassador', source_url: 'https://hypebeast.com/2025/12/anya-taylor-joy-jisoo-and-willow-smith-join-the-dior-perfumes-universe' },
    { name: 'Jisoo', category: 'musician', source: 'brand_ambassador', source_url: 'https://hypebeast.com/2025/12/anya-taylor-joy-jisoo-and-willow-smith-join-the-dior-perfumes-universe' },
    { name: 'Willow Smith', category: 'musician', source: 'brand_ambassador', source_url: 'https://hypebeast.com/2025/12/anya-taylor-joy-jisoo-and-willow-smith-join-the-dior-perfumes-universe' },
  ] },
  { brand: 'Versace', name: 'Eros', conc: 'edt', celebs: [{ name: 'Channing Tatum', category: 'actor', source: 'brand_ambassador', source_url: 'https://fuckingyoung.es/channing-tatum-is-the-new-face-of-versace-eros-fragrance-line/' }] },
  { brand: 'Hugo Boss', name: 'Boss Bottled', celebs: [
    { name: 'Gerard Butler', category: 'actor', source: 'brand_ambassador', source_url: 'https://www.cosmeticsbusiness.com/boss-parfums-unveils-gerard-butler-as-boss-bottled-ambassador-100298' },
    { name: 'Chris Hemsworth', category: 'actor', source: 'brand_ambassador', source_url: 'https://group.hugoboss.com/en/newsroom/news/news-detail/boss-parfums-presents-chris-hemsworth-as-the-new-man-of-today' },
  ] },
  { brand: 'Viktor', name: 'Flowerbomb', celebs: [{ name: 'Emily Ratajkowski', category: 'model', source: 'brand_ambassador', source_url: 'https://www.cosmeticsbusiness.com/news/article_page/Emily_Ratajkowski_is_the_new_face_of_Viktor_and_Rolfs_Flowerbomb/206257' }] },
  // ── New ambassadors with links; bottle may or may not be in catalog (dry-run reports misses) ──
  { brand: 'Saint Laurent', name: 'Libre', celebs: [{ name: 'Dua Lipa', category: 'musician', source: 'brand_ambassador', source_url: 'https://moodiedavittreport.com/libre-yves-saint-laurent-launches-gender-bending-new-fragrance-with-dua-lipa-as-brand-ambassador/' }] },
  { brand: 'Burberry', name: 'Hero', celebs: [{ name: 'Adam Driver', category: 'actor', source: 'brand_ambassador', source_url: 'https://10magazine.com/ten-meets-adam-driver-as-he-stars-in-burberrys-hero-parfum-campaign/' }] },
  { brand: 'Armani', name: 'My Way', celebs: [{ name: 'Sydney Sweeney', category: 'actor', source: 'brand_ambassador', source_url: 'https://www.happi.com/breaking-news/armani-beauty-taps-sydney-sweeney-new-face-of-its/' }] },

  // ── Documented but no primary-source link yet → written verified:false (won't render until a link is added) ──
  { brand: 'Kurkdjian', name: 'Baccarat Rouge 540', celebs: [
    { name: 'Rihanna', category: 'musician', source: 'interview' },
    { name: 'Kim Kardashian', category: 'influencer', source: 'social_media' },
    { name: 'Olivia Rodrigo', category: 'musician', source: 'interview' },
  ] },
  // Beckham *wears* Aventus (documented wearer, not an ambassador) — kept as an association, unverified.
  { brand: 'Creed', name: 'Aventus', celebs: [{ name: 'David Beckham', category: 'athlete', source: 'interview' }] },
  { brand: 'Tom Ford', name: 'Lost Cherry', celebs: [{ name: 'Hailey Bieber', category: 'model', source: 'interview' }] },
  { brand: 'Tom Ford', name: 'Black Orchid', celebs: [{ name: 'Tom Ford', category: 'designer', source: 'brand_founder' }] },
  { brand: 'Byredo', name: 'Gypsy Water', celebs: [{ name: 'Rosie Huntington-Whiteley', category: 'model', source: 'interview' }] },
  { brand: 'Le Labo', name: 'Santal 33', celebs: [
    { name: 'Justin Bieber', category: 'musician', source: 'paparazzi' },
    { name: 'Ryan Gosling', category: 'actor', source: 'interview' },
  ] },
  { brand: 'Le Labo', name: 'Another 13', celebs: [{ name: 'Beyoncé', category: 'musician', source: 'interview' }] },
  { brand: 'Malle', name: 'Portrait of a Lady', celebs: [{ name: 'Anna Wintour', category: 'fashion', source: 'interview' }] },
  { brand: 'Malle', name: 'Carnal Flower', celebs: [{ name: 'Diane Kruger', category: 'actor', source: 'interview' }] },
  { brand: 'Marly', name: 'Delina', celebs: [{ name: 'Sofia Richie', category: 'influencer', source: 'social_media' }] },
  { brand: 'Ariana Grande', name: 'Cloud', celebs: [{ name: 'Ariana Grande', category: 'musician', source: 'brand_founder' }] },
  { brand: 'Rabanne', name: 'Phantom', celebs: [{ name: 'Moses Sumney', category: 'musician', source: 'brand_ambassador' }] },
  { brand: 'Nihilo', name: 'Fleur Narcotique', celebs: [{ name: 'Hailey Bieber', category: 'model', source: 'interview' }] },
  { brand: 'Kilian', name: 'love don t be shy', celebs: [{ name: 'Rihanna', category: 'musician', source: 'interview' }] },

  // DROPPED as factually wrong (no credible source): Drake/Tobacco Vanille (→Tuscan Leather),
  // Ryan Reynolds/Oud Wood (unsupported), Henry Cavill/Dunhill Icon (wrong line),
  // Lady Gaga/Mugler Angel (her own "Fame"), Princess Diana/Shalimar (→Penhaligon's Bluebell).
];

const JUNK = /tester|inspired|miniature|\bset\b|after\s?shave|deodorant|\bhair\b|\bbody\b|shower|primer|travel|gift|sample|roll-?on|lipstick|lip |mascara|cushion/i;

async function brandIds(keyword: string): Promise<string[]> {
  const { data } = await s.from('brands').select('id').ilike('name', `%${keyword}%`);
  return (data ?? []).map((b) => b.id);
}

/**
 * Returns ALL canonical active rows for the bottle (best first). The catalog has
 * duplicate same-name rows; in-app search may open any of them, so we attach the
 * celebs to every twin — otherwise the card shows only on the one we happened to
 * pick (the bug that hid Baccarat Rouge 540).
 */
async function resolve(t: Target) {
  let q = s.from('fragrances')
    .select('id, name, concentration, popularity_tier, purchasable')
    .ilike('name', t.name)        // exact (no wildcard) case-insensitive
    .eq('is_active', true);
  if (t.brand) {
    const ids = await brandIds(t.brand);
    if (ids.length) q = q.in('brand_id', ids);
  }
  const { data } = await q;
  const rows = (data ?? []).filter((r) => !JUNK.test(r.name));
  rows.sort((a, b) =>
    Number(b.purchasable) - Number(a.purchasable) ||
    (b.popularity_tier ?? 0) - (a.popularity_tier ?? 0) ||
    (t.conc ? (b.concentration === t.conc ? 1 : 0) - (a.concentration === t.conc ? 1 : 0) : 0) ||
    a.name.length - b.name.length,
  );
  return rows.length ? rows : null;
}

async function main() {
  const misses: string[] = [];
  const resolved: { fragIds: string[]; name: string; celebs: Celeb[] }[] = [];

  for (const t of TARGETS) {
    const rows = await resolve(t);
    const label = `${t.brand ?? '—'} / ${t.name}`;
    if (!rows) {
      misses.push(label);
      console.log(`✗ MISS  ${label}  -> no canonical active row`);
      continue;
    }
    const best = rows[0];
    const twins = rows.length > 1 ? `  (+${rows.length - 1} twin row${rows.length > 2 ? 's' : ''})` : '';
    console.log(`✓ ${label}\n     -> "${best.name}" [t${best.popularity_tier} ${best.concentration ?? '-'}] ${best.id}${twins}`);
    resolved.push({ fragIds: rows.map((r) => r.id), name: best.name, celebs: t.celebs });
  }

  const totalPairs = resolved.reduce((n, r) => n + r.celebs.length * r.fragIds.length, 0);
  console.log(`\n${resolved.length}/${TARGETS.length} bottles resolved · ${totalPairs} celeb pairs (incl. twins) · ${misses.length} misses`);
  if (misses.length) console.log(`Misses: ${misses.join('; ')}`);

  // Evidence audit: surface every celeb that would be written unverified (no
  // source_url) BEFORE any write, so a missing link is never silent. These rows
  // are written verified:false and will NOT show in the app.
  const unverified = resolved.flatMap((r) =>
    r.celebs.filter((c) => !c.source_url?.trim()).map((c) => `${c.name} → ${r.name}`),
  );
  const verifiedPairs = totalPairs - resolved.reduce(
    (n, r) => n + r.celebs.filter((c) => !c.source_url?.trim()).length * r.fragIds.length, 0,
  );
  console.log(`Evidence: ${verifiedPairs} pairs verified (have source_url) · ${unverified.length} celebs UNVERIFIED (no link → verified:false)`);
  if (unverified.length) console.log(`  Needs source_url: ${unverified.join('; ')}`);

  if (!WRITE) {
    console.log('\n(dry run — set WRITE=1 to apply)');
    return;
  }

  // wipe + reseed
  const { error: delErr } = await s.from('fragrance_celebrities').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) { console.error('delete failed:', delErr.message); return; }
  console.log('\nCleared old rows. Writing…');

  let insertedVerified = 0;
  let insertedUnverified = 0;
  for (const r of resolved) {
    for (const fragId of r.fragIds) {
      for (const c of r.celebs) {
        const url = c.source_url?.trim() || null;
        const verified = url !== null;   // evidence rule: no link → not verified
        const { error } = await s.from('fragrance_celebrities').upsert({
          fragrance_id: fragId,
          celebrity_name: c.name,
          category: c.category,
          source: c.source,
          source_url: url,
          verified,
        }, { onConflict: 'fragrance_id,celebrity_name', ignoreDuplicates: true });
        if (error) console.log(`  ERR ${c.name} → ${r.name}: ${error.message}`);
        else if (verified) insertedVerified++;
        else insertedUnverified++;
      }
    }
  }
  console.log(`Wrote ${insertedVerified} verified + ${insertedUnverified} unverified pairs.`);
}

main().catch(console.error);
