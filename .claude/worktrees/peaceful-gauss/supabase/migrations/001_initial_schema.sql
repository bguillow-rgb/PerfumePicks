-- Stick Picks — Initial Schema
-- Run against your Supabase project via the SQL editor or CLI

-- Cigars: master product catalog
CREATE TABLE IF NOT EXISTS cigars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  name TEXT NOT NULL,
  vitola TEXT,
  strength INTEGER CHECK (strength BETWEEN 1 AND 5),
  body INTEGER CHECK (body BETWEEN 1 AND 5),
  price_tier INTEGER CHECK (price_tier BETWEEN 1 AND 5),
  wrapper TEXT,
  binder TEXT,
  filler TEXT[] DEFAULT '{}',
  origin TEXT,
  flavors TEXT[] DEFAULT '{}',
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cigars_brand ON cigars (brand);
CREATE INDEX idx_cigars_strength ON cigars (strength);
CREATE INDEX idx_cigars_body ON cigars (body);
CREATE INDEX idx_cigars_price_tier ON cigars (price_tier);

-- Profiles: extends auth.users
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT DEFAULT 'Cigar Lover',
  avatar_url TEXT,
  taste_profile JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'Cigar Lover'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Humidor items: user collection
CREATE TYPE humidor_status AS ENUM ('wishlist', 'owned', 'smoked');

CREATE TABLE IF NOT EXISTS humidor_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cigar_id UUID NOT NULL REFERENCES cigars(id) ON DELETE CASCADE,
  status humidor_status NOT NULL DEFAULT 'wishlist',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, cigar_id)
);

CREATE INDEX idx_humidor_user ON humidor_items (user_id);

-- Journal entries: smoking log
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cigar_id UUID NOT NULL REFERENCES cigars(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  notes TEXT,
  photo_url TEXT,
  smoked_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_journal_user ON journal_entries (user_id);
CREATE INDEX idx_journal_cigar ON journal_entries (cigar_id);

-- Scan images: training data collection
CREATE TABLE IF NOT EXISTS scan_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  identified_cigar_id UUID REFERENCES cigars(id) ON DELETE SET NULL,
  confidence REAL,
  user_confirmed BOOLEAN DEFAULT false,
  corrected_cigar_id UUID REFERENCES cigars(id) ON DELETE SET NULL,
  raw_llm_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scan_user ON scan_images (user_id);
CREATE INDEX idx_scan_confirmed ON scan_images (user_confirmed);

-- Quiz results: recommendation history
CREATE TABLE IF NOT EXISTS quiz_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  answers JSONB NOT NULL,
  top_match_id UUID REFERENCES cigars(id) ON DELETE SET NULL,
  all_matches JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_quiz_user ON quiz_results (user_id);

-- Full-text search on cigars
ALTER TABLE cigars ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(brand, '') || ' ' || coalesce(name, '') || ' ' || coalesce(description, ''))
  ) STORED;

CREATE INDEX idx_cigars_fts ON cigars USING GIN (fts);
