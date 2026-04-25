/**
 * Compares cigars.json against what's in Supabase and inserts any missing entries.
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function makeKey(c: any): string {
  return `${c.brand}|||${c.name}|||${c.vitola ?? ''}`.toLowerCase();
}

async function main() {
  // Load full file
  const filePath = path.join(__dirname, 'data', 'cigars.json');
  const allCigars = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`File has ${allCigars.length} cigars`);

  // Fetch all existing from DB (paginated)
  const existingKeys = new Set<string>();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await supabase.from('cigars').select('brand, name, vitola').range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const c of data) existingKeys.add(makeKey(c));
    from += PAGE;
    if (data.length < PAGE) break;
  }
  console.log(`DB has ${existingKeys.size} cigars`);

  // Find missing
  const missing = allCigars.filter((c: any) => !existingKeys.has(makeKey(c)));
  console.log(`Missing from DB: ${missing.length}`);

  if (missing.length === 0) {
    console.log('Nothing to insert!');
    return;
  }

  // Insert in batches
  const BATCH = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH).map((c: any) => ({
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
      console.error(`Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += (data?.length || 0);
    }
    process.stdout.write(`\rProgress: ${Math.min(i + BATCH, missing.length)}/${missing.length}`);
  }

  console.log(`\n\nDone!`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Errors: ${errors}`);

  const { count } = await supabase.from('cigars').select('*', { count: 'exact', head: true });
  console.log(`  Total in DB: ${count}`);
}

main().catch(console.error);
