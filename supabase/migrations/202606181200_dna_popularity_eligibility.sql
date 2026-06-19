-- Perfume Picks — Fragrance DNA M0: popularity_tier + dna_eligible (the picker gate).
--
-- The Fragrance DNA picker's whole promise is "every tile is a fragrance you
-- recognize." That promise is enforced by two new columns on `fragrances`:
--
--   popularity_tier  1..5 recognizability (5 = household icon, 3 = reshuffle floor).
--                    Seeded from docs/perfume-picks-popularity-seed-v1.md by
--                    scripts/dna-seed-popularity.ts (brand+name match). Everything
--                    unmatched — including the ETL-imported discount-retailer long
--                    tail — defaults to tier 2 (catalog-only, NEVER a picker tile).
--
--   dna_eligible     boolean: may this row appear in the picker AT ALL? Computed by
--                    scripts/dna-compute-eligible.ts as:
--                      is_active AND NOT is_discontinued
--                      AND popularity_tier >= 3
--                      AND accord_intensity is non-empty   (we can read its palate)
--                      AND image_url is present             (recognition needs a bottle)
--                    Default false — a row is ineligible until the script proves it.
--                    Re-run after every ETL import so un-enriched new rows stay OUT.
--
-- Picker grid logic (DNA spec Parts 5-6) reads these: grid 1 = tier >= 4, reshuffles
-- never below tier 3, and only ever among dna_eligible = true rows.
--
-- Additive + reversible: new nullable/defaulted columns + one partial index. No data
-- is moved or dropped. The pre-DNA passive-taste path is untouched.

-- ------------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------------
alter table fragrances
  add column if not exists popularity_tier int not null default 2
    check (popularity_tier between 1 and 5),
  add column if not exists dna_eligible    boolean not null default false;

comment on column fragrances.popularity_tier is
  'Recognizability 1..5 (5=household icon, 4=very well known, 3=enthusiast-recognizable / reshuffle floor, 2=niche default, 1=deep cut). Seeded from the Popularity Seed List by scripts/dna-seed-popularity.ts. Tiers <=2 never appear in the DNA picker.';
comment on column fragrances.dna_eligible is
  'May this fragrance appear in the Fragrance DNA picker? Computed by scripts/dna-compute-eligible.ts = is_active AND NOT is_discontinued AND popularity_tier>=3 AND accord_intensity non-empty AND image_url present. Re-run after every ETL import.';

-- ------------------------------------------------------------------
-- 2. Partial index — the picker only ever queries the eligible slice
-- ------------------------------------------------------------------
create index if not exists fragrances_dna_eligible_idx
  on fragrances (popularity_tier desc)
  where dna_eligible;
