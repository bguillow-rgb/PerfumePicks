-- Allow same cigar to exist in multiple statuses (e.g. owned + smoked)
-- Find and drop the old unique constraint on (user_id, cigar_id), then add (user_id, cigar_id, status)

-- Drop any unique constraint on just (user_id, cigar_id) regardless of name
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'humidor_items'
    AND c.contype = 'u'
    AND array_length(c.conkey, 1) = 2;

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE humidor_items DROP CONSTRAINT ' || constraint_name;
  END IF;
END $$;

-- Add new constraint allowing same cigar in multiple statuses
ALTER TABLE humidor_items ADD CONSTRAINT humidor_items_user_cigar_status_key UNIQUE (user_id, cigar_id, status);
