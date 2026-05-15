/**
 * Seed celebrity associations into fragrance_celebrities.
 *
 * Run: npx ts-node scripts/seed-celebrity-associations.ts
 *
 * Looks up each fragrance by name (ILIKE) in the database, then inserts
 * the celebrity association. Skips if the fragrance isn't found.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Well-sourced celebrity fragrance associations.
// Each entry: [fragrance_name_search, celebrity_name, category, source]
const ASSOCIATIONS: [string, string, string, string][] = [
  // Iconic / historical
  ['Chanel No. 5', 'Marilyn Monroe', 'actor', 'interview'],
  ['Chanel No. 5', 'Nicole Kidman', 'actor', 'brand_ambassador'],
  ['Chanel No. 5', 'Brad Pitt', 'actor', 'brand_ambassador'],
  ['Shalimar', 'Princess Diana', 'royal', 'biography'],

  // Modern celebrity favorites
  ['Baccarat Rouge 540', 'Rihanna', 'musician', 'interview'],
  ['Baccarat Rouge 540', 'Kim Kardashian', 'influencer', 'social_media'],
  ['Love Don\'t Be Shy', 'Rihanna', 'musician', 'interview'],
  ['Black Orchid', 'Tom Ford', 'designer', 'brand_founder'],
  ['Bleu de Chanel', 'Timothée Chalamet', 'actor', 'brand_ambassador'],
  ['Sauvage', 'Johnny Depp', 'actor', 'brand_ambassador'],
  ['Miss Dior', 'Natalie Portman', 'actor', 'brand_ambassador'],
  ['J\'adore', 'Charlize Theron', 'actor', 'brand_ambassador'],

  // Niche favorites
  ['Aventus', 'David Beckham', 'athlete', 'interview'],
  ['Lost Cherry', 'Hailey Bieber', 'model', 'interview'],
  ['Tobacco Vanille', 'Drake', 'musician', 'interview'],
  ['Oud Wood', 'Ryan Reynolds', 'actor', 'interview'],
  ['Gypsy Water', 'Rosie Huntington-Whiteley', 'model', 'interview'],
  ['Santal 33', 'Justin Bieber', 'musician', 'paparazzi'],
  ['Santal 33', 'Ryan Gosling', 'actor', 'interview'],
  ['Another 13', 'Beyoncé', 'musician', 'interview'],

  // Royal / political
  ['Green Irish Tweed', 'Prince Charles', 'royal', 'biography'],
  ['Penhaligon\'s Blenheim Bouquet', 'Prince Philip', 'royal', 'biography'],

  // Classic men's
  ['Terre d\'Hermès', 'George Clooney', 'actor', 'interview'],
  ['Acqua di Gio', 'Chris Hemsworth', 'actor', 'interview'],

  // Women's classics
  ['Coco Mademoiselle', 'Keira Knightley', 'actor', 'brand_ambassador'],
  ['La Vie Est Belle', 'Julia Roberts', 'actor', 'brand_ambassador'],
  ['Black Opium', 'Zoe Kravitz', 'actor', 'brand_ambassador'],
  ['Flower Bomb', 'Ariana Grande', 'musician', 'interview'],

  // Designer/creative
  ['Portrait of a Lady', 'Anna Wintour', 'fashion', 'interview'],
  ['Carnal Flower', 'Diane Kruger', 'actor', 'interview'],

  // Athletes
  ['Light Blue', 'David Gandy', 'model', 'brand_ambassador'],
  ['Invictus', 'Nick Youngquest', 'athlete', 'brand_ambassador'],

  // Musicians
  ['Angel', 'Lady Gaga', 'musician', 'interview'],
  ['Alien', 'Willow Smith', 'musician', 'interview'],

  // Modern influencer picks
  ['Delina', 'Sofia Richie', 'influencer', 'social_media'],
  ['BR540 Extrait', 'Ariana Grande', 'musician', 'interview'],
  ['Cloud', 'Ariana Grande', 'musician', 'brand_founder'],
  ['Gucci Bloom', 'Florence Welch', 'musician', 'brand_ambassador'],
  ['Gucci Guilty', 'Jared Leto', 'actor', 'brand_ambassador'],
];

async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const [fragranceName, celebrity, category, source] of ASSOCIATIONS) {
    // Fuzzy search for the fragrance
    const { data: matches } = await supabase
      .from('fragrances')
      .select('id')
      .ilike('name', `%${fragranceName}%`)
      .eq('is_active', true)
      .limit(1);

    if (!matches?.length) {
      console.log(`  SKIP: "${fragranceName}" not found in catalog`);
      skipped++;
      continue;
    }

    const fragranceId = matches[0].id;

    const { error } = await supabase.from('fragrance_celebrities').upsert({
      fragrance_id: fragranceId,
      celebrity_name: celebrity,
      category,
      source,
      verified: true,
    }, {
      onConflict: 'fragrance_id,celebrity_name',
      ignoreDuplicates: true,
    });

    if (error) {
      console.log(`  ERROR: ${celebrity} → ${fragranceName}: ${error.message}`);
    } else {
      console.log(`  ✓ ${celebrity} → ${fragranceName}`);
      inserted++;
    }
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped (not in catalog).`);
}

main().catch(console.error);
