-- admin-user-activity.sql
-- Look up everything a user has done in Perfume Picks.
-- Verified against live schema 2026-06-26.
--
-- Schema notes (live DB, may differ from migration files):
--   fragrances.id         uuid  — join via f.id::text = wi.fragrance_id
--   fragrances.brand_id   uuid  — join to brands.id for brand name
--   wardrobe_items.fragrance_id  text  (migrated from uuid 2026-06-09)
--   wear_logs.fragrance_id       text  (migrated from uuid 2026-06-09)
--   swipe_feedback.fragrance_id  text  (migrated from uuid 2026-06-09)
--   wear_logs uses column "note" (not "notes")
--   quiz_results has "tier" + "answers" jsonb (no "archetype" column)
--   user_taste_profiles has "last_updated" (not "created_at"), "signal_count", "adventure_mode"
--   user_badges has "awarded_at" (not "created_at"), "badge_key"
--   dna_picker_events does NOT exist in live DB (migration not applied)
--
-- Usage: replace the email below and run in Supabase SQL Editor.
-- Project: jdkwlwyysgofljkobpmr
-- URL: https://supabase.com/dashboard/project/jdkwlwyysgofljkobpmr/sql/new

-- ── 1. Full activity log ───────────────────────────────────────────────
WITH target AS (
  SELECT id FROM auth.users WHERE email = 'claudia.nyree@gmail.com'
)

SELECT 'profile' AS section, created_at::text AS ts, is_pro::text AS detail, null AS extra
FROM profiles WHERE id = (SELECT id FROM target)

UNION ALL

SELECT 'wardrobe_item', wi.created_at::text,
  f.name || ' by ' || b.name,
  wi.status
FROM wardrobe_items wi
JOIN fragrances f ON f.id::text = wi.fragrance_id
JOIN brands b ON b.id = f.brand_id
WHERE wi.user_id = (SELECT id FROM target)

UNION ALL

SELECT 'wear_log', wl.created_at::text,
  f.name || ' by ' || b.name,
  wl.note
FROM wear_logs wl
JOIN fragrances f ON f.id::text = wl.fragrance_id
JOIN brands b ON b.id = f.brand_id
WHERE wl.user_id = (SELECT id FROM target)

UNION ALL

SELECT 'swipe', sf.created_at::text,
  f.name || ' by ' || b.name,
  sf.action
FROM swipe_feedback sf
JOIN fragrances f ON f.id::text = sf.fragrance_id
JOIN brands b ON b.id = f.brand_id
WHERE sf.user_id = (SELECT id FROM target)

UNION ALL

SELECT 'quiz_result', qr.created_at::text,
  qr.tier,
  qr.answers::text
FROM quiz_results qr
WHERE qr.user_id = (SELECT id FROM target)

UNION ALL

SELECT 'badge', ub.awarded_at::text,
  ub.badge_key,
  null
FROM user_badges ub
WHERE ub.user_id = (SELECT id FROM target)

ORDER BY ts DESC;


-- ── 2. Onboarding / taste profile ─────────────────────────────────────
-- signal_count > 0 means they completed the picker onboarding.
-- signal_count = 0 / no row = dropped off before finishing.
WITH target AS (
  SELECT id FROM auth.users WHERE email = 'claudia.nyree@gmail.com'
)
SELECT signal_count, adventure_mode, last_updated,
       liked_notes, disliked_notes, preferred_accords, preferred_families
FROM user_taste_profiles
WHERE user_id = (SELECT id FROM target);


-- ── 3. Grant Pro (run separately) ─────────────────────────────────────
-- UPDATE profiles
-- SET is_pro = true
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'claudia.nyree@gmail.com');
