-- pgTAP RLS test suite for Perfume Picks.
--
-- Run via: supabase test db
--
-- Creates two test users (alice, bob) and verifies that:
--   1. Owner-only tables deny cross-user reads/writes.
--   2. Public-read tables allow anyone to select.
--   3. Service-role-only tables deny all authenticated operations.
--
-- Each test block follows the pattern:
--   - SET LOCAL role = 'authenticated' + request.jwt.claims for user A
--   - INSERT as user A → should succeed
--   - Switch to user B → SELECT should fail (0 rows) on owner-only tables
--   - Switch to anon → SELECT should fail (0 rows) on owner-only tables
--   - Cleanup
--
-- The test runs inside a transaction that rolls back, so no state leaks.

begin;
select plan(42);

-- ────────────────────────────────────────────────────────────────
-- 0. Create test users in auth.users (required for FK + auth.uid())
-- ────────────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@test.com', '{"provider":"email"}', '{}', 'authenticated', 'authenticated', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@test.com',   '{"provider":"email"}', '{}', 'authenticated', 'authenticated', now(), now());

-- Ensure profiles exist (auto-created by trigger in production, but we
-- need them here for the is_pro_user() function and FK references).
insert into profiles (id, display_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob');

-- Helper: become alice
create or replace function _be_alice() returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
end; $$;

-- Helper: become bob
create or replace function _be_bob() returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
end; $$;

-- Helper: become anon
create or replace function _be_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
end; $$;

-- ────────────────────────────────────────────────────────────────
-- 1. wardrobe_items — owner-only CRUD
-- ────────────────────────────────────────────────────────────────
select _be_alice();

insert into wardrobe_items (id, user_id, fragrance_id, status, unit_type, size_ml, remaining_ml)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        (select id from fragrances limit 1), 'have', 'bottle', 50, 50);

select is(
  (select count(*)::int from wardrobe_items where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'alice can read her own wardrobe item'
);

select _be_bob();
select is(
  (select count(*)::int from wardrobe_items),
  0, 'bob cannot read alice wardrobe items'
);

select _be_anon();
select is(
  (select count(*)::int from wardrobe_items),
  0, 'anon cannot read wardrobe items'
);

-- ────────────────────────────────────────────────────────────────
-- 2. wear_logs — owner-only CRUD
-- ────────────────────────────────────────────────────────────────
select _be_alice();

insert into wear_logs (id, user_id, fragrance_id, worn_on)
values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        (select id from fragrances limit 1), '2026-05-15');

select is(
  (select count(*)::int from wear_logs where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'alice can read her own wear logs'
);

select _be_bob();
select is(
  (select count(*)::int from wear_logs),
  0, 'bob cannot read alice wear logs'
);

select _be_anon();
select is(
  (select count(*)::int from wear_logs),
  0, 'anon cannot read wear logs'
);

-- ────────────────────────────────────────────────────────────────
-- 3. swipe_feedback — owner-only CRUD
-- ────────────────────────────────────────────────────────────────
select _be_alice();

insert into swipe_feedback (user_id, fragrance_id, action)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        (select id from fragrances limit 1), 'love');

select is(
  (select count(*)::int from swipe_feedback where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'alice can read her own swipe feedback'
);

select _be_bob();
select is(
  (select count(*)::int from swipe_feedback),
  0, 'bob cannot read alice swipe feedback'
);

select _be_anon();
select is(
  (select count(*)::int from swipe_feedback),
  0, 'anon cannot read swipe feedback'
);

-- ────────────────────────────────────────────────────────────────
-- 4. quiz_results — owner-only
-- ────────────────────────────────────────────────────────────────
select _be_alice();

insert into quiz_results (user_id, tier, answers)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'free', '{"family":"floral"}');

select is(
  (select count(*)::int from quiz_results where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'alice can read her own quiz results'
);

select _be_bob();
select is(
  (select count(*)::int from quiz_results),
  0, 'bob cannot read alice quiz results'
);

select _be_anon();
select is(
  (select count(*)::int from quiz_results),
  0, 'anon cannot read quiz results'
);

-- ────────────────────────────────────────────────────────────────
-- 5. fragrance_reviews — public read, owner-only write
-- ────────────────────────────────────────────────────────────────
select _be_alice();

insert into fragrance_reviews (id, user_id, fragrance_id, rating_overall, body)
values ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        (select id from fragrances limit 1), 5, 'Amazing scent');

select is(
  (select count(*)::int from fragrance_reviews),
  1, 'alice can read her own review'
);

select _be_bob();
select is(
  (select count(*)::int from fragrance_reviews),
  1, 'bob can read alice review (public read)'
);

-- Bob tries to update alice's review — should fail silently (0 rows affected).
update fragrance_reviews set body = 'hacked' where id = '33333333-3333-3333-3333-333333333333';
select is(
  (select body from fragrance_reviews where id = '33333333-3333-3333-3333-333333333333'),
  'Amazing scent', 'bob cannot update alice review'
);

select _be_anon();
select is(
  (select count(*)::int from fragrance_reviews),
  1, 'anon can read reviews (public read)'
);

-- ────────────────────────────────────────────────────────────────
-- 6. layering_entries — owner-only
-- ────────────────────────────────────────────────────────────────
select _be_alice();

-- Need two fragrance ids for the check constraint (a < b).
do $$ declare fid1 uuid; fid2 uuid; begin
  select id into fid1 from fragrances order by id limit 1;
  select id into fid2 from fragrances order by id limit 1 offset 1;
  if fid1 > fid2 then
    insert into layering_entries (id, user_id, fragrance_a_id, fragrance_b_id)
    values ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', fid2, fid1);
  else
    insert into layering_entries (id, user_id, fragrance_a_id, fragrance_b_id)
    values ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', fid1, fid2);
  end if;
end $$;

select is(
  (select count(*)::int from layering_entries where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'alice can read her own layering entries'
);

select _be_bob();
select is(
  (select count(*)::int from layering_entries),
  0, 'bob cannot read alice layering entries'
);

select _be_anon();
select is(
  (select count(*)::int from layering_entries),
  0, 'anon cannot read layering entries'
);

-- ────────────────────────────────────────────────────────────────
-- 7. compliments_log — owner-only
-- ────────────────────────────────────────────────────────────────
select _be_alice();

insert into compliments_log (id, user_id, fragrance_id, what_was_said, occurred_on)
values ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        (select id from fragrances limit 1), 'You smell amazing!', '2026-05-15');

select is(
  (select count(*)::int from compliments_log where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'alice can read her own compliments'
);

select _be_bob();
select is(
  (select count(*)::int from compliments_log),
  0, 'bob cannot read alice compliments'
);

select _be_anon();
select is(
  (select count(*)::int from compliments_log),
  0, 'anon cannot read compliments'
);

-- ────────────────────────────────────────────────────────────────
-- 8. user_badges — owner read-only, no client insert
-- ────────────────────────────────────────────────────────────────
-- Insert as service role (simulated by being postgres role).
reset role;
insert into user_badges (id, user_id, badge_key)
values ('66666666-6666-6666-6666-666666666666', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'streak_7');

select _be_alice();
select is(
  (select count(*)::int from user_badges where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'alice can read her own badges'
);

select _be_bob();
select is(
  (select count(*)::int from user_badges),
  0, 'bob cannot read alice badges'
);

select _be_anon();
select is(
  (select count(*)::int from user_badges),
  0, 'anon cannot read badges'
);

-- ────────────────────────────────────────────────────────────────
-- 9. fragrance_retailer_links — public read, service-role write
-- ────────────────────────────────────────────────────────────────
-- Insert as service role.
reset role;
insert into fragrance_retailer_links (id, fragrance_id, retailer, url)
values ('77777777-7777-7777-7777-777777777777',
        (select id from fragrances limit 1), 'FragranceX', 'https://example.com');

select _be_alice();
select is(
  (select count(*)::int from fragrance_retailer_links),
  1, 'alice can read retailer links (public read)'
);

select _be_bob();
select is(
  (select count(*)::int from fragrance_retailer_links),
  1, 'bob can read retailer links (public read)'
);

select _be_anon();
select is(
  (select count(*)::int from fragrance_retailer_links),
  1, 'anon can read retailer links (public read)'
);

-- ────────────────────────────────────────────────────────────────
-- 10. Catalog tables — public read
-- ────────────────────────────────────────────────────────────────
select _be_anon();
select ok(
  (select count(*) from fragrances) > 0,
  'anon can read fragrances (public catalog)'
);

select ok(
  (select count(*) from brands) > 0,
  'anon can read brands (public catalog)'
);

-- ────────────────────────────────────────────────────────────────
-- 11. Cross-user insert denial (bob can't insert as alice)
-- ────────────────────────────────────────────────────────────────
select _be_bob();

-- Bob tries to insert a wardrobe item with alice's user_id. RLS should deny.
select throws_ok(
  $$insert into wardrobe_items (id, user_id, fragrance_id, status, unit_type, size_ml, remaining_ml)
    values ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            (select id from fragrances limit 1), 'have', 'bottle', 50, 50)$$,
  null,
  'bob cannot insert wardrobe items as alice'
);

select throws_ok(
  $$insert into wear_logs (id, user_id, fragrance_id, worn_on)
    values ('99999999-9999-9999-9999-999999999998', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            (select id from fragrances limit 1), '2026-05-15')$$,
  null,
  'bob cannot insert wear logs as alice'
);

-- ────────────────────────────────────────────────────────────────
-- 12. Delete denial — bob can't delete alice's rows
-- ────────────────────────────────────────────────────────────────
select _be_bob();

delete from wardrobe_items where id = '11111111-1111-1111-1111-111111111111';
select _be_alice();
select is(
  (select count(*)::int from wardrobe_items where id = '11111111-1111-1111-1111-111111111111'),
  1, 'bob delete on alice wardrobe item had no effect'
);

select _be_bob();
delete from wear_logs where id = '22222222-2222-2222-2222-222222222222';
select _be_alice();
select is(
  (select count(*)::int from wear_logs where id = '22222222-2222-2222-2222-222222222222'),
  1, 'bob delete on alice wear log had no effect'
);

-- ────────────────────────────────────────────────────────────────
-- Done
-- ────────────────────────────────────────────────────────────────
select * from finish();
rollback;
