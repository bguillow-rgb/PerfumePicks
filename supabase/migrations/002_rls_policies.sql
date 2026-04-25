-- Row-level security policies for Perfume Picks v1.
--
-- Public-read tables (anyone, including anon, can SELECT):
--   brands, fragrances, fragrance_prices  — these are the catalog.
--
-- User-owned tables (only the owning user can read/write):
--   wardrobe_items, wear_logs, swipe_feedback, user_taste_profiles,
--   quiz_results, fragrance_submissions, content_reports
--
-- Service-role tables (no client access; back-office only):
--   comped_users  (Pro grants — only manageable via service-role key)
--
-- Inserts to brands/fragrances/fragrance_prices are service-role only;
-- catalog mutations come from the scraper pipeline, never from the app.

-- ------------------------------------------------------------------
-- Catalog: public read, service-role write
-- ------------------------------------------------------------------
alter table brands             enable row level security;
alter table fragrances         enable row level security;
alter table fragrance_prices   enable row level security;

create policy "brands_public_read"           on brands           for select using (true);
create policy "fragrances_public_read"       on fragrances       for select using (is_active = true);
create policy "fragrance_prices_public_read" on fragrance_prices for select using (true);

-- ------------------------------------------------------------------
-- Wardrobe: owner-only
-- ------------------------------------------------------------------
alter table wardrobe_items enable row level security;
create policy "wardrobe_owner_select" on wardrobe_items for select using (auth.uid() = user_id);
create policy "wardrobe_owner_insert" on wardrobe_items for insert with check (auth.uid() = user_id);
create policy "wardrobe_owner_update" on wardrobe_items for update using (auth.uid() = user_id);
create policy "wardrobe_owner_delete" on wardrobe_items for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Wear logs: owner-only
-- ------------------------------------------------------------------
alter table wear_logs enable row level security;
create policy "wear_logs_owner_select" on wear_logs for select using (auth.uid() = user_id);
create policy "wear_logs_owner_insert" on wear_logs for insert with check (auth.uid() = user_id);
create policy "wear_logs_owner_update" on wear_logs for update using (auth.uid() = user_id);
create policy "wear_logs_owner_delete" on wear_logs for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Swipe feedback: owner-only
-- ------------------------------------------------------------------
alter table swipe_feedback enable row level security;
create policy "swipe_owner_select" on swipe_feedback for select using (auth.uid() = user_id);
create policy "swipe_owner_insert" on swipe_feedback for insert with check (auth.uid() = user_id);
create policy "swipe_owner_update" on swipe_feedback for update using (auth.uid() = user_id);
create policy "swipe_owner_delete" on swipe_feedback for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Taste profiles: owner-only (one row per user)
-- ------------------------------------------------------------------
alter table user_taste_profiles enable row level security;
create policy "taste_owner_select" on user_taste_profiles for select using (auth.uid() = user_id);
create policy "taste_owner_insert" on user_taste_profiles for insert with check (auth.uid() = user_id);
create policy "taste_owner_update" on user_taste_profiles for update using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Quiz results: owner-only
-- ------------------------------------------------------------------
alter table quiz_results enable row level security;
create policy "quiz_owner_select" on quiz_results for select using (auth.uid() = user_id);
create policy "quiz_owner_insert" on quiz_results for insert with check (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Submissions: anyone authenticated can submit; only owner reads their own
-- ------------------------------------------------------------------
alter table fragrance_submissions enable row level security;
create policy "subs_owner_select" on fragrance_submissions for select using (auth.uid() = user_id);
create policy "subs_auth_insert"  on fragrance_submissions for insert with check (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Content reports: any authenticated user can file; nobody can read via the
-- client (moderation happens via service-role / Supabase dashboard)
-- ------------------------------------------------------------------
alter table content_reports enable row level security;
create policy "reports_auth_insert" on content_reports for insert with check (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Comped users: service-role only — no client policies (default deny)
-- ------------------------------------------------------------------
alter table comped_users enable row level security;
