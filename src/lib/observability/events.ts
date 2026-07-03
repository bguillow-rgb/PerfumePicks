// Typed analytics event names. Centralized so we don't drift into multiple naming styles.
// Usage:
//   import { track, EVENTS } from '@/src/lib/observability';
//   track(EVENTS.WARDROBE_ITEM_ADDED, { fragrance_id, status });
//
// Rule: every PostHog event must come from this file. The wrapper in
// analytics.ts is typed to require an EventName so raw strings won't compile.

export const EVENTS = {
  // ─── Auth ────────────────────────────────────────────────────────────
  AUTH_SIGN_IN_APPLE:     'auth_sign_in_apple',
  AUTH_SIGN_IN_GOOGLE:    'auth_sign_in_google',
  AUTH_SIGN_OUT:          'auth_sign_out',
  AUTH_GUEST_CONTINUE:    'auth_guest_continue',
  ACCOUNT_DELETED:        'account_deleted',

  // ─── Quiz ────────────────────────────────────────────────────────────
  QUIZ_STARTED:           'quiz_started',
  QUIZ_COMPLETED:         'quiz_completed',
  QUIZ_RESULT_VIEWED:     'quiz_result_viewed',

  // ─── Fragrance DNA (reveal + first rec) ──────────────────────────────
  DNA_COMPUTE_FAILED:     'dna_compute_failed',
  DNA_REVEAL_VIEWED:      'dna_reveal_viewed',
  DNA_REVEAL_SHARED:      'dna_reveal_shared',
  DNA_FIRST_REC_VIEWED:   'dna_first_rec_viewed',
  DNA_FIRST_REC_REROLL:   'dna_first_rec_reroll',
  DNA_CTA_TAPPED:         'dna_cta_tapped',
  DNA_SKIP_TO_APP:        'dna_skip_to_app',
  // Failure / degraded-path observability (M11 ship gate).
  DNA_FIRST_REC_EMPTY_POOL:    'first_rec_empty_pool',
  DNA_PERSIST_FAILED_QUEUED:    'persist_failed_queued',
  // Living DNA recompute (M2 — unified pool + living archetype).
  DNA_RECOMPUTED:         'dna_recomputed',
  DNA_ARCHETYPE_CHANGED:  'dna_archetype_changed',
  // DNA flow v2: fired when the buyable-match ranking finds zero buyable
  // candidates and falls back to a top-fit (non-commercial) hero card.
  DNA_TOP_MATCH_NO_BUYABLE: 'dna_top_match_no_buyable',

  // ─── Discover ────────────────────────────────────────────────────────
  DISCOVER_SEARCH_QUERY:  'discover_search_query',
  DISCOVER_BRAND_OPENED:  'discover_brand_opened',
  DISCOVER_ACCORD_TAPPED: 'discover_accord_tapped',
  DISCOVER_EDIT_VIEWED:   'discover_edit_viewed',

  // ─── Fragrance detail ────────────────────────────────────────────────
  FRAGRANCE_DETAIL_VIEWED:      'fragrance_detail_viewed',
  FRAGRANCE_SIMILAR_TAPPED:     'fragrance_similar_tapped',
  FRAGRANCE_CHEAPER_ALT_TAPPED: 'fragrance_cheaper_alt_tapped',

  // ─── Wardrobe ────────────────────────────────────────────────────────
  WARDROBE_ITEM_ADDED:     'wardrobe_item_added',
  WARDROBE_ITEM_UPDATED:   'wardrobe_item_updated',
  WARDROBE_ITEM_REMOVED:   'wardrobe_item_removed',
  WARDROBE_CAP_HIT:        'wardrobe_cap_hit',
  WARDROBE_FILTER_CHANGED: 'wardrobe_filter_changed',

  // ─── Wear logging ────────────────────────────────────────────────────
  WEAR_LOGGED:          'wear_logged',
  WEAR_EDITED:          'wear_edited',
  WEAR_DELETED:         'wear_deleted',
  WEAR_NUDGE_DISMISSED: 'wear_nudge_dismissed',
  WEAR_NUDGE_ACCEPTED:  'wear_nudge_accepted',

  // ─── Train (swipe) ───────────────────────────────────────────────────
  TRAIN_SESSION_STARTED:  'train_session_started',
  TRAIN_SWIPE_LOVE:       'train_swipe_love',
  TRAIN_SWIPE_LIKE:       'train_swipe_like',
  TRAIN_SWIPE_PASS:       'train_swipe_pass',
  TRAIN_DAILY_LIMIT_HIT:  'train_daily_limit_hit',
  TRAIN_SESSION_FINISHED: 'train_session_finished',

  // ─── Private notes / layering / compliments (F6) ─────────────────────
  NOTES_SAVED:            'notes_saved',
  LAYERING_ENTRY_ADDED:   'layering_entry_added',
  LAYERING_ENTRY_REMOVED: 'layering_entry_removed',
  COMPLIMENT_LOGGED:      'compliment_logged',

  // ─── Pro / Paywall ───────────────────────────────────────────────────
  PAYWALL_VIEWED:         'paywall_viewed',
  PRO_PURCHASE_STARTED:   'pro_purchase_started',
  PRO_PURCHASE_COMPLETED: 'pro_purchase_completed',
  PRO_PURCHASE_CANCELLED: 'pro_purchase_cancelled', // user backed out of the StoreKit sheet (not a failure)
  PRO_PURCHASE_FAILED:    'pro_purchase_failed',     // reason: 'not_entitled'|'error'|'no_package', + code/message when known
  PRO_RESTORE_STARTED:    'pro_restore_started',
  PRO_RESTORE_COMPLETED:  'pro_restore_completed',

  // ─── Sync / errors ───────────────────────────────────────────────────
  SYNC_WRITE_FAILED: 'sync_write_failed',
  SYNC_RETRY_TAPPED: 'sync_retry_tapped',

  // ─── Affiliate "Buy from" (M2 Phase C) ───────────────────────────────
  AFFILIATE_OUTBOUND_CLICKED: 'affiliate_outbound_clicked',
  // Fired when an outbound buy link looks dead (browser failed to open, or a CJ
  // affiliate link no longer redirects — i.e. pulled from the feed).
  AFFILIATE_LINK_FAILED:      'affiliate_link_failed',

  // ─── Feedback (direct line to founder) ───────────────────────────────
  FEEDBACK_OPENED:    'feedback_opened',
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  FEEDBACK_FAILED:    'feedback_failed',
} as const;

export type EventName = typeof EVENTS[keyof typeof EVENTS];
