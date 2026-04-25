import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const { count: total } = await sb.from('cigars').select('*', { count: 'exact', head: true });
  const { count: withImg } = await sb.from('cigars').select('*', { count: 'exact', head: true }).not('image_url', 'is', null);
  const { count: noImg } = await sb.from('cigars').select('*', { count: 'exact', head: true }).is('image_url', null);
  const { count: noDesc } = await sb.from('cigars').select('*', { count: 'exact', head: true }).is('description', null);
  const { count: noWrapper } = await sb.from('cigars').select('*', { count: 'exact', head: true }).is('wrapper', null);
  const { count: noOrigin } = await sb.from('cigars').select('*', { count: 'exact', head: true }).is('origin', null);
  const { count: noFlavors } = await sb.from('cigars').select('*', { count: 'exact', head: true }).eq('flavors', '{}');
  const { count: noVitola } = await sb.from('cigars').select('*', { count: 'exact', head: true }).is('vitola', null);
  const { count: noStrength } = await sb.from('cigars').select('*', { count: 'exact', head: true }).is('strength', null);

  console.log('=== DATABASE HEALTH ===');
  console.log(`Total cigars:      ${total}`);
  console.log(`With image_url:    ${withImg}`);
  console.log(`Missing image_url: ${noImg}`);
  console.log(`Missing description: ${noDesc}`);
  console.log(`Missing wrapper:   ${noWrapper}`);
  console.log(`Missing origin:    ${noOrigin}`);
  console.log(`Empty flavors:     ${noFlavors}`);
  console.log(`Missing vitola:    ${noVitola}`);
  console.log(`Missing strength:  ${noStrength}`);

  // Sample a new cigar
  const { data: sample } = await sb.from('cigars').select('*').eq('brand', 'Cohiba').limit(1);
  console.log('\n=== SAMPLE (Cohiba) ===');
  console.log(JSON.stringify(sample?.[0], null, 2));
}

main().catch(console.error);
