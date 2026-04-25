-- 003_cigar_line_column.sql
-- Adds an explicit `line` column to the cigars table, separating the cigar line
-- (e.g., "Serie V Melanio") from the vitola (size). Prior to this migration, some
-- rows had the vitola jammed into `name` (e.g., "Serie V Melanio Maduro Robusto"),
-- which caused the scanner to display fabricated sizes when the AI model couldn't
-- actually determine the size from a close-up band photo.
--
-- This migration:
--   1. Adds `line TEXT` (nullable first, so backfill can populate it)
--   2. Backfills `line` by stripping any trailing vitola suffix from `name`
--   3. Makes `line` NOT NULL once backfill completes
--   4. Rebuilds the fts generated column to include `line`
--   5. Adds a lookup index on (brand, line) for scanner matching

-- 1. Add the column
ALTER TABLE cigars ADD COLUMN IF NOT EXISTS line TEXT;

-- 2. Backfill: if name ends with the vitola string, strip it; otherwise use name as-is
UPDATE cigars
SET line = TRIM(
  CASE
    WHEN vitola IS NOT NULL
      AND length(name) > length(vitola) + 1
      AND lower(right(name, length(vitola) + 1)) = ' ' || lower(vitola)
    THEN left(name, length(name) - length(vitola) - 1)
    ELSE name
  END
)
WHERE line IS NULL;

-- Safety: any remaining NULLs get their name copied over
UPDATE cigars SET line = name WHERE line IS NULL;

-- 3. Enforce NOT NULL
ALTER TABLE cigars ALTER COLUMN line SET NOT NULL;

-- 4. Rebuild fts generated column to include line
--    (Postgres requires drop+add for generated columns.)
ALTER TABLE cigars DROP COLUMN IF EXISTS fts;

ALTER TABLE cigars ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(brand, '') || ' ' ||
      coalesce(line, '') || ' ' ||
      coalesce(name, '') || ' ' ||
      coalesce(description, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_cigars_fts ON cigars USING GIN (fts);

-- 5. Index for scanner brand+line lookups
CREATE INDEX IF NOT EXISTS idx_cigars_brand_line ON cigars (brand, line);
