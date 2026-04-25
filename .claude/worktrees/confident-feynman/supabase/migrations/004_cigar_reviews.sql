-- Community ratings & reviews for cigars
CREATE TABLE IF NOT EXISTS cigar_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cigar_id UUID REFERENCES cigars(id) ON DELETE CASCADE NOT NULL,
  overall_rating SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  draw_rating SMALLINT CHECK (draw_rating BETWEEN 1 AND 5),
  burn_rating SMALLINT CHECK (burn_rating BETWEEN 1 AND 5),
  flavor_rating SMALLINT CHECK (flavor_rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- One review per user per cigar
  UNIQUE(user_id, cigar_id)
);

CREATE INDEX idx_cigar_reviews_cigar ON cigar_reviews(cigar_id);
CREATE INDEX idx_cigar_reviews_user ON cigar_reviews(user_id);

-- RLS
ALTER TABLE cigar_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read reviews (community ratings are public)
CREATE POLICY "Reviews are publicly readable"
  ON cigar_reviews FOR SELECT
  USING (true);

-- Users can insert their own reviews
CREATE POLICY "Users can create own reviews"
  ON cigar_reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own reviews
CREATE POLICY "Users can update own reviews"
  ON cigar_reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reviews
CREATE POLICY "Users can delete own reviews"
  ON cigar_reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
