import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function main() {
  const CONFIRM = process.argv.includes('--confirm');
  const patterns = [' set', 'duo', 'trio'];
  const allIds: string[] = [];
  for (const p of patterns) {
    const { data } = await sb.from('fragrances').select('id, name').ilike('name', `%${p}%`);
    for (const r of data ?? []) {
      console.log(`  ${r.id} — "${r.name}"`);
      allIds.push(r.id);
    }
  }
  const unique = [...new Set(allIds)];
  console.log(`\nTotal to delete: ${unique.length}`);
  if (!CONFIRM) { console.log('DRY RUN — pass --confirm to delete'); return; }
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    await sb.from('fragrance_retailer_links').delete().in('fragrance_id', batch);
    await sb.from('fragrances').delete().in('id', batch);
  }
  console.log('Done.');
}
main().catch(console.error);
