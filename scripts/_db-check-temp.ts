import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function main() {
  const { data } = await sb.from('fragrances').select('gender').eq('is_active', true).limit(10000);
  const counts: Record<string,number> = {};
  for (const r of data ?? []) counts[r.gender] = (counts[r.gender] ?? 0) + 1;
  console.log('Gender breakdown:', JSON.stringify(counts));
  const { data: masc } = await sb.from('fragrances').select('name').eq('gender', 'masculine').limit(8);
  console.log('Sample masculine:', masc?.map(r => r.name));
  for (const p of [' set', 'duo', 'trio', 'coffret', 'cologne for men', 'for men']) {
    const { count } = await sb.from('fragrances').select('*', { count: 'exact', head: true }).ilike('name', `%${p}%`);
    if ((count ?? 0) > 0) console.log(`'${p}': ${count}`);
  }
}
main().catch(console.error);
