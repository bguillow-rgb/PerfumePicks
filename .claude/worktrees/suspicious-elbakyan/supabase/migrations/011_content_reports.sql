-- 011_content_reports.sql
-- User-generated content reports. Required by Apple App Review Guideline 1.2
-- ("Safety — User-Generated Content"): apps with UGC must ship a report flow,
-- an in-app way to block abusive users, and act on reports within 24 hours.
--
-- Target types (target_kind):
--   cigar_image       — a user-submitted cigar image that was auto-promoted
--                       to the canonical image for a cigar
--   cigar_review      — a user's public review/rating on a cigar
--   cigar_submission  — a user's suggested-new-cigar submission
--
-- Each report references a target id (the row in the respective source table)
-- plus an optional cigar_id for grouping. Status: 'open' | 'dismissed' |
-- 'actioned'. Admin reviews reports via direct SQL or a future dashboard.

CREATE TABLE IF NOT EXISTS content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reporter_device_id TEXT,
  target_kind TEXT NOT NULL
    CHECK (target_kind IN ('cigar_image','cigar_review','cigar_submission')),
  target_id UUID NOT NULL,
  cigar_id UUID REFERENCES cigars(id) ON DELETE SET NULL,
  reason TEXT NOT NULL
    CHECK (reason IN ('inappropriate','trademark','spam','incorrect','other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','dismissed','actioned')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status
  ON content_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_reports_target
  ON content_reports (target_kind, target_id);

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous guest sessions) can file a report. A guest file
-- passes reporter_user_id IS NULL and relies on reporter_device_id for
-- rate-limiting heuristics at admin review time.
CREATE POLICY "users_insert_content_reports"
  ON content_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_user_id OR reporter_user_id IS NULL);

-- Users can read their own reports (to show "already reported" state later).
CREATE POLICY "users_read_own_content_reports"
  ON content_reports FOR SELECT
  USING (auth.uid() = reporter_user_id);
