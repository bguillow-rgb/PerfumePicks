// schema.js — Single source of truth for table + column names used by the
// Perfume Picks KPI dashboard. Every Supabase query reads from here.
//
// Rule: if you're about to add a string literal table/column name to a
// query anywhere in the dashboard, put it here first.

'use strict';

// ── Tables the dashboard reads from ─────────────────────────────────────
const TABLES = {
  profiles: {
    name: 'profiles',
    writes: true,
    confirmedWrites: true,
    timestampCol: 'created_at',
    note: 'Auth user metadata. One row per auth.users entry.',
  },
  authUsers: {
    name: 'auth.users (admin API only)',
    writes: true,
    confirmedWrites: true,
    timestampCol: 'created_at',
    note: 'Source of truth for email + provider.',
  },
  fragrances: {
    name: 'fragrances',
    writes: false, // catalog — admin-only writes
    confirmedWrites: true,
    timestampCol: 'created_at',
    note: 'Fragrance catalog. Used for joins to resolve fragrance_id → name.',
  },
  wardrobeItems: {
    name: 'wardrobe_items',
    writes: true,
    confirmedWrites: true,
    timestampCol: 'created_at',
    statusCol: 'status',
    statusValues: ['have', 'want', 'tested', 'sold_on'],
    note: 'User fragrance collection. status=have is "own", status=want is wishlist.',
  },
  wearLogs: {
    name: 'wear_logs',
    writes: true,
    confirmedWrites: true,
    timestampCol: 'created_at',
    note: 'SOTD wear journal. The main engagement signal.',
  },
  swipeFeedback: {
    name: 'swipe_feedback',
    writes: true,
    confirmedWrites: true,
    timestampCol: 'created_at',
    actionCol: 'action',
    actionValues: ['like', 'dislike', 'skip'],
    note: 'Train My Nose swipe signals. Drives the recommendation engine.',
  },
  quizResults: {
    name: 'quiz_results',
    writes: true,
    confirmedWrites: true,
    timestampCol: 'created_at',
    note: 'Persisted quiz answers for analytics + re-runs.',
  },
  fragranceSubmissions: {
    name: 'fragrance_submissions',
    writes: true,
    confirmedWrites: true,
    timestampCol: 'created_at',
    statusCol: 'status',
    statusValues: ['pending', 'accepted', 'rejected', 'duplicate'],
    pendingFilter: 'status=eq.pending',
    note: 'Missing fragrance reports. Pending = unreviewed.',
  },
  contentReports: {
    name: 'content_reports',
    writes: true,
    confirmedWrites: true,
    timestampCol: 'created_at',
    statusCol: 'status',
    statusValues: ['open', 'resolved', 'dismissed'],
    pendingFilter: 'status=eq.open',
    note: 'UGC reports. Apple compliance (Guideline 1.2).',
  },
  fragranceReviews: {
    name: 'fragrance_reviews',
    writes: true,
    confirmedWrites: true,
    timestampCol: 'created_at',
    note: 'Community ratings + written reviews.',
  },
  dnaPickerEvents: {
    name: 'dna_picker_events',
    writes: true,
    confirmedWrites: true,
    timestampCol: 'created_at',
    kindCol: 'kind',
    note: 'Durable DNA pick-stream event log. Append-only.',
  },
};

// ── PostHog event names used by the dashboard ──────────────────────────
const EVENTS = {
  // Auth
  AUTH_SIGN_IN_APPLE:     'auth_sign_in_apple',
  AUTH_SIGN_IN_GOOGLE:    'auth_sign_in_google',
  AUTH_SIGN_OUT:          'auth_sign_out',
  AUTH_GUEST_CONTINUE:    'auth_guest_continue',

  // Quiz funnel
  QUIZ_STARTED:           'quiz_started',
  QUIZ_COMPLETED:         'quiz_completed',
  QUIZ_RESULT_VIEWED:     'quiz_result_viewed',

  // Fragrance DNA
  DNA_REVEAL_VIEWED:      'dna_reveal_viewed',
  DNA_REVEAL_SHARED:      'dna_reveal_shared',
  DNA_FIRST_REC_VIEWED:   'dna_first_rec_viewed',
  DNA_FIRST_REC_REROLL:   'dna_first_rec_reroll',
  DNA_SKIP_TO_APP:        'dna_skip_to_app',
  DNA_CTA_TAPPED:         'dna_cta_tapped',
  DNA_COMPUTE_FAILED:     'dna_compute_failed',
  DNA_RECOMPUTED:         'dna_recomputed',

  // Discovery
  DISCOVER_SEARCH_QUERY:  'discover_search_query',
  DISCOVER_BRAND_OPENED:  'discover_brand_opened',
  DISCOVER_ACCORD_TAPPED: 'discover_accord_tapped',

  // Fragrance detail
  FRAGRANCE_DETAIL_VIEWED: 'fragrance_detail_viewed',

  // Wardrobe (collection + wishlist)
  WARDROBE_ITEM_ADDED:     'wardrobe_item_added',
  WARDROBE_ITEM_UPDATED:   'wardrobe_item_updated',
  WARDROBE_ITEM_REMOVED:   'wardrobe_item_removed',
  WARDROBE_CAP_HIT:        'wardrobe_cap_hit',

  // Wear logging (journal)
  WEAR_LOGGED:             'wear_logged',
  WEAR_EDITED:             'wear_edited',
  WEAR_DELETED:            'wear_deleted',

  // Train My Nose (swipe)
  TRAIN_SESSION_STARTED:   'train_session_started',
  TRAIN_SWIPE_LOVE:        'train_swipe_love',
  TRAIN_SWIPE_LIKE:        'train_swipe_like',
  TRAIN_SWIPE_PASS:        'train_swipe_pass',
  TRAIN_SESSION_FINISHED:  'train_session_finished',

  // Private notes / layering
  NOTES_SAVED:             'notes_saved',
  LAYERING_ENTRY_ADDED:    'layering_entry_added',
  COMPLIMENT_LOGGED:       'compliment_logged',

  // Affiliate
  AFFILIATE_OUTBOUND_CLICKED: 'affiliate_outbound_clicked',
  AFFILIATE_LINK_FAILED:      'affiliate_link_failed',

  // Monetization
  PAYWALL_VIEWED:          'paywall_viewed',
  PRO_PURCHASE_STARTED:    'pro_purchase_started',
  PRO_PURCHASE_COMPLETED:  'pro_purchase_completed',
  PRO_PURCHASE_FAILED:     'pro_purchase_failed',

  // Feedback
  FEEDBACK_SUBMITTED:      'feedback_submitted',
};

// ── App namespace (PostHog) ────────────────────────────────────────────
// The PP PostHog project is dedicated to Perfume Picks, but we include the
// namespace filter as a defensive measure in case the project ever gets shared.
const APP_NAMESPACE = 'com.bobguillow.perfumepicks';

// ── Launch date ────────────────────────────────────────────────────────
// App approved and live as of 2026-06-25. Reporting baseline starts here:
// prior installs were testers and are not counted toward real-user data.
const LAUNCH_DATE = '2026-06-25';
const LAUNCH_TIMESTAMP = Date.parse('2026-06-25T00:00:00Z');

// ── Pre-launch flag ────────────────────────────────────────────────────
const PRE_LAUNCH = false;
const APP_STORE_STATUS = 'LIVE';
const ASC_APP_ID = '6774184221';

module.exports = {
  TABLES,
  EVENTS,
  APP_NAMESPACE,
  LAUNCH_DATE,
  LAUNCH_TIMESTAMP,
  PRE_LAUNCH,
  APP_STORE_STATUS,
  ASC_APP_ID,
};
