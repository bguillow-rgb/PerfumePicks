-- 014_brand_logos.sql
-- Brand-level image fallback for cigars without a per-vitola product shot.
--
-- Context: the catalog has ~7000 cigars and ~359 distinct brands. Many SKUs
-- won't ever get a perfect per-vitola photo — boutique brands, discontinued
-- lines, Cuban cigars that aren't stocked by Cigars International. Rather
-- than leaving the "no image available" placeholder, CigarImage will fall
-- through to the brand logo so the UI always shows *something* on-brand.
--
-- Keyed on brand as free-text (matching cigars.brand today). The long-term
-- cleanup is a brands FK table, but doing that here would balloon the scope.

CREATE TABLE IF NOT EXISTS brand_logos (
  brand      text PRIMARY KEY,
  logo_url   text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: readable by everyone (guest + authed); writes locked to service role
-- so only the seed scripts / admins can touch it.
ALTER TABLE brand_logos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_logos_read_all" ON brand_logos;
CREATE POLICY "brand_logos_read_all"
  ON brand_logos
  FOR SELECT
  USING (true);

-- Keep updated_at fresh on any row update.
CREATE OR REPLACE FUNCTION brand_logos_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brand_logos_touch_updated_at_trg ON brand_logos;
CREATE TRIGGER brand_logos_touch_updated_at_trg
  BEFORE UPDATE ON brand_logos
  FOR EACH ROW EXECUTE FUNCTION brand_logos_touch_updated_at();
