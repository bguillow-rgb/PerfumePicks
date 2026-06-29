-- Perfume Picks — hotfix: DNA pick-stream 'like' relation + taste-profile dna column.
--
-- Two production errors (release 1.0.1, Sentry PERFUME-PICKS-1/2), both in the DNA
-- write path, both schema drift from the app:
--
--   1. dna_picker_events_relation_check rejected 'like'. The app's SeedRelation is
--      'own' | 'want' | 'like' (src/features/dna/types.ts) — 'like' is a deliberate
--      pure-taste signal that feeds DNA but never seeds the wardrobe. The original
--      table (202606181500) only allowed ('own','want'), so every committed picker
--      run containing a liked seed violated the check constraint.
--
--   2. user_taste_profiles.dna was missing from the PostgREST schema cache, so the
--      DNA mirror upsert failed with "Could not find the 'dna' column ... in the
--      schema cache". Re-assert the (idempotent) column and reload the cache.
--
-- Additive + reversible: widens one check constraint, re-asserts one nullable column.

-- 1. Widen the relation check to include 'like'.
alter table dna_picker_events
  drop constraint if exists dna_picker_events_relation_check;

alter table dna_picker_events
  add constraint dna_picker_events_relation_check
  check (relation in ('own', 'want', 'like'));

-- 2. Re-assert the taste-profile DNA mirror column (no-op if already present).
alter table user_taste_profiles
  add column if not exists dna jsonb default null;

-- 3. Force PostgREST to pick up the schema so the dna column resolves.
notify pgrst, 'reload schema';
