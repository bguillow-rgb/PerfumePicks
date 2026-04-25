/**
 * Catalog expansion via LLM knowledge.
 *
 * Retail-site scraping is unreliable at scale — CI is behind Cloudflare
 * Turnstile, Famous Smoke has a JS-rendered product grid, and each retailer
 * has its own URL scheme. Halfwheel editorial covers ~300 distinct cigar
 * lines, which is high-quality but not sufficient on its own to hit the
 * 6,500 target.
 *
 * This script uses Claude Sonnet 4.5 to generate structured cigar-catalog
 * data for a list of brands we want expanded. The model's training data
 * includes cigar-industry reporting through early 2025, so we get real
 * wrapper/binder/filler/origin values for well-documented brands. Output
 * matches the same candidate-row schema as merge-scraped-sources.ts so it
 * flows into the same enrichment + insert pipeline.
 *
 * For each brand the model returns every known line it can recall, with all
 * vitolas per line, plus the subjective fields (strength/body/price_tier/
 * flavors) so we skip the separate enrichment pass.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/expand-catalog-llm.ts
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/expand-catalog-llm.ts --brands "Warped,Foundation,Crowned Heads"
 *   npx tsx scripts/expand-catalog-llm.ts --resume
 *
 * Quality guard: rows with empty wrapper AND empty origin are dropped in the
 * insert step. Rows with no vitolas are skipped here.
 *
 * Cost: roughly ~$0.05-0.10 per brand (3-4k output tokens). Budget ~$10
 * for the full 150-brand list below.
 */

import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_PATH = path.join(__dirname, 'data', 'llm-expansion.json');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY.');
  process.exit(1);
}

const MODEL = 'claude-sonnet-4-5';
const MAX_RETRIES = 3;

const FLAVOR_VOCAB = [
  'cream', 'vanilla', 'caramel', 'honey', 'chocolate', 'cocoa',
  'earth', 'leather', 'cedar', 'wood', 'oak',
  'pepper', 'spice', 'cinnamon', 'mineral',
  'nut', 'almond', 'peanut', 'cashew',
  'cherry', 'citrus', 'fruit', 'raisin', 'plum',
  'coffee', 'espresso', 'toast', 'bread',
  'tobacco', 'hay', 'grass', 'floral', 'tea',
  'barnyard', 'smoke', 'char',
];

// Initial brand list — prioritizes coverage gaps we identified. You can pass
// --brands "A,B,C" to override. Duplicates in the existing catalog are
// handled downstream by the merge step.
const DEFAULT_BRANDS = [
  // Big boutiques
  'Crowned Heads', 'Warped', 'Foundation Cigar Co', 'Dunbarton Trading',
  'RoMa Craft Tobac', 'Aganorsa Leaf', 'Casa Fernández', 'Illusione',
  'Espinosa', 'Room 101', 'Tatuaje', 'L\'Atelier',
  'Black Label Trading Co', 'Micallef', 'ADVentura', 'Fratello',
  'Ezra Zion', 'La Barba', 'Gurkha', 'Bombay Tobak',
  'Cornelius and Anthony', 'HVC', 'Quesada', 'PDR',
  // Mass-market premium non-core lines
  'Padron', 'Arturo Fuente', 'Oliva', 'My Father', 'Davidoff',
  'Ashton', 'CAO', 'Rocky Patel', 'Alec Bradley', 'Perdomo',
  'Drew Estate', 'Liga Privada', 'Joya de Nicaragua', 'Camacho',
  'AJ Fernandez', 'EP Carrillo', 'La Flor Dominicana', 'La Aroma de Cuba',
  'La Gloria Cubana', 'Macanudo', 'Montecristo', 'Romeo y Julieta',
  'H. Upmann', 'Punch', 'Hoyo de Monterrey',
  // Newer / hyped
  'Plasencia', 'Caldwell', 'Viaje', 'Sobremesa',
  'Herrera Estelí', 'Nat Sherman', 'Ferio Tego', 'Nomad',
  'Principle', 'Asylum', 'Villiger', 'Kristoff',
  'La Palina', 'Matilde', 'Leaf by Oscar', 'Mombacho',
  'Regius', 'Gran Habano', 'Casa Magna', 'Cavalier Genève',
  'Le Careme', 'Tabernacle', 'Wise Man', 'El Gueguense',
  'Charter Oak', 'Highclere Castle', 'Sobremesa Brûlée',
  // Cuban (for the include-cubans toggle)
  'Cohiba', 'Montecristo (Cuban)', 'Partagás', 'Bolívar',
  'Ramón Allones', 'Trinidad (Cuban)', 'Vegas Robaina',
];

interface CigarRow {
  brand: string;
  line: string;
  name: string;
  vitola: string | null;
  wrapper: string | null;
  binder: string | null;
  filler: string[];
  origin: string | null;
  strength: number | null;
  body: number | null;
  price_tier: number | null;
  // 1=deep-cut/obscure, 5=iconic. Drives the "adventure" quiz scoring.
  popularity_tier: number | null;
  flavors: string[];
  description: string | null;
  image_url: string | null;
  price_usd_cents: number | null;
  sources: string[];
}

function brandKey(brand: string): string {
  return brand.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Parse JSON that might be truncated mid-array. Claude sometimes hits
 * max_tokens mid-object, leaving us with `[{...}, {...}, {par` and a hard
 * fail if we JSON.parse directly. This function:
 *   1. Tries a strict parse first (happy path).
 *   2. On failure, walks the string from the end back to the last `}` that
 *      closed a top-level object, then wraps `[..., {...}]` and re-parses.
 * Worst case we still throw — caller's retry logic kicks in — but on
 * truncation we recover most of the brand's rows.
 */
function tolerantParseJsonArray(text: string): unknown[] {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    // Salvage: find the last `},` that separated two complete objects.
    // Keep walking inward until JSON.parse accepts the truncated array.
    const stripped = text.trimEnd().replace(/,?\s*$/, '');
    for (let cut = stripped.length; cut > 0; cut--) {
      if (stripped[cut - 1] !== '}') continue;
      const candidate = stripped.slice(0, cut) + ']';
      try {
        const v = JSON.parse(candidate);
        if (Array.isArray(v)) return v;
      } catch { /* keep walking */ }
    }
  }
  return [];
}

async function generateForBrand(brand: string, mode: 'breadth' | 'deepen' = 'breadth'): Promise<CigarRow[]> {
  const scopeInstruction = mode === 'deepen'
    ? `IMPORTANT: Focus on limited editions, regional releases, store exclusives, annual/anniversary releases, collaboration blends, and less-common line variants. Skip the core lines (Classic, Original, etc.) since those are already in our catalog. Include as many vitolas per limited line as you can recall.`
    : `Include every core line and every vitola per line you can recall.`;

  const system = `You are a cigar industry expert. Given a brand name, return a JSON array of every cigar line you know from that brand, with every vitola (size) available in each line.

${scopeInstruction}

Schema for each row:
{
  "brand": string,                           // exact brand name
  "line": string,                            // line name, e.g. "1964 Anniversary Series"
  "vitola": string,                          // vitola name, e.g. "Torpedo", "No. 4"
  "wrapper": string,                         // wrapper leaf origin/varietal, e.g. "Ecuadorian Habano"
  "binder": string,
  "filler": string[],                        // array of filler origins, e.g. ["Nicaragua","Dominican"]
  "origin": string,                          // country of manufacture
  "strength": 1-5,                           // 1=mild, 5=full
  "body": 1-5,                               // 1=light, 5=full-bodied
  "price_tier": 1-5,                         // 1=<$5, 2=$5-7.99, 3=$8-11.99, 4=$12-19.99, 5=$20+
  "popularity_tier": 1-5,                    // how well-known this cigar is, by this rubric:
                                             //   5 — Iconic classic (Padrón 1964, Opus X, Cohiba Behike, Davidoff Winston Churchill)
                                             //   4 — Well-known mainstream (Liga Privada No. 9, My Father, Oliva Serie V)
                                             //   3 — Respected boutique (Crowned Heads Four Kicks, Warped Futuro)
                                             //   2 — Niche/store-pick (limited edition, regional exclusive, small-batch)
                                             //   1 — Deep cut/obscure (discontinued, private-label, very limited release)
  "flavors": string[],                       // 3-6 tags, lowercase, from this vocabulary ONLY:
                                             //   ${FLAVOR_VOCAB.join(', ')}
  "description": string                      // 1-2 sentence summary
}

Rules:
- Return a JSON array. NO markdown fences. NO prose.
- Only include cigars you are confident exist. Don't hallucinate.
- If a line has 6 vitolas, return 6 rows for that line (one per vitola).
- Skip lines that have been discontinued for more than 5 years.
- Be conservative on strength/body: most premium cigars sit at 3-4.`;

  const user = `Brand: "${brand}"

Return the array.`;

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          // 16k gives room for brands with deep catalogs (Drew Estate,
          // Arturo Fuente). Smaller values caused mid-array truncation
          // and lost the entire brand's output on parse failure.
          max_tokens: 16000,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const payload = await res.json();
      const text = payload?.content?.[0]?.text ?? '';
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const parsed = tolerantParseJsonArray(cleaned);
      if (!Array.isArray(parsed)) throw new Error('not an array');

      // Normalize + validate each row. Anything missing wrapper AND origin is dropped
      // (that's the same quality gate the insert step applies).
      return parsed
        .filter((r: any) => r.brand && r.line && r.vitola && (r.wrapper || r.origin))
        .map((r: any) => ({
          brand: String(r.brand),
          line: String(r.line),
          name: `${r.brand} ${r.line}`.trim(),
          vitola: r.vitola ? String(r.vitola) : null,
          wrapper: r.wrapper ? String(r.wrapper) : null,
          binder: r.binder ? String(r.binder) : null,
          filler: Array.isArray(r.filler) ? r.filler.map(String) : [],
          origin: r.origin ? String(r.origin) : null,
          strength: Number.isInteger(r.strength) && r.strength >= 1 && r.strength <= 5 ? r.strength : null,
          body: Number.isInteger(r.body) && r.body >= 1 && r.body <= 5 ? r.body : null,
          price_tier: Number.isInteger(r.price_tier) && r.price_tier >= 1 && r.price_tier <= 5 ? r.price_tier : null,
          popularity_tier: Number.isInteger(r.popularity_tier) && r.popularity_tier >= 1 && r.popularity_tier <= 5 ? r.popularity_tier : null,
          flavors: Array.isArray(r.flavors)
            ? r.flavors.filter((f: string) => FLAVOR_VOCAB.includes(f)).slice(0, 6)
            : [],
          description: r.description ? String(r.description).slice(0, 600) : null,
          image_url: null,                 // LLM doesn't produce images; filled by separate image scraper if desired
          price_usd_cents: null,           // we rely on price_tier instead
          sources: [`llm:${MODEL}`],
        }));
    } catch (e) {
      lastErr = e;
      console.warn(`  attempt ${attempt}/${MAX_RETRIES} failed:`, (e as Error).message);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  console.error(`  giving up on ${brand}:`, lastErr);
  return [];
}

async function main() {
  const args = process.argv.slice(2);
  const brandsArg = args.indexOf('--brands');
  // --deepen flag: prompt Claude for limited editions/regionals/anniversaries
  // only, skipping the core lines we already have. Used as a second pass on
  // big-catalog brands once the breadth pass is done. Deepen output is
  // allowed to collide with breadth output on key; merge step dedupes later.
  const deepen = args.includes('--deepen');
  const mode: 'breadth' | 'deepen' = deepen ? 'deepen' : 'breadth';
  // ALWAYS load the existing file if it exists. Previously this was gated on
  // --resume, but in deepen mode the intent is "revisit brands" (not "start
  // from scratch"), so opting out of --resume would nuke the existing rows
  // from previous runs. A prior chained invocation that forgot --resume on
  // the deepen step wiped ~3,888 good rows. The new safe behavior: always
  // preserve existing rows; the --resume flag now only controls whether to
  // skip already-done brands.
  const resume = args.includes('--resume') || deepen;
  const brands = brandsArg >= 0
    ? args[brandsArg + 1].split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_BRANDS;

  const existing: CigarRow[] = fs.existsSync(OUTPUT_PATH)
    ? JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'))
    : [];

  // Safety net: if the existing file has rows, refuse to proceed unless we
  // successfully generate at least one new row OR fully complete the run.
  // This prevents a chain of API failures (e.g. credit-out) from overwriting
  // a populated file with [] as happened in the previous run.
  const hadExistingRows = existing.length > 0;
  // In deepen mode we do NOT skip brands already present — the prompt is
  // explicitly asking for DIFFERENT lines (limited editions/regionals). In
  // breadth mode we skip to avoid retrying brands already covered.
  const doneBrands = deepen ? new Set<string>() : new Set(existing.map((r) => brandKey(r.brand)));
  console.log(`mode=${mode} brands=${brands.length} existing_rows=${existing.length} already_done=${doneBrands.size}`);

  const all: CigarRow[] = [...existing];
  let bidx = 0;
  let newRowsThisRun = 0;
  for (const brand of brands) {
    bidx++;
    if (doneBrands.has(brandKey(brand))) {
      console.log(`[${bidx}/${brands.length}] ${brand} (skip, already done)`);
      continue;
    }
    process.stdout.write(`[${bidx}/${brands.length}] ${brand}${deepen ? ' (deepen)' : ''}... `);
    const rows = await generateForBrand(brand, mode);
    console.log(`${rows.length} rows`);
    all.push(...rows);
    newRowsThisRun += rows.length;
    // Flush guard: never overwrite a populated file with a shorter one than
    // we loaded. The only case this triggers is when every API call in the
    // run has failed (credit-out, network, etc.) — in which case we keep
    // the previous data untouched until the operator resolves the upstream
    // issue and re-runs.
    if (all.length < existing.length) {
      console.warn(`  refusing to write: would shrink file from ${existing.length} to ${all.length}`);
      continue;
    }
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(all, null, 2));
  }

  if (hadExistingRows && newRowsThisRun === 0) {
    console.warn(`no new rows generated; preserving existing ${existing.length} rows`);
  } else {
    console.log(`\nwrote ${all.length} rows to ${OUTPUT_PATH}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
