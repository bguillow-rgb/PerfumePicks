-- 012_cigar_popularity_tier.sql
-- Adds popularity_tier to cigars. Used by the quiz "adventure" scoring so
-- "Stick to Classics", "Open to Suggestions", and "Surprise Me" produce
-- meaningfully different result sets.
--
-- Rubric (assigned by the LLM during catalog enrichment, source of truth
-- until we have enough app telemetry to replace it):
--   5 — Iconic classic       (Padrón 1964, Opus X, Cohiba Behike, Davidoff WC)
--   4 — Well-known mainstream (Liga Privada No. 9, My Father, Oliva V)
--   3 — Respected boutique    (Crowned Heads Four Kicks, Warped Futuro)
--   2 — Niche / store pick    (limited edition, regional exclusive)
--   1 — Deep cut / obscure    (discontinued, private label, very limited)
--
-- Nullable. Legacy rows get backfilled in the same enrichment pass that
-- covers strength/body/flavors; null is treated as tier 3 by the scorer
-- so a missing value doesn't punish a cigar.

ALTER TABLE cigars
  ADD COLUMN IF NOT EXISTS popularity_tier INT
  CHECK (popularity_tier IS NULL OR popularity_tier BETWEEN 1 AND 5);

-- Index covers the only scorer query pattern: pull cigars with popularity >= X
-- when filtering for classics, < X when filtering for deep cuts.
CREATE INDEX IF NOT EXISTS idx_cigars_popularity_tier
  ON cigars (popularity_tier)
  WHERE popularity_tier IS NOT NULL;
