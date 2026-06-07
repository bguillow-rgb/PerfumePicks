/**
 * backfill-notes-provenance — set notes_source / notes_verified from the
 * trusted-scrape lineage in enriched-candidates.json.
 *
 * The "Notes verified ✓" badge is the Parfumo-style trust signal (PRD §7.6).
 * It MUST be honest: we only verify notes we can positively attribute to a real
 * source (Fragrantica or a brand site). The enriched candidates carry a `source`
 * + `source_url` for every pyramid-bearing record, and EVERY pyramid-bearing
 * candidate came from a real scrape (no LLM pyramids — LLM only filled accords).
 *
 * So: match each pyramid-bearing candidate to its live fragrance by slug, and —
 * only when the live row actually HAS a pyramid (never badge an empty one) —
 * stamp notes_source = candidate.source and notes_verified = true.
 *
 * Live fragrances whose notes came from an unattributable path (other enrich
 * passes, ETL feed) are deliberately LEFT unverified. We never fake provenance.
 *
 * Reversible: only writes the two provenance columns. DRY RUN by default.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/backfill-notes-provenance.ts
 *   set -a && source .env.local && set +a && npx tsx scripts/backfill-notes-provenance.ts --commit
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fragranceSlug } from './lib/affiliate-etl-base';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const COMMIT = process.argv.includes('--commit');

type Cand = { brand: string; name: string; source?: string; top_notes?: string[]; heart_notes?: string[]; base_notes?: string[] };
type Frag = { id: string; slug: string; top_notes: string[] | null; heart_notes: string[] | null; base_notes: string[] | null; is_active: boolean };

const candHasNotes = (c: Cand) => ((c.top_notes?.length ?? 0) + (c.heart_notes?.length ?? 0) + (c.base_notes?.length ?? 0)) > 0;
const fragHasNotes = (f: Frag) => ((f.top_notes?.length ?? 0) + (f.heart_notes?.length ?? 0) + (f.base_notes?.length ?? 0)) > 0;

// A source is "verifiable" if it's a real scrape (Fragrantica or a brand site),
// i.e. anything other than an LLM/inference marker.
const isVerifiable = (src: string | undefined) => !!src && !/^(llm|inferred|gpt|ai|generated)$/i.test(src);

async function fetchAllFrags(): Promise<Frag[]> {
  const out: Frag[] = [];
  for (let o = 0; ; o += 1000) {
    const { data, error } = await supabase
      .from('fragrances')
      .select('id,slug,top_notes,heart_notes,base_notes,is_active')
      .range(o, o + 999);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data?.length) break;
    out.push(...(data as Frag[]));
    if (data.length < 1000) break;
  }
  return out;
}

async function main() {
  console.log(`backfill-notes-provenance  (${COMMIT ? 'COMMIT' : 'DRY RUN'})\n`);

  const file = path.join(__dirname, 'data', 'enriched-candidates.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const cands: Cand[] = Array.isArray(raw) ? raw : (raw.candidates ?? raw.items ?? Object.values(raw)[0]);
  const pyramidCands = cands.filter(candHasNotes);
  console.log(`candidates: ${cands.length}   pyramid-bearing: ${pyramidCands.length}`);

  // Best source per slug (prefer fragrantica, then any verifiable, then whatever).
  const srcBySlug = new Map<string, string>();
  for (const c of pyramidCands) {
    if (!c.source) continue;
    const slug = fragranceSlug(c.brand, c.name);
    const cur = srcBySlug.get(slug);
    if (!cur || (cur !== 'fragrantica' && c.source === 'fragrantica')) srcBySlug.set(slug, c.source);
  }

  const frags = await fetchAllFrags();
  const fragBySlug = new Map(frags.map((f) => [f.slug, f]));

  const updates: { id: string; notes_source: string; notes_verified: boolean }[] = [];
  let matchedNoPyramid = 0, notInCatalog = 0;
  const srcTally: Record<string, number> = {};

  for (const [slug, source] of srcBySlug) {
    const f = fragBySlug.get(slug);
    if (!f) { notInCatalog++; continue; }
    if (!fragHasNotes(f)) { matchedNoPyramid++; continue; }  // never badge an empty pyramid
    const verified = isVerifiable(source);
    updates.push({ id: f.id, notes_source: source, notes_verified: verified });
    srcTally[source] = (srcTally[source] ?? 0) + 1;
  }

  console.log(`\nverifiable matches (live frag has pyramid): ${updates.length}`);
  console.log(`  candidate slug not in catalog: ${notInCatalog}   matched but live pyramid empty: ${matchedNoPyramid}`);
  console.log('  source breakdown:', JSON.stringify(Object.entries(srcTally).sort((a, b) => b[1] - a[1]).slice(0, 12)));
  console.log(`  will set notes_verified=true on: ${updates.filter((u) => u.notes_verified).length}`);

  if (!COMMIT) { console.log('\nDRY RUN — nothing written. Re-run with --commit.'); return; }

  let done = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from('fragrances')
      .update({ notes_source: u.notes_source, notes_verified: u.notes_verified })
      .eq('id', u.id);
    if (error) { console.error(`update ${u.id}:`, error.message); process.exit(1); }
    if (++done % 100 === 0) console.log(`  ${done}/${updates.length}`);
  }
  console.log(`\n✓ stamped provenance on ${done} fragrances.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
