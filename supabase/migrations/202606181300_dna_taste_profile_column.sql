-- Perfume Picks — Fragrance DNA M4: user_taste_profiles.dna jsonb (durable DNA).
--
-- The derived FragranceDNA envelope (the cross-app passport) is persisted locally
-- in useTasteProfileStore (AsyncStorage) AND mirrored here so it survives a fresh
-- install / new device. One row per user (the table is keyed by user_id), so the
-- DNA rides alongside the existing materialized taste columns rather than in a new
-- table — a single idempotent `on conflict (user_id)` upsert keeps them coherent.
--
-- Writes are last-write-wins by the envelope's own `updatedAt` (the client guards
-- the merge on hydrate). The DNA upsert touches ONLY this column; the typed
-- passive-taste columns (liked_notes, preferred_accords, …) keep being written by
-- syncTasteProfile in parallel, so the pre-DNA recommendation path is untouched.
--
-- Additive + reversible: one nullable jsonb column, no data moved or dropped.

alter table user_taste_profiles
  add column if not exists dna jsonb default null;

comment on column user_taste_profiles.dna is
  'The derived FragranceDNA v2 envelope (archetype, traits, accords, journey, …). Mirrors useTasteProfileStore. Null until the user completes the DNA front door. Last-write-wins on the envelope''s updatedAt.';
