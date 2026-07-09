-- 202607091400_enrich_requests.sql
-- DNA V3 M4 — enrich-on-demand queue for picker search.
--
-- A picker-search result that fails the completeness gate (fragrance_family
-- missing OR top_accords empty) renders dimmed ("Details coming soon"); tapping
-- it enqueues the bottle here so the enrichment pipeline (the
-- scripts/enrich-dna-pool.mjs pattern) can prioritize what real users actually
-- searched for. Demand signal, nothing more — no reads from the app.
--
-- fragrance_id is the app-level SLUG (text), matching every other user-data
-- table (see 202606091200_user_data_fragrance_id_to_slug.sql). No FK to
-- fragrances: the queue may legitimately reference rows that get deactivated
-- before enrichment runs, and slug joins happen in the pipeline scripts.
--
-- Additive + reversible: one new table, no data moved or dropped.

create table if not exists enrich_requests (
  id           uuid primary key default gen_random_uuid(),
  fragrance_id text not null,
  -- Nullable so pipeline/service inserts don't need a user; app inserts always
  -- set it (RLS requires requested_by = auth.uid()). Cascade keeps account
  -- deletion clean.
  requested_by uuid references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  -- Re-taps by the same user dedupe (client upserts with ignoreDuplicates).
  unique (fragrance_id, requested_by)
);

create index if not exists enrich_requests_created_idx on enrich_requests (created_at desc);
create index if not exists enrich_requests_fragrance_idx on enrich_requests (fragrance_id);

comment on table enrich_requests is
  'DNA V3 M4 enrich-on-demand queue: picker-search results failing the completeness gate (family+accords) land here on tap. fragrance_id is the app-level slug. Read by the enrichment pipeline via service role; the app only inserts.';

-- ------------------------------------------------------------------
-- RLS: authenticated users (guests are anonymous authenticated users) insert
-- ONLY their own request. No select/update/delete policies — reads are
-- service-role only (the pipeline + dashboards bypass RLS).
-- ------------------------------------------------------------------
alter table enrich_requests enable row level security;

create policy "enrich_requests_insert_own"
  on enrich_requests for insert
  to authenticated
  with check (requested_by = auth.uid());

notify pgrst, 'reload schema';
