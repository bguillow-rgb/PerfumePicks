-- 202607291600_catalog_requests.sql
-- Phase 3 demand loop — "add this bottle" requests for scents NOT in the catalog.
--
-- enrich_requests (202607091400) is for bottles we HAVE that need enrichment —
-- keyed by an existing fragrance slug. A search that returns ZERO results has no
-- slug: the bottle simply isn't in the catalog. That's a different, stronger
-- demand signal — a user explicitly asking us to ADD something. It lands here as
-- the raw query text.
--
-- We already log search_no_results to PostHog, but that's a passive miss; a
-- tapped "Request it" is active intent and worth ranking higher. The weekly
-- mining script (scripts/catalog-demand.mjs) unions both into an add-list.
--
-- Additive + reversible: one new table. fragrance_id-style slug conventions do
-- NOT apply — the whole point is there's no fragrance yet.

create table if not exists catalog_requests (
  id               uuid primary key default gen_random_uuid(),
  -- Raw query the user searched (trimmed, capped client-side at 80 chars).
  query            text not null,
  -- Normalized form for dedup + aggregation (lower, accent-stripped, single-spaced).
  query_normalized text not null,
  surface          text,                                  -- e.g. 'dna_picker'
  requested_by     uuid references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  -- Re-requests by the same user dedupe; the client inserts and treats the
  -- unique-violation (23505) as success, exactly like enrich_requests.
  unique (query_normalized, requested_by)
);

create index if not exists catalog_requests_created_idx on catalog_requests (created_at desc);
create index if not exists catalog_requests_qnorm_idx on catalog_requests (query_normalized);

comment on table catalog_requests is
  'Phase 3 demand loop: a zero-result picker search that the user tapped "Request it" on. Raw query text (no fragrance exists yet). Read by scripts/catalog-demand.mjs via service role; the app only inserts.';

-- RLS: mirror enrich_requests — authenticated users INSERT their own rows only,
-- reads are service-role (mining scripts / dashboard). INSERT-only, no upsert
-- read path, so anonymous guests (who make most requests) aren't rejected.
alter table catalog_requests enable row level security;

drop policy if exists catalog_requests_insert_own on catalog_requests;
create policy catalog_requests_insert_own on catalog_requests
  for insert to authenticated
  with check (requested_by = auth.uid());

notify pgrst, 'reload schema';
