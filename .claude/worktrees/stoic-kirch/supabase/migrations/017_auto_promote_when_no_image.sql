-- 017_auto_promote_when_no_image.sql
-- Extend the promote_cigar_image_if_takedown trigger (from 010) to
-- also auto-promote when the parent cigar has NO image_url.
--
-- Motivation (2026-04-24):
-- Admins can now seed cigars via /admin/add-cigar without a photo
-- attached. Prior behavior left any follow-up user submission stuck in
-- the pending moderation queue, so admin-seeded cigars without a photo
-- stayed blank forever (invisible submissions, no in-app moderation UI
-- yet). New behavior: first user submission on a cigar with image_url
-- IS NULL wins automatically — first-photo-published becomes the
-- canonical image immediately.
--
-- Cigars that already have a live image still queue user submissions
-- as pending (future admin image-moderation UI will handle those).
-- Banned cigars still never auto-promote.

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

  -- Never auto-promote on banned cigars — a brand's standing removal
  -- request should not be circumvented by a user upload.
  IF current_status = 'banned' THEN
    RETURN NEW;
  END IF;

  -- Auto-promote paths:
  --   1. Cigar is currently in takedown (existing behavior from 010).
  --   2. Cigar has no image URL at all (new in 017) — a brand-new
  --      admin-seeded entry gets its first photo promoted instantly.
  IF current_status = 'takedown' OR current_url IS NULL THEN
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

-- Trigger definition is unchanged from 010; we're only updating the
-- function body.
