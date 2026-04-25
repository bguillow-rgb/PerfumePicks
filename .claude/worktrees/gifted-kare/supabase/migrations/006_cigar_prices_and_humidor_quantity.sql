-- Add per-stick MSRP to cigars (in cents to avoid float rounding)
ALTER TABLE cigars ADD COLUMN IF NOT EXISTS price_usd_cents INTEGER;

-- Add quantity owned and optional user-entered purchase price per stick
ALTER TABLE humidor_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1);
ALTER TABLE humidor_items ADD COLUMN IF NOT EXISTS purchase_price_cents INTEGER;

CREATE INDEX IF NOT EXISTS idx_humidor_items_user_status ON humidor_items (user_id, status);
