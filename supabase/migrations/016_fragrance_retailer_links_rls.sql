-- Migration 016: RLS for fragrance_retailer_links
-- Public read (anyone can see retailer links).
-- Write is service-role only — ETL scripts use the service role key.
-- No insert/update/delete policies for authenticated or anon roles.
-- RLS denies writes by default when no policy exists.
-- DO NOT add client-facing write policies without a full security review.

alter table fragrance_retailer_links enable row level security;

create policy "public select"
  on fragrance_retailer_links
  for select
  using (true);

-- No insert/update/delete policies.
-- Only the service-role key (used by ETL) bypasses RLS.
