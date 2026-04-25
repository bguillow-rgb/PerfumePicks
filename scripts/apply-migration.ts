/**
 * Apply a single SQL migration file to the Perfume Picks Supabase project.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/apply-migration.ts supabase/migrations/001_initial_schema.sql
 *
 * For local development you can also use `supabase db push` if the Supabase
 * CLI is installed — this script exists for parity with the StickPicks
 * workflow where the CLI wasn't always available.
 */

import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: tsx scripts/apply-migration.ts <path/to/migration.sql>');
  process.exit(1);
}

async function main() {
  const sql = fs.readFileSync(path.resolve(file), 'utf-8');
  // Supabase exposes a SQL endpoint via PostgREST RPC `query`. We require a
  // helper function `exec_sql(sql text)` to be installed in the project (run
  // it once via the dashboard SQL editor):
  //
  //   create or replace function exec_sql(sql text) returns void
  //     language plpgsql security definer as $$ begin execute sql; end $$;
  //
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) {
    console.error(`migration failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  console.log(`applied ${file}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
