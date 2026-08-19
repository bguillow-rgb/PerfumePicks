/**
 * Timberline DNA Layer — Perfume Picks client config (M1).
 *
 * The DNA layer's /events-ingest Edge Function lives on a SEPARATE Supabase
 * project (dukftqhiqilpwkgsgwrc — the standalone portfolio-level layer project,
 * NOT Perfume Picks' own backend). With the `dna_layer_enabled` flag ON, this
 * base URL resolves and the client makes live network calls to that project.
 * The OFF path (the flag SHIPS OFF) is a hard no-op: nothing here is ever read
 * for a network call.
 *
 * EXPO_PUBLIC_DNA_LAYER_URL      — base URL of the shared DNA project's
 *                                  functions host, e.g.
 *                                  https://<dna-ref>.supabase.co/functions/v1
 * EXPO_PUBLIC_DNA_LAYER_ANON_KEY — anon key of the DNA project (sent as apikey).
 *
 * NOTE: this is a DIFFERENT project from Perfume Picks' own backend
 * (EXPO_PUBLIC_SUPABASE_URL → jdkwlwyysgofljkobpmr). They are deliberately not
 * shared — the DNA layer is portfolio-level.
 *
 * Ported from Pour Picks src/lib/dna/config.ts (M1 surface only — the M2+
 * signal/profile/migrate endpoints are a later milestone).
 */

// Env access MUST be a static `process.env.EXPO_PUBLIC_FOO` member expression:
// Expo's babel plugin only inlines static accesses into the app bundle. A
// computed key (`process.env[name]`) is left untouched and resolves to
// undefined at runtime in a standalone Hermes build — which silently turned
// the entire DNA layer off in Release (found by Cabin M5 QA; same bug here).
// jest resolves the same static form from the test process env (tests that
// need values set them in jest.setup / the test file or mock this module),
// so no dynamic escape hatch is needed.

/** Base URL for the DNA layer functions host. */
export const DNA_LAYER_URL: string | undefined = process.env.EXPO_PUBLIC_DNA_LAYER_URL;

/** Anon key for the DNA layer project (sent as the `apikey` header). */
export const DNA_LAYER_ANON_KEY: string | undefined = process.env.EXPO_PUBLIC_DNA_LAYER_ANON_KEY;

/** The ingest endpoint path appended to DNA_LAYER_URL. Must match the DEPLOYED
 *  Supabase Edge Function name (`events-ingest`) — the first path segment after
 *  /functions/v1 IS the function name, so this is '/events-ingest', not
 *  '/events/ingest' (which 404s as a missing function named `events`). */
export const INGEST_PATH = '/events-ingest';

/** Full ingest URL, or null when the DNA project env vars aren't configured. */
export function ingestUrl(): string | null {
  if (!DNA_LAYER_URL) return null;
  return DNA_LAYER_URL.replace(/\/$/, '') + INGEST_PATH;
}

// ── Queue + flush tuning (Percolate/Pour parity) ─────────────────────────────

/** Max events per ingest request. */
export const BATCH_SIZE = 50;

/** Hard cap on the offline queue; oldest events drop on overflow (logged). */
export const QUEUE_CAP = 500;

/** Max retry attempts for a failing batch before it's left for the next trigger. */
export const MAX_RETRIES = 5;

/** Exponential backoff base (ms); attempt n waits BACKOFF_BASE_MS * 2^n. */
export const BACKOFF_BASE_MS = 1000;

/** Cap on a single backoff wait (ms). */
export const BACKOFF_MAX_MS = 30 * 1000;

/** AsyncStorage key for the persisted FIFO queue. */
export const QUEUE_STORAGE_KEY = '@perfumepicks/dna_queue_v1';
