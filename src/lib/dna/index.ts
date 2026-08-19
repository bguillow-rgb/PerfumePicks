/**
 * Timberline DNA Layer client (M1) — Perfume Picks public surface.
 *
 * Call sites import `dnaTrackEvent` from here. Everything is gated behind the
 * `dna_layer_enabled` app_settings flag, which SHIPS OFF (fail closed; the row
 * insert lives in supabase/migrations/202608191200_dna_layer_flag.sql, run
 * manually in the SQL editor). With the flag OFF every export here is a hard
 * no-op: nothing is queued, no storage is touched, no DNA session is minted,
 * no network call is made. Dual-emission is ADDITIVE — every dnaTrackEvent
 * call site keeps its existing PostHog track() call unchanged.
 *
 * M1 scope = EVENTS ONLY (client events). The M2+ surfaces (signals,
 * /dna-profile, seed/migrate, recompute) are a LATER milestone and
 * intentionally absent.
 */

export { dnaTrackEvent, dnaFlush, dnaEnabled } from './client';
export { isDnaLayerEnabled, setDnaLayerEnabled, resolveDnaLayerFlag } from './layerFlag';
export { toCanonical, PERFUME_TO_CANONICAL } from './eventMap';
export type { CanonicalEventName, EventPayloadMap, LayerEvent } from './types';

// NOTE: consent_changed — Perfume Picks has NO ATT/consent toggle affordance
// today, so there is no live call site and the event is not in the canonical
// union yet. Wire it (union + payload + call) when a consent toggle ships.
// Wiring a phantom call site would emit nothing real.

// NOTE: explicit_dislike + recommendation_dismissed are IN the union (typed,
// ready) but have no live call site yet: Train's left swipe is a deliberate
// neutral 'skip' (not a rejection — see app/(tabs)/train.tsx), and no
// thumbs-down / "not for me" affordance exists elsewhere. Wire when one ships.

// NOTE: search_query_submitted — excluded: no discrete instrumented
// search-submit choke point maps to Tier-1 here (Perfume's SEARCH_* funnel is
// picker-catalog telemetry, not a taste signal).
