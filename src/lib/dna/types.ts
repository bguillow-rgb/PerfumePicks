/**
 * Timberline DNA Layer — Perfume Picks client event contract (M1).
 *
 * The canonical, app-agnostic Tier-1 event_names + payload shapes the M1
 * client ships to the DNA layer's /events-ingest Edge Function. Same wire
 * envelope as Pour Picks/Percolate; the union is adapted to Perfume's live
 * surfaces (which include an affiliate buy surface Pour doesn't have). No
 * `any` on this boundary.
 *
 * This file is pure types — the runtime client lives in `client.ts`, the queue
 * in `queue.ts`, and the Perfume-Picks-local → canonical name map in
 * `eventMap.ts`.
 *
 * Ported from the proven Pour Picks M1 client (pour-picks src/lib/dna/types.ts).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Canonical Tier-1 event names. snake_case, app-agnostic where the spec
// defines a cross-app name. Server-fired events are NOT this client's job;
// consent_changed has no live affordance in Perfume Picks today and is not
// enumerated until a real trigger exists.
// ─────────────────────────────────────────────────────────────────────────────

export type CanonicalEventName =
  | 'onboarding_pick_selected' //   DNA picker bottle tap (select AND deselect)
  | 'onboarding_completed' //       DNA picker commit / question-fallback commit
  | 'dna_revealed' //               reveal screen viewed
  | 'recommendation_accepted' //    reveal top-match open + Train like/love swipe
  | 'recommendation_dismissed' //   NO live trigger yet (Train left-swipe is a
  //                                deliberate neutral 'skip', not a dismissal)
  | 'explicit_dislike' //           NO live trigger yet (no dislike affordance)
  | 'dna_refresh_started' //        DNA retake started
  | 'item_collection_updated' //    wardrobe add/remove/status change
  | 'wear_logged' //                wear log created
  | 'bottle_rated' //               star rating (rides on the wear-log sheet)
  | 'product_detail_viewed' //      fragrance detail mount (weak signal)
  | 'affiliate_link_clicked'; //    outbound retailer buy tap (Perfume-only surface)

// ─────────────────────────────────────────────────────────────────────────────
// Per-event payload shapes. Optional fields keep the `?`.
// entity_id = the fragrance SLUG (Perfume Picks' app-level fragrance id —
// unique, human-readable, stable across mock + Supabase; UUID is
// Supabase-internal only. See useCatalogStore.ts).
// ─────────────────────────────────────────────────────────────────────────────

export interface OnboardingPickSelectedPayload {
  entity_id: string;
  /** Selection count AFTER the tap. */
  pick_index: number;
  /**
   * Both a grid-tile select and a deselect route through this canonical name —
   * `action` disambiguates so a deselect is never mistaken for a positive
   * onboarding_pick signal at recompute.
   */
  action: 'selected' | 'deselected';
}

export interface OnboardingCompletedPayload {
  total_steps: number;
  duration_ms: number;
  picks_count: number;
  source: 'picker' | 'question_fallback';
}

export interface DnaRevealedPayload {
  headline: string;
  confidence: number;
}

export interface RecommendationDismissedPayload {
  entity_id: string;
  source: string;
  recommendation_id?: string;
}

export interface RecommendationAcceptedPayload {
  entity_id: string;
  ranked_position: number;
  recommendation_id?: string;
}

export interface ExplicitDislikePayload {
  entity_id: string;
  source: 'detail' | 'ranking';
}

export interface DnaRefreshStartedPayload {
  /** Current archetype key at refresh time, or null when no DNA is cached. */
  current_headline: string | null;
}

export interface ItemCollectionUpdatedPayload {
  entity_id: string;
  action: 'add' | 'remove' | 'status_change';
  /**
   * Perfume wardrobe statuses. The canonical trio is want/have/tested;
   * 'sold_on' and 'empty' are Perfume-specific statuses that ride through
   * (see useWardrobeStore.ts — 'empty' exists only on hydrated legacy rows).
   */
  status: 'want' | 'have' | 'tested' | 'sold_on' | 'empty';
}

export interface WearLoggedPayload {
  entity_id: string;
  source: 'sotd' | 'wardrobe';
}

export interface BottleRatedPayload {
  entity_id: string;
  stars: 1 | 2 | 3 | 4 | 5;
  source_screen: string;
}

export interface ProductDetailViewedPayload {
  entity_id: string;
  entity_name: string;
  entity_category: string;
  entity_price?: number | null;
  source_screen: string;
}

export interface AffiliateLinkClickedPayload {
  entity_id: string;
  retailer: string;
  source_screen: string;
}

/** Discriminated map: canonical name → its required payload shape. */
export interface EventPayloadMap {
  onboarding_pick_selected: OnboardingPickSelectedPayload;
  onboarding_completed: OnboardingCompletedPayload;
  dna_revealed: DnaRevealedPayload;
  recommendation_dismissed: RecommendationDismissedPayload;
  recommendation_accepted: RecommendationAcceptedPayload;
  explicit_dislike: ExplicitDislikePayload;
  dna_refresh_started: DnaRefreshStartedPayload;
  item_collection_updated: ItemCollectionUpdatedPayload;
  wear_logged: WearLoggedPayload;
  bottle_rated: BottleRatedPayload;
  product_detail_viewed: ProductDetailViewedPayload;
  affiliate_link_clicked: AffiliateLinkClickedPayload;
}

// ─────────────────────────────────────────────────────────────────────────────
// The wire envelope sent to /events-ingest (DNA layer ingest contract).
// ─────────────────────────────────────────────────────────────────────────────

/** Literal app id for every Perfume-Picks-sourced event. */
export const APP_ID = 'perfume-picks' as const;

/** The shape the ingest Edge Function receives, one per event. */
export interface LayerEvent {
  /** uuid v4, generated ONCE at enqueue time (idempotency / server dedup). */
  event_id: string;
  /** Stable per-install id (src/lib/deviceId.ts getDeviceId()). */
  device_id: string;
  /** Per-app-session id (new on cold start / foreground-after-timeout). */
  session_id: string;
  /** Always 'perfume-picks' from this client. */
  app_id: typeof APP_ID;
  /** Canonical Tier-1 event name. */
  event_name: CanonicalEventName;
  /** Where the event originated. The client always emits 'client'. */
  event_source: 'client';
  /** ISO-8601 timestamp at enqueue time. */
  ts: string;
  /** The event-specific payload (typed per EventPayloadMap). */
  metadata: Record<string, unknown>;
}
