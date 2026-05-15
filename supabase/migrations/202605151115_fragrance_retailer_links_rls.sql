-- RLS for fragrance_retailer_links.
-- Public: select (anyone can see buy links).
-- Write: service-role only (ETL pipeline).

alter table fragrance_retailer_links enable row level security;

create policy "retailer_links_select_all" on fragrance_retailer_links
  for select using (true);

-- No insert/update/delete policies for authenticated users.
-- Retailer links are managed by the ETL pipeline (service role).
