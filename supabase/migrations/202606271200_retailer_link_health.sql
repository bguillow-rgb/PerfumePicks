-- 202606271200_retailer_link_health.sql
-- Server-side link-health tracking for fragrance_retailer_links.
--
-- Replaces the client-side probe that was removed in src/lib/affiliate.ts
-- (commit 2af9d22). The client probe was net-negative: React Native fetch
-- follows redirects so it always saw 200, and probing the CJ click wrapper
-- registered phantom CJ clicks that corrupted attribution.
--
-- Dead-link detection now lives in scripts/validate-retailer-links.ts:
-- it probes the *destination* product URL (never the CJ wrapper) with a real
-- browser user-agent and writes the result here. The app reads link_status and
-- hides rows marked 'dead' so a confirmed-404 link never ships as a Buy button.
--
-- link_status semantics:
--   'unknown' — never checked, or last check was inconclusive (403 bot-gate,
--               429/503 rate-limit, timeout, network error). NEVER hidden —
--               we don't punish a fragrance for Cloudflare's mood.
--   'ok'      — destination returned 2xx on the last check.
--   'dead'    — destination returned 404/410 on the last check. Hidden by app.

alter table fragrance_retailer_links
  add column if not exists link_status      text not null default 'unknown',
  add column if not exists last_checked_at  timestamptz,
  add column if not exists last_http_status int;

alter table fragrance_retailer_links
  drop constraint if exists fragrance_retailer_links_link_status_check;
alter table fragrance_retailer_links
  add constraint fragrance_retailer_links_link_status_check
  check (link_status in ('unknown', 'ok', 'dead'));

-- Lets the validator cheaply find the least-recently-checked rows to recheck,
-- and lets the app's read path skip dead rows without a full scan.
create index if not exists retailer_links_health_idx
  on fragrance_retailer_links (link_status, last_checked_at);
