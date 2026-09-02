/**
 * fix-gender-labels — reclassify fragrances the retailer feeds dumped into
 * "unisex".
 *
 * THE PROBLEM (2026-09-01): the audience preference shipped and a Men's user
 * still saw Sunflowers by Elizabeth Arden. The filter was right — the LABEL was
 * wrong: Sunflowers is tagged `unisex`. 6,190 of 10,371 active bottles (60%)
 * carry that tag, which is implausible for real fragrance data; Elizabeth Arden
 * alone is 18 unisex / 18 feminine / 1 masculine. The CJ/Shopify feeds appear to
 * default to "unisex" whenever the gender column is blank, so "unisex" currently
 * means BOTH "genuinely shared" and "unknown" — and the filter cannot tell them
 * apart.
 *
 * This asks the model to separate those two cases. It only ever looks at rows
 * ALREADY tagged unisex, so a correct masculine/feminine label can never be
 * overwritten, and it only writes when the model is confident the bottle is
 * actually marketed to one side.
 *
 * GUARDRAIL — genuinely unisex fragrances must stay unisex. Niche and modern
 * releases (Baccarat Rouge 540, Santal 33, Le Labo, Byredo, most Xerjoff) really
 * are shared, and flipping those would be a worse bug than the one we are
 * fixing: it would hide bottles from half the users who legitimately wear them.
 * The prompt is explicit that "unisex" is the correct answer whenever there is
 * genuine doubt, and low-confidence rows are skipped.
 *
 * Run:  npx tsx scripts/fix-gender-labels.ts                 (dry-run, all)
 *       LIMIT=200 npx tsx scripts/fix-gender-labels.ts       (sample)
 *       ELIGIBLE_ONLY=1 npx tsx scripts/fix-gender-labels.ts (picker pool only)
 *       npx tsx scripts/fix-gender-labels.ts --commit
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: '.env.local' });

const COMMIT = process.argv.includes('--commit');
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
const ELIGIBLE_ONLY = !!process.env.ELIGIBLE_ONLY;
const MODEL = 'claude-haiku-4-5-20251001';
const AK = process.env.ANTHROPIC_API_KEY!;
const sb = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
if (!AK) { console.error('missing ANTHROPIC_API_KEY'); process.exit(1); }

type Row = { id: string; name: string; gender: string | null; dna_eligible: boolean; brands: { name: string } | null };

const SYSTEM = `You label how a fragrance is MARKETED, for an app where users choose to see men's, women's, or everything.

Return STRICT JSON array, no markdown, same length and order as the input:
{ "idx": <echo input index>, "gender": "masculine"|"feminine"|"unisex", "confidence": "high"|"medium"|"low" }

Every input is currently tagged "unisex" — but that tag is unreliable, because the product feed used it as a default whenever the field was blank. Your job is to say what the house ACTUALLY markets it as.

Rules:
- "feminine" = sold as a women's fragrance (Elizabeth Arden Sunflowers, Chanel Coco Mademoiselle, Britney Spears Fantasy, most Carolina Herrera Good Girl flankers).
- "masculine" = sold as a men's fragrance (Dior Sauvage, Bleu de Chanel, JPG Le Male).
- "unisex" = GENUINELY shared, which is common in niche: Baccarat Rouge 540, Santal 33, Le Labo, Byredo, Diptyque, most Xerjoff/Amouage/Nishane, most ouds, and anything explicitly marketed "for all".
- When in genuine doubt, answer "unisex" with LOW confidence. Wrongly narrowing a shared fragrance HIDES it from half our users, which is worse than leaving a mislabel in place.
- A "for women"/"for men"/"pour homme"/"pour femme" phrase in the name is decisive — use it.
- Do not guess from the brand alone: designer houses sell both.`;

async function classify(batch: { brand: string; name: string }[]): Promise<any[]> {
  const msg = 'Fragrances (all currently tagged unisex):\n' + batch.map((b, i) => `${i}. ${b.brand} — ${b.name}`).join('\n');
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': AK, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: SYSTEM, messages: [{ role: 'user', content: msg }] }),
      });
      if (!res.ok) { await new Promise((r) => setTimeout(r, 1200 * (a + 1))); continue; }
      const d = await res.json();
      const t = d.content?.[0]?.text ?? '[]';
      return JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
    } catch { await new Promise((r) => setTimeout(r, 1200 * (a + 1))); }
  }
  return [];
}

async function main() {
  console.log(`Mode: ${COMMIT ? 'APPLY' : 'DRY-RUN'}${ELIGIBLE_ONLY ? ' [picker pool only]' : ''}${LIMIT ? ` [LIMIT ${LIMIT}]` : ''}\n`);

  const rows: Row[] = [];
  for (let off = 0; ; off += 1000) {
    let qb = sb.from('fragrances')
      .select('id, name, gender, dna_eligible, brands(name)')
      .eq('is_active', true).eq('gender', 'unisex');
    if (ELIGIBLE_ONLY) qb = qb.eq('dna_eligible', true);
    const { data, error } = await qb.range(off, off + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  const targets = LIMIT ? rows.slice(0, LIMIT) : rows;
  console.log(`unisex-tagged rows: ${rows.length} → classifying ${targets.length}\n`);

  const changes: { row: Row; to: string; conf: string }[] = [];
  let keptUnisex = 0, lowConf = 0;
  for (let i = 0; i < targets.length; i += 25) {
    const batch = targets.slice(i, i + 25);
    const out = await classify(batch.map((r) => ({ brand: r.brands?.name ?? '', name: r.name })));
    const byIdx = new Map(out.map((o: any) => [o.idx, o]));
    batch.forEach((r, j) => {
      const o: any = byIdx.get(j);
      if (!o) return;
      if (o.confidence === 'low') { lowConf++; return; }
      if (o.gender === 'unisex') { keptUnisex++; return; }
      if (o.gender === 'masculine' || o.gender === 'feminine') changes.push({ row: r, to: o.gender, conf: o.confidence });
    });
    if ((i / 25) % 10 === 0) console.log(`  ${Math.min(i + 25, targets.length)}/${targets.length} → ${changes.length} relabels`);
  }

  const byTo: Record<string, number> = {};
  changes.forEach((c) => { byTo[c.to] = (byTo[c.to] ?? 0) + 1; });
  console.log(`\n── RELABEL: ${changes.length} of ${targets.length} ──`);
  console.log('  to:', JSON.stringify(byTo), `| kept unisex: ${keptUnisex} | low-confidence skipped: ${lowConf}`);
  console.log('\nsample (25):');
  changes.slice(0, 25).forEach((c) => console.log(`  unisex → ${c.to.padEnd(9)} ${c.conf.padEnd(6)} ${c.row.brands?.name} — ${c.row.name}`));

  if (!COMMIT) { console.log(`\n(dry-run — re-run with --commit to write ${changes.length} rows)`); return; }
  if (!changes.length) return;

  const rb = path.join(process.cwd(), 'scripts/data/rollback-gender-labels.json');
  fs.writeFileSync(rb, JSON.stringify({ at: new Date().toISOString(), rows: changes.map((c) => ({ id: c.row.id, gender: c.row.gender })) }, null, 2));
  console.log(`\nrollback → ${rb}`);
  let done = 0;
  for (const c of changes) {
    const { error } = await sb.from('fragrances').update({ gender: c.to }).eq('id', c.row.id);
    if (error) throw new Error(`update ${c.row.id}: ${error.message}`);
    if (++done % 200 === 0) console.log(`  wrote ${done}/${changes.length}`);
  }
  console.log(`\n✓ relabelled ${done}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
