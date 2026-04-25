// Typed analytics event names. Centralized so we don't drift into multiple naming styles.
// Usage: track(EVENTS.SCAN_STARTED, { source: 'home' })

export const EVENTS = {
  // Auth
  AUTH_SIGN_IN: 'auth_sign_in',
  AUTH_SIGN_OUT: 'auth_sign_out',
  AUTH_GUEST_CONTINUE: 'auth_guest_continue',
  ACCOUNT_DELETED: 'account_deleted',

  // Quiz
  QUIZ_STARTED: 'quiz_started',
  QUIZ_COMPLETED: 'quiz_completed',
  QUIZ_RESULT_VIEWED: 'quiz_result_viewed',

  // Identification
  SCAN_STARTED: 'scan_started',
  SCAN_FRAMES_CAPTURED: 'scan_frames_captured',
  SCAN_RESULT_RECEIVED: 'scan_result_received',
  SCAN_RESULT_CONFIRMED: 'scan_result_confirmed',
  SCAN_RESULT_CORRECTED: 'scan_result_corrected',
  SCAN_RESULT_REJECTED: 'scan_result_rejected',
  SCAN_LIMIT_REACHED: 'scan_limit_reached',
  SCAN_CONCIERGE_OFFERED: 'scan_concierge_offered',
  SCAN_CONCIERGE_TAPPED: 'scan_concierge_tapped',
  SCAN_GALLERY_TAPPED: 'scan_gallery_tapped',
  SCAN_SUGGEST_CIGAR_OPENED: 'scan_suggest_cigar_opened',
  SCAN_SUGGEST_CIGAR_SUBMITTED: 'scan_suggest_cigar_submitted',
  SCAN_UNDO_TAPPED: 'scan_undo_tapped',
  // Flagship-scanner telemetry (Phase 1). Lets us drive threshold tuning,
  // matcher failure modes, and Phase-2 planning purely from data.
  SCAN_CAPTURE_BURST_STARTED: 'scan_capture_burst_started',
  SCAN_CAPTURE_BURST_COMPLETED: 'scan_capture_burst_completed',
  SCAN_CAPTURE_FAILED: 'scan_capture_failed',
  SCAN_FRAME_TOO_SMALL_REJECTED: 'scan_frame_too_small_rejected',
  SCAN_CONFIDENCE_BUCKET: 'scan_confidence_bucket',
  SCAN_MATCH_SCORE: 'scan_match_score',
  SCAN_CANDIDATE_INDEX_CHOSEN: 'scan_candidate_index_chosen',
  SCAN_ACCENT_FOLDED: 'scan_accent_folded',
  SCAN_VITOLA_IN_LINE_STRIPPED: 'scan_vitola_in_line_stripped',
  SCAN_RETRY_WITH_ENHANCE: 'scan_retry_with_enhance',
  SCAN_ALTERNATIVE_TAPPED: 'scan_alternative_tapped',

  // Humidor & Journal
  HUMIDOR_ITEM_ADDED: 'humidor_item_added',
  HUMIDOR_ITEM_REMOVED: 'humidor_item_removed',
  JOURNAL_ENTRY_CREATED: 'journal_entry_created',

  // Pro / Paywall
  PAYWALL_VIEWED: 'paywall_viewed',
  PRO_PURCHASE_STARTED: 'pro_purchase_started',
  PRO_PURCHASE_COMPLETED: 'pro_purchase_completed',
  PRO_PURCHASE_FAILED: 'pro_purchase_failed',
  PRO_RESTORE_STARTED: 'pro_restore_started',
  PRO_RESTORE_COMPLETED: 'pro_restore_completed',

  // Gamification — streaks v1
  // STREAK_TICKED fires on every tick_streak RPC call that mutated state
  // (consecutive-day increment OR gap-reset). same-day no-ops don't fire.
  // STREAK_TOASTED fires only when we actually rendered a toast (true
  // increment + priority-winning + not a reset). Gap between the two is
  // the abandonment signal for roadmap tuning.
  STREAK_TICKED: 'streak_ticked',
  STREAK_TOASTED: 'streak_toasted',
  STREAK_VIEWED: 'streak_viewed',
  ENGAGEMENT_ACTIVE: 'engagement_active',
} as const;

export type EventName = typeof EVENTS[keyof typeof EVENTS];
