-- Checkout 2.0 — streamlined cart-permalink buy links.
-- See plans/PRD-checkout-2.0.md.
--
-- Adds two nullable columns to fragrance_retailer_links. Both are inert until the
-- perfumania Shopify ETL populates them, so this migration is a no-op for the
-- running app on its own:
--   * checkout_url        — CJ-wrapped Shopify cart permalink
--                           (jdoqocy click wrapper around perfumania.com/cart/{variantId}:1).
--                           Opened INSTEAD of the product page when present AND the
--                           checkout_2_enabled flag is on; NULL => fall back to `url`.
--   * checkout_variant_id — the Shopify variant id the permalink was built from.
--                           BIGINT because Shopify variant ids exceed int32
--                           (e.g. 41671494533253).
--
-- No RLS change: fragrance_retailer_links is already world-readable for the
-- price/buyable indexes (see 016_fragrance_retailer_links_rls.sql), and these
-- columns ride the existing SELECT policy.

ALTER TABLE fragrance_retailer_links
  ADD COLUMN IF NOT EXISTS checkout_url        TEXT,
  ADD COLUMN IF NOT EXISTS checkout_variant_id BIGINT;

-- Launch-gate flag. Ships OFF: the client ignores checkout_url until this is
-- true, so we can populate data + OTA the code dark and flip live (no release)
-- only after CJ attribution is confirmed through the streamlined flow
-- (PRD §8, test order P574076).
INSERT INTO app_settings (key, value)
VALUES ('checkout_2_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
