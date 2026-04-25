-- Stick Picks — Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE cigars ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE humidor_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;

-- Cigars: public read, admin-only write
CREATE POLICY "Cigars are readable by everyone"
  ON cigars FOR SELECT
  USING (true);

-- Profiles: users read/update own
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Humidor items: users CRUD own
CREATE POLICY "Users can read own humidor"
  ON humidor_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own humidor items"
  ON humidor_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own humidor items"
  ON humidor_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own humidor items"
  ON humidor_items FOR DELETE
  USING (auth.uid() = user_id);

-- Journal entries: users CRUD own
CREATE POLICY "Users can read own journal"
  ON journal_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own journal entries"
  ON journal_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own journal entries"
  ON journal_entries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own journal entries"
  ON journal_entries FOR DELETE
  USING (auth.uid() = user_id);

-- Scan images: users CRUD own
CREATE POLICY "Users can read own scans"
  ON scan_images FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert scans"
  ON scan_images FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scans"
  ON scan_images FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Quiz results: users CRUD own
CREATE POLICY "Users can read own quiz results"
  ON quiz_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert quiz results"
  ON quiz_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);
