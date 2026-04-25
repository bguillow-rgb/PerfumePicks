-- 008_cigar_submissions.sql
-- User-submitted cigar suggestions — captured when both AI and manual search fail
-- to find a cigar in our catalog. Queue for admin review; informs corpus growth.

CREATE TABLE IF NOT EXISTS cigar_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  device_id TEXT,
  brand TEXT NOT NULL,
  line TEXT NOT NULL,
  vitola TEXT,
  notes TEXT,
  scan_image_id UUID REFERENCES scan_images(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | merged
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cigar_submissions_status ON cigar_submissions (status);
CREATE INDEX IF NOT EXISTS idx_cigar_submissions_user ON cigar_submissions (user_id);

ALTER TABLE cigar_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own submissions"
  ON cigar_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can read own submissions"
  ON cigar_submissions FOR SELECT
  USING (auth.uid() = user_id);
