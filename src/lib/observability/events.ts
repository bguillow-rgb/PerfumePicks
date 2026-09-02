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

  // ─── Audience preference ("what should we show you?") ────────────────
  // Asked once, before the DNA picker, and changeable in Settings forever
  // after. Read shown -> selected as a funnel: a gap means people are getting
  // past the screen without answering, which would leave them on 'all' by
  // accident rather than by choice.
  AUDIENCE_PROMPT_SHOWN:  'audience_prompt_shown',   // no props — first-run only
  // props: { pref: 'mens'|'womens'|'all' } — the answer itself. This is the
  // number that settles whether the old feminine-by-default assumption was
  // costing us men, so the pref value is the whole point of the event.
  AUDIENCE_SELECTED:      'audience_selected',
  // props: { pref, from } — changed later in Settings. Kept separate from
  // _selected so a mid-life correction never inflates the onboarding answer
  // distribution; `from` is what they were on before.
  AUDIENCE_CHANGED:       'audience_changed',

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
  // Fired ONCE when a queued row is given up on after MAX_SYNC_ATTEMPTS (dead-
  // letter). Replaces the old behaviour where every retry re-fired
  // persist_failed_queued (a 5,375-event storm during the 2026-06 schema-cache
  // incident).
  DNA_PERSIST_ABANDONED:        'persist_abandoned',
  // Living DNA recompute (M2 — unified pool + living archetype).
  DNA_RECOMPUTED:         'dna_recomputed',
  DNA_ARCHETYPE_CHANGED:  'dna_archetype_changed',
  // DNA flow v2: fired when the buyable-match ranking finds zero buyable
  // candidates and falls back to a top-fit (non-commercial) hero card.
  DNA_TOP_MATCH_NO_BUYABLE: 'dna_top_match_no_buyable',

  // ─── DNA picker search ("bring your own bottle", V3 M4) ─────────────
  // INVITE-style funnel — opened → picked (or no_results / enrich_requested).
  // Pick-stream capture keeps source 'picker'; these carry the search sub-funnel.
  SEARCH_OPENED:           'search_opened',           // props: { pick_count }
  SEARCH_RESULT_PICKED:    'search_result_picked',    // props: { fragrance_id, in_grid, outcome }
  // props: { query, query_length, surface: 'discover'|'dna_picker' }
  // `query` (truncated to 60 chars) is the whole point — it names the bottle or
  // brand the catalog is missing, or the query the search engine fluffs. Logging
  // only query_length meant a zero-result bug ("jo malone" -> 0 bottles) was
  // invisible in analytics and had to be reported by a human.
  SEARCH_NO_RESULTS:       'search_no_results',
  SEARCH_ENRICH_REQUESTED: 'search_enrich_requested', // props: { fragrance_id }
  // A zero-result search the user tapped "Request it" on — explicit "add this
  // bottle" intent (stronger than a passive no_results miss). props: { query, surface }
  SEARCH_REQUEST_SUBMITTED: 'search_request_submitted',

  // ─── Push ────────────────────────────────────────────────────────────
  // The user TAPPED a notification. props: { source } — 'daily_sotd' is the
  // server push whose effect we are trying to read; the local_* sources are
  // in-app reminders and must not be mistaken for it. Also written durably to
  // push_opens, because a push-open otherwise writes nothing and was invisible
  // to retention analysis.
  PUSH_OPENED:            'push_opened',

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
  // Home "add your bottles" prompt, shown to empty wardrobes only, above the
  // DNA card. Before it shipped, a user who finished the DNA picker but never
  // added a bottle saw NO wardrobe CTA on Home at all (a live DNA suppressed
  // GetStartedHero, and the SOTD section was itself gated behind !isNewUser).
  // 98 of 163 profiles since launch were in exactly that state.
  // No props: the prompt only ever renders at a wardrobe count of zero.
  WARDROBE_NUDGE_SHOWN:    'wardrobe_nudge_shown',
  // props: { action: 'browse' | 'scan' }
  WARDROBE_NUDGE_TAPPED:   'wardrobe_nudge_tapped',

  // ─── Wear logging ────────────────────────────────────────────────────
  WEAR_LOGGED:          'wear_logged',
  // { wear_log_count } — free user tried to create a wear log past the
  // lifetime cap (FREE_LIFETIME_WEAR_LOG_CAP). Edits never hit this.
  WEAR_LOG_CAP_HIT:     'wear_log_cap_hit',
  WEAR_EDITED:          'wear_edited',
  WEAR_DELETED:         'wear_deleted',
  WEAR_NUDGE_DISMISSED: 'wear_nudge_dismissed',
  WEAR_NUDGE_ACCEPTED:  'wear_nudge_accepted',

  // ─── Scan (bottle identification) ────────────────────────────────────
  // { lifetime_scan_count } — free user tried to scan past the lifetime cap
  // (FREE_LIFETIME_SCAN_LIMIT). The alert offers Upgrade / Not Now.
  SCAN_LIMIT_HIT:         'scan_limit_hit',

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
  // { archetype } — the soft Pro card on the DNA reveal was shown to a free
  // user (the highest-intent moment; exposure lever). Paired with _tapped.
  DNA_REVEAL_UPSELL_SHOWN: 'dna_reveal_upsell_shown',
  DNA_REVEAL_UPSELL_TAPPED: 'dna_reveal_upsell_tapped',

  // ─── Budget Dupes ────────────────────────────────────────────────────
  // Dupes are the paywall's lead feature and, until 2026-07-16, had ZERO
  // instrumentation: we could not tell whether anyone ever reached them. (They
  // also only rendered on 10 of 13,100 fragrances, so mostly nobody did.) These
  // four answer the funnel end to end: does anyone SEE it, do they WANT it, and
  // does it actually sell a bottle.
  //
  // { dupe_count, revealed, is_pro } — the Budget Dupes section rendered.
  DUPE_SECTION_VIEWED: 'dupe_section_viewed',
  // { locked_count } — non-Pro saw the "N dupes found for this bottle" teaser.
  // dupe_section_viewed minus this = how often Pro users see the real list.
  DUPE_TEASER_SHOWN:   'dupe_teaser_shown',
  // { locked_count } — tapped the teaser, routed to the paywall. THIS is the
  // demand signal: teaser_shown -> teaser_tapped is the dupe conversion intent.
  DUPE_TEASER_TAPPED:  'dupe_teaser_tapped',
  // { dupe_slug, match_pct, source, savings_cents, rank } — a Pro user opened a
  // dupe. The buy that may follow fires affiliate_outbound_clicked with
  // source_screen='dupe_rail' (see the `from=dupe` param), which is how a dollar
  // gets attributed back to this feature.
  DUPE_ROW_TAPPED:     'dupe_row_tapped',

  // ─── Announcements (founder → user in-app messaging) ──────────────────
  ANNOUNCEMENT_SHOWN:      'announcement_shown',      // { id, audience }
  ANNOUNCEMENT_DISMISSED:  'announcement_dismissed',  // { id } — dismiss / backdrop
  ANNOUNCEMENT_CTA_TAPPED: 'announcement_cta_tapped', // { id, route }
  ANNOUNCEMENT_PUBLISHED:  'announcement_published',  // { id, audience, has_cta } — founder composer

  // ─── Sync / errors ───────────────────────────────────────────────────
  SYNC_WRITE_FAILED: 'sync_write_failed',
  SYNC_RETRY_TAPPED: 'sync_retry_tapped',

  // ─── Affiliate "Buy from" (M2 Phase C) ───────────────────────────────
  AFFILIATE_OUTBOUND_CLICKED: 'affiliate_outbound_clicked',
  // Fired when the in-app browser sheet is dismissed after a buy tap.
  // { dwell_ms, landing } — the only in-app signal between the tap and CJ's
  // delayed postback: a 3s dwell is a bounce, a 90s dwell probably bought
  // (Checkout 2.0, PRD §7 / Chief UX F12).
  AFFILIATE_RETURN: 'affiliate_return',
  // Fired when an outbound buy link looks dead (browser failed to open, or a CJ
  // affiliate link no longer redirects — i.e. pulled from the feed).
  AFFILIATE_LINK_FAILED:      'affiliate_link_failed',
  // Fired when the tap opened the retailer but did NOT reach the durable
  // affiliate_clicks ledger. { reason } — 'no_session' when the tapper has no
  // auth row at all (RLS needs auth.uid() = user_id, and anonymous sign-in only
  // happens if they visited the login screen), 'insert_failed' otherwise.
  // Without this the ledger under-counts silently, which is exactly the hole
  // that made the 2026-07-22 Perfumania order (P574076) unauditable.
  AFFILIATE_CLICK_UNLEDGERED: 'affiliate_click_unledgered',

  // ─── Feedback (direct line to founder) ───────────────────────────────
  FEEDBACK_OPENED:    'feedback_opened',
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  FEEDBACK_FAILED:    'feedback_failed',

  // ─── NPS (prompted 0-10 pulse, separate from the App Store review prompt) ──
  // Read shown -> (submitted | dismissed) as a funnel: a low submit rate means
  // the prompt is landing at the wrong moment, not that people dislike the app.
  NPS_SHOWN:     'nps_shown',
  NPS_SUBMITTED: 'nps_submitted',
  NPS_DISMISSED: 'nps_dismissed',
  // Submit reached the network and failed. Without this a broken write path
  // looks identical to nobody answering.
  NPS_SUBMIT_FAILED: 'nps_submit_failed',

  // ─── Scent of the Day ────────────────────────────────────────────────
  // Fired when the smart SOTD engine threw and the Today tab fell back to the
  // legacy ranking. Watch this in prod — a nonzero rate means the front door is
  // silently degrading and the smart engine needs a look (or the kill switch).
  SOTD_ENGINE_FALLBACK: 'sotd_engine_fallback',

  // ─── Push registration funnel ────────────────────────────────────────
  // The audience-builder was a black box: registerPushToken swallowed EVERY
  // failure in a bare catch{}, so "1 token, no idea why" was undiagnosable.
  // These make each step observable. Read them as a funnel:
  //   attempted -> (authorized | denied | error) -> registered
  PUSH_REGISTER_ATTEMPTED:  'push_register_attempted',  // ensurePushRegistered ran
  // { status: 'provisional' | 'authorized' } — the silent quiet grant vs full.
  // provisional -> authorized over time IS the iOS "Keep" upgrade rate.
  PUSH_PERMISSION_GRANTED:  'push_permission_granted',
  PUSH_PERMISSION_DENIED:   'push_permission_denied',   // explicitly denied / undetermined-no-grant
  PUSH_TOKEN_REGISTERED:    'push_token_registered',    // { status } — upsert to push_tokens ok
  // { stage: 'token_fetch' | 'no_user' | 'upsert' | 'unknown', message } —
  // WHERE it broke, instead of the old silent swallow.
  PUSH_REGISTER_FAILED:     'push_register_failed',

  // ─── Invite / referral loop (Feature A — DNA-as-hook viral share) ─────
  // Fired when the user opens the native share sheet with their DNA invite.
  INVITE_SHARED:      'invite_shared',      // props: { archetype, source }
  // A new install opened via an invite link (r=<inviterId> captured).
  INVITE_LINK_OPENED: 'invite_link_opened', // props: { archetype, has_referrer }
  // The captured referrer was written to the referrals table after sign-in.
  INVITE_ATTRIBUTED:  'invite_attributed',  // props: { archetype }
} as const;

export type EventName = typeof EVENTS[keyof typeof EVENTS];
