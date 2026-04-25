/**
 * Seeds ONLY the new expansion cigars into Supabase (skips existing).
 * Run: source .env.local && SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY npx tsx scripts/seed-expansion.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Run with: source .env.local && SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY npx tsx scripts/seed-expansion.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const filePath = path.join(__dirname, 'data', 'cigars-expansion.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const cigars = JSON.parse(raw);

  console.log(`Loaded ${cigars.length} new cigars from expansion file`);

  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < cigars.length; i += BATCH_SIZE) {
    const batch = cigars.slice(i, i + BATCH_SIZE).map((c: any) => ({
      brand: c.brand,
      name: c.name,
      vitola: c.vitola || null,
      strength: c.strength,
      body: c.body,
      price_tier: c.price_tier,
      wrapper: c.wrapper || null,
      binder: c.binder || null,
      filler: c.filler || [],
      origin: c.origin || null,
      flavors: c.flavors || [],
      description: c.description || null,
      image_url: c.image_url || null,
    }));

    const { data, error } = await supabase.from('cigars').insert(batch).select('id');

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += (data?.length || 0);
    }

    process.stdout.write(`\rProgress: ${Math.min(i + BATCH_SIZE, cigars.length)}/${cigars.length}`);
  }

  console.log(`\n\nDone!`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Errors: ${errors}`);

  // Verify total
  const { count } = await supabase.from('cigars').select('*', { count: 'exact', head: true });
  console.log(`  Total cigars in DB: ${count}`);
}

main().catch(console.error);
