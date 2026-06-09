/**
 * Upsert notes/accords from raw scraped JSON files into Supabase.
 *
 * Reads all frag-*-raw.json files, matches by slug, and updates
 * top_notes, heart_notes, base_notes, top_accords, accord_intensity
 * for any fragrance that has notes data in the raw file but is missing
 * or stale in the database.
 *
 * Usage:
 *   npx ts-node scripts/enrich-notes-from-raw.ts
 *
 * Env required:
 *   SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { normalize } from './types';

const DATA_DIR = path.join(__dirname, 'data');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

function fragranceSlug(brand: string, name: string): string {
  return `${normalize(brand)}-${normalize(name)}`.replace(/\s+/g, '-');
}

interface RawEntry {
  brand: string;
  name: string;
  top_notes?: string[];
  heart_notes?: string[];
  base_notes?: string[];
  top_accords?: string[];
  accord_intensity?: Record<string, number>;
  community_longevity?: number | null;
  community_sillage?: number | null;
  compliment_score?: number | null;
  versatility_score?: number | null;
  office_safe_score?: number | null;
  release_year?: number | null;
  gender?: string | null;
  concentration?: string | null;
  fragrance_family?: string | null;
  image_url?: string | null;
}

async function main() {
  const files = fs.readdirSync(DATA_DIR)
    .filter((f) => f.startsWith('frag-') && f.endsWith('-raw.json'))
    .map((f) => path.join(DATA_DIR, f));

  // Load all raw entries
  const candidates: (RawEntry & { slug: string })[] = [];
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(data)) continue;
    for (const entry of data) {
      if (!entry.brand || !entry.name) continue;
      const hasNotes = (entry.top_notes?.length > 0) ||
                       (entry.heart_notes?.length > 0) ||
                       (entry.base_notes?.length > 0) ||
                       (entry.top_accords?.length > 0);
      if (!hasNotes) continue;
      candidates.push({ ...entry, slug: fragranceSlug(entry.brand, entry.name) });
    }
  }
  console.log(`Candidates with notes: ${candidates.length}`);

  // Process in batches — look up slugs, then upsert
  const BATCH = 100;
  let updated = 0;
  let notFound = 0;

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const slugs = batch.map((c) => c.slug);

    // Get existing rows by slug
    const { data: rows, error } = await supabase
      .from('fragrances')
      .select('id, slug, top_notes')
      .in('slug', slugs);

    if (error) {
      console.error('DB error:', error.message);
      continue;
    }

    const rowBySlug = new Map((rows ?? []).map((r: any) => [r.slug, r]));

    for (const candidate of batch) {
      const row = rowBySlug.get(candidate.slug);
      if (!row) { notFound++; continue; }

      const patch: Record<string, any> = {};

      if (candidate.top_notes?.length) patch.top_notes = candidate.top_notes;
      if (candidate.heart_notes?.length) patch.heart_notes = candidate.heart_notes;
      if (candidate.base_notes?.length) patch.base_notes = candidate.base_notes;
      if (candidate.top_accords?.length) patch.top_accords = candidate.top_accords;
      if (candidate.accord_intensity && Object.keys(candidate.accord_intensity).length) {
        patch.accord_intensity = candidate.accord_intensity;
      }
      if (candidate.community_longevity != null) patch.community_longevity = candidate.community_longevity;
      if (candidate.community_sillage != null) patch.community_sillage = candidate.community_sillage;
      if (candidate.compliment_score != null) patch.compliment_score = candidate.compliment_score;
      if (candidate.versatility_score != null) patch.versatility_score = candidate.versatility_score;
      if (candidate.office_safe_score != null) patch.office_safe_score = candidate.office_safe_score;
      if (candidate.release_year != null && !isNaN(candidate.release_year)) {
        patch.release_year = candidate.release_year;
      }
      if (candidate.gender) patch.gender = candidate.gender;
      if (candidate.concentration) patch.concentration = candidate.concentration;
      if (candidate.fragrance_family) patch.fragrance_family = candidate.fragrance_family;
      if (candidate.image_url) patch.image_url = candidate.image_url;

      if (Object.keys(patch).length === 0) continue;

      const { error: updateErr } = await supabase
        .from('fragrances')
        .update(patch)
        .eq('id', row.id);

      if (updateErr) {
        console.error(`Failed to update ${candidate.slug}:`, updateErr.message);
      } else {
        updated++;
      }
    }

    console.log(`  Processed ${Math.min(i + BATCH, candidates.length)}/${candidates.length} | updated: ${updated} | not found: ${notFound}`);
  }

  console.log(`\nDone. Updated: ${updated} | Not in DB: ${notFound}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
