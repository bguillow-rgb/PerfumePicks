/**
 * Fragrance of the Day (FOTD) Content Engine
 *
 * Picks a fragrance from the catalog and generates platform-specific social copy
 * for Bluesky, Threads, X/Twitter, Reddit, Instagram, and TikTok.
 *
 * Usage:
 *   npx ts-node scripts/social/fotd-generator.ts
 *   npx ts-node scripts/social/fotd-generator.ts --slug sauvage-dior-edt
 *   npx ts-node scripts/social/fotd-generator.ts --dry-run
 *
 * Env vars required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Untyped (schema-less) client — this script has no generated DB types. */
type UntypedClient = SupabaseClient<any, 'public', 'public', any, any>;
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Fragrance {
  id: string;
  name: string;
  slug: string;
  concentration: string | null;
  fragrance_family: string | null;
  gender: string | null;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  top_accords: string[];
  price_tier: number | null;
  retail_msrp_usd_cents: number | null;
  compliment_score: number | null;
  versatility_score: number | null;
  image_url: string | null;
  dupe_of: string | null;
  brands: { name: string; tier: string | null } | null;
}

interface RetailerLink {
  retailer_name: string;
  url: string;
}

interface FOTDOutput {
  fragrance_slug: string;
  fragrance_name: string;
  brand_name: string;
  generated_at: string;
  posts: {
    bluesky: string;      // 300 chars max
    threads: string;      // 500 chars, hashtags ok
    twitter: string;      // 280 chars
    reddit: string;       // natural comment, no promotion
    instagram: string;    // longer caption
    tiktok_script: string; // 30s spoken word
  };
  affiliate_url: string | null;
  image_url: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? '';

const OUTPUT_DIR = path.join(__dirname, 'data');
const LOG_TABLE = 'social_posts_log';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const slugOverride = args.find((a, i) => args[i - 1] === '--slug') ?? null;
const isDryRun = args.includes('--dry-run');
const outputFile = args.find((a, i) => args[i - 1] === '--output') ?? null;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY is required');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

  // Pick the fragrance
  const fragrance = await pickFragrance(supabase, slugOverride);
  console.log(`Selected: ${fragrance.brands?.name} ${fragrance.name} (${fragrance.slug})`);

  // Get affiliate/retailer links
  const affiliateUrl = await getAffiliateUrl(supabase, fragrance.id);

  // Generate content
  const posts = await generateContent(anthropic, fragrance, affiliateUrl);

  const output: FOTDOutput = {
    fragrance_slug: fragrance.slug,
    fragrance_name: fragrance.name,
    brand_name: fragrance.brands?.name ?? 'Unknown',
    generated_at: new Date().toISOString(),
    posts,
    affiliate_url: affiliateUrl,
    image_url: fragrance.image_url,
  };

  // Output
  if (outputFile) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`Written to ${outputFile}`);
  } else {
    console.log('\n' + JSON.stringify(output, null, 2));
  }

  // Log to Supabase (unless dry run)
  if (!isDryRun) {
    await logPost(supabase, fragrance.slug, 'fotd');
  }

  // Write latest FOTD for other scripts to consume
  const latestPath = path.join(OUTPUT_DIR, 'fotd-latest.json');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(latestPath, JSON.stringify(output, null, 2));
  console.log(`\nLatest FOTD saved to ${latestPath}`);
}

// ─── Fragrance picker ─────────────────────────────────────────────────────────

async function pickFragrance(supabase: UntypedClient, slugOverride: string | null): Promise<Fragrance> {
  if (slugOverride) {
    const { data, error } = await supabase
      .from('fragrances')
      .select('*, brands(name, tier)')
      .eq('slug', slugOverride)
      .single();
    if (error || !data) throw new Error(`Fragrance not found: ${slugOverride}`);
    return data as Fragrance;
  }

  // Get slugs already posted this month to avoid repeats
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: recentPosts } = await supabase
    .from(LOG_TABLE)
    .select('entity_slug')
    .eq('post_type', 'fotd')
    .gte('created_at', monthStart.toISOString());

  const recentSlugs = (recentPosts ?? []).map((p: { entity_slug: string }) => p.entity_slug);

  // Prefer fragrances with retailer links (monetizable), then by versatility
  let query = supabase
    .from('fragrances')
    .select('*, brands(name, tier), fragrance_retailer_links(id)')
    .eq('is_active', true)
    .eq('is_discontinued', false)
    .not('fragrance_family', 'is', null)
    .not('top_accords', 'eq', '{}');

  if (recentSlugs.length > 0) {
    query = query.not('slug', 'in', `(${recentSlugs.map((s: string) => `"${s}"`).join(',')})`);
  }

  // Get a pool and pick randomly from those with affiliate links first
  const { data: pool, error } = await query.limit(200);
  if (error || !pool || pool.length === 0) throw new Error(`No eligible fragrances found: ${error?.message}`);

  // Prefer ones with retailer links and non-null versatility scores
  type FragranceRow = Fragrance & { fragrance_retailer_links: { id: string }[] };
  const withLinks = (pool as FragranceRow[]).filter(f => f.fragrance_retailer_links?.length > 0);
  const candidates = withLinks.length > 5 ? withLinks : (pool as FragranceRow[]);

  // Pick randomly from top candidates
  const idx = Math.floor(Math.random() * Math.min(candidates.length, 50));
  return candidates[idx] as Fragrance;
}

// ─── Affiliate URL ────────────────────────────────────────────────────────────

async function getAffiliateUrl(supabase: UntypedClient, fragranceId: string): Promise<string | null> {
  const { data } = await supabase
    .from('fragrance_retailer_links')
    .select('retailer_name, url')
    .eq('fragrance_id', fragranceId)
    .limit(1)
    .single();

  return (data as RetailerLink | null)?.url ?? null;
}

// ─── Content generation ───────────────────────────────────────────────────────

async function generateContent(
  anthropic: Anthropic,
  frag: Fragrance,
  affiliateUrl: string | null,
): Promise<FOTDOutput['posts']> {
  const brandName = frag.brands?.name ?? 'Unknown';
  const tier = frag.brands?.tier ?? 'designer';
  const priceTier = frag.price_tier;
  const priceDesc = priceTier === 1 ? 'budget' : priceTier === 2 ? 'affordable' : priceTier === 3 ? 'mid-range' : priceTier === 4 ? 'expensive' : 'ultra-luxury';
  const accords = frag.top_accords.slice(0, 5).join(', ');
  const isDupe = !!frag.dupe_of;

  const prompt = `You are the Perfume Picks social account — a real fragrance enthusiast who loves helping people find scents they'll actually enjoy.

Today's fragrance: ${brandName} ${frag.name} (${frag.concentration ?? 'fragrance'})
Family: ${frag.fragrance_family ?? 'unknown'}
Gender: ${frag.gender ?? 'unisex'}
Top accords: ${accords}
Top notes: ${frag.top_notes.slice(0, 4).join(', ')}
Brand tier: ${tier}
Price tier: ${priceDesc}
Compliment score: ${frag.compliment_score ? Math.round(frag.compliment_score * 100) + '/100' : 'n/a'}
Is a dupe: ${isDupe ? 'yes' : 'no'}

Generate social posts in our authentic voice. Voice rules:
- Sound like a real fragrance person typing a thought, not a brand announcement
- Specific and opinionated — have a real take
- No reviewer vocabulary: don't say "top notes", "drydown", "sillage", "opens with"
- No luxury autopilot: not "sophisticated", "refined", "elegant"
- No marketing copy: not "signature scent", "discover your scent", "perfect for"
- No em dashes
- Personal and conversational — like texting a friend
- Reference actual experiences or what the scent reminds you of

Return a JSON object with exactly these keys:
{
  "bluesky": "...",    // Under 300 chars. Can reference Perfume Picks app naturally if it fits.
  "threads": "...",    // Under 500 chars. 1-2 relevant hashtags at end if they fit naturally.
  "twitter": "...",    // Under 280 chars.
  "reddit": "...",     // 2-4 sentences. Natural community voice. Zero promotion. Genuinely helpful take on this fragrance.
  "instagram": "...",  // 100-200 words. More personal/storytelling. 3-5 hashtags at end.
  "tiktok_script": "..." // 30-second spoken script. Hook in first line. Direct sentences. No reviewing format.
}

Make each platform feel native to that platform. The reddit post should read like a regular community member sharing a thought. The TikTok script should be punchy and hook immediately.${affiliateUrl ? '\n\nThere is an affiliate shopping link available for this fragrance. The instagram caption can mention checking the link in bio.' : ''}`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not parse JSON from Claude response:\n${text}`);

  const parsed = JSON.parse(jsonMatch[0]);

  // Enforce character limits
  if (parsed.bluesky?.length > 300) {
    parsed.bluesky = parsed.bluesky.slice(0, 297) + '...';
  }
  if (parsed.twitter?.length > 280) {
    parsed.twitter = parsed.twitter.slice(0, 277) + '...';
  }

  return parsed;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

async function logPost(supabase: UntypedClient, entitySlug: string, postType: string) {
  const { error } = await supabase.from(LOG_TABLE).insert({
    entity_slug: entitySlug,
    post_type: postType,
    platform: 'multi',
    created_at: new Date().toISOString(),
  });
  if (error) {
    // Table might not exist yet — warn but don't fail
    console.warn(`Could not log post (table may not exist yet): ${error.message}`);
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
