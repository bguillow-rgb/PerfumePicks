-- 007_scan_device_method.sql
-- Adds durable device identity + scan method to scan_images so we can:
--   1. Enforce the free-scan limit across anonymous/Guest identities
--      (same device, different auth sessions, same quota).
--   2. Distinguish OCR-matched scans from Cigar Concierge (LLM) scans for
--      telemetry and for training-loop filtering.
--   3. Allow OCR-only scans to skip the image upload without nulling-out
--      an otherwise-required column.

ALTER TABLE scan_images
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS scan_method TEXT;

-- OCR path may not upload an image if the snapshot fails — relax NOT NULL.
ALTER TABLE scan_images ALTER COLUMN image_url DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scan_device ON scan_images (device_id);
CREATE INDEX IF NOT EXISTS idx_scan_device_method ON scan_images (device_id, scan_method);
