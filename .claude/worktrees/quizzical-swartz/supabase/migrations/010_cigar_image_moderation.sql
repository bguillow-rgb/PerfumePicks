-- 010_cigar_image_moderation.sql
-- Image takedown + community-replacement infrastructure.
--
-- Design:
--   - `image_status` gates the catalog image at display time. Takedown never
--     destroys the brand's original URL; the client just renders a placeholder
--     whenever status != 'live'. Reactivating is a one-line flip.
--   - When a user-submitted replacement is auto-promoted, we stash the current
--     image_url in `image_url_previous` BEFORE overwriting so the admin can
--     later swap back to the brand original if needed.
--   - `cigar_image_submissions` queues user uploads. An AFTER INSERT trigger
--     auto-promotes if the parent cigar is currently in takedown; otherwise
--     the submission sits as 'pending' for manual review.
--
-- Admin workflow (no app push):
--   Takedown : UPDATE cigars SET image_status='takedown' WHERE id=...;
--   Reactivate: UPDATE cigars SET image_status='live'     WHERE id=...;
--   Restore original after a promotion:
--     UPDATE cigars
--        SET image_url = image_url_previous,
--            image_url_previous = image_url
--      WHERE id=...;

ALTER TABLE cigars
  ADD COLUMN IF NOT EXISTS image_status TEXT NOT NULL DEFAULT 'live'
    CHECK (image_status IN ('live','takedown','banned'));
ALTER TABLE cigars
  ADD COLUMN IF NOT EXISTS image_url_previous TEXT;

CREATE TABLE IF NOT EXISTS cigar_image_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cigar_id UUID NOT NULL REFERENCES cigars(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  device_id TEXT,
  image_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cig_img_sub_cigar_status
  ON cigar_image_submissions (cigar_id, status);
CREATE INDEX IF NOT EXISTS idx_cig_img_sub_user
  ON cigar_image_submissions (user_id);

ALTER TABLE cigar_image_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone signed in (incl. anonymous guest sessions) can submit an image for
-- any cigar. Guest uploads pass user_id IS NULL.
CREATE POLICY "users_insert_image_submissions"
  ON cigar_image_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "users_read_own_image_submissions"
  ON cigar_image_submissions FOR SELECT
  USING (auth.uid() = user_id);

-- Trigger: after an image submission is inserted, check the parent cigar's
-- moderation state and auto-promote if it's in takedown. Banned cigars never
-- auto-promote (e.g. a brand with a standing removal request). Cigars already
-- showing a live image leave the submission as pending for manual review.
CREATE OR REPLACE FUNCTION promote_cigar_image_if_takedown()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_status TEXT;
  current_url    TEXT;
BEGIN
  SELECT image_status, image_url INTO current_status, current_url
    FROM cigars
   WHERE id = NEW.cigar_id;

  IF current_status = 'takedown' THEN
    UPDATE cigars
       SET image_url_previous = COALESCE(image_url_previous, current_url),
           image_url          = NEW.image_url,
           image_status       = 'live'
     WHERE id = NEW.cigar_id;

    UPDATE cigar_image_submissions
       SET status      = 'approved',
           reviewed_at = now()
     WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_cigar_image ON cigar_image_submissions;
CREATE TRIGGER trg_promote_cigar_image
  AFTER INSERT ON cigar_image_submissions
  FOR EACH ROW EXECUTE FUNCTION promote_cigar_image_if_takedown();
