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
} as const;

export type EventName = typeof EVENTS[keyof typeof EVENTS];
