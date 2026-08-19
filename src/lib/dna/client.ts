/**
 * Timberline DNA Layer — Perfume Picks event client (M1).
 *
 * Public boundary: `dnaTrackEvent(name, payload)`. Builds a canonical
 * LayerEvent and enqueues it for delivery to the DNA layer's /events-ingest
 * Edge Function.
 *
 * GUARDRAIL — the entire client is a HARD NO-OP when the `dna_layer_enabled`
 * flag is OFF, and the flag SHIPS OFF (missing row / disabled / unresolved all
 * fail closed). The gate is SYNCHRONOUS: dnaTrackEvent reads the layerFlag.ts
 * module cache and returns immediately when it isn't enabled — no async work,
 * no AsyncStorage write, no session read, no network. Unlike Pour Picks (whose
 * gate is a RolloutFlagValue with a per-user bucket), Perfume's flag is a plain
 * app_settings boolean — no bucket evaluation, no auth-uid read. Guests are
 * anonymous users and count.
 *
 * This is ADDITIVE to src/lib/observability/analytics.ts (the PostHog seam) —
 * it does not replace it. The two run in parallel at every call site; track()
 * keeps doing its job unchanged.
 *
 * Ported from Pour Picks src/lib/dna/client.ts. Perfume deltas: the flag gate
 * is layerFlag.ts (app_settings-backed boolean, checkout2Flag pattern) instead
 * of the rollout-flag registry, and app_id/storage namespaces are Perfume's.
 * device_id stays async (getDeviceId returns a Promise), so buildEvent is too.
 */

import { DNA_LAYER_ANON_KEY, ingestUrl } from './config';
import { ensureDnaSession } from './dnaSupabase';
import { isDnaLayerEnabled } from './layerFlag';
import { enqueue, flush, type BatchSender } from './queue';
import { dnaFetch } from './transport';
import { sessionIdNow, uuidv4 } from './session';
import { APP_ID, type CanonicalEventName, type EventPayloadMap, type LayerEvent } from './types';

// deviceId.ts statically imports expo-application/-secure-store. It's
// lazy-`require`d here so importing this client surface never forces those
// transforms onto every call site / test. Loaded only when an event is
// actually built — which only happens when the flag is ON.
export async function getDnaDeviceId(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getDeviceId } = require('@/src/lib/deviceId') as typeof import('@/src/lib/deviceId');
    return await getDeviceId();
  } catch (err) {
    console.warn('[dna/client] deviceId unavailable:', err);
    return 'unknown-device';
  }
}

/**
 * True when the DNA layer client is live. Synchronous and side-effect free —
 * the layerFlag.ts module cache is primed by resolveDnaLayerFlag() at boot; an
 * unprimed cache / missing row resolves to false — fail closed.
 */
export function dnaEnabled(): boolean {
  return isDnaLayerEnabled();
}

/**
 * Build the auth headers for ANY DNA-layer request: the DNA project anon key
 * as `apikey`, and a DNA-PROJECT-NATIVE anonymous session token as the bearer.
 *
 * THE FIX (Percolate-proven): the bearer is the DNA anon token
 * (ensureDnaSession), NOT the Perfume Picks session JWT. The DNA project is a
 * SEPARATE Supabase project with its own GoTrue; the Perfume JWT would fail
 * getUser there (different secret, no such user) → 401. The DNA-native token
 * resolves, and identity becomes the DNA anon user id.
 *
 * When the DNA session can't be minted (unconfigured / sign-in failed),
 * ensureDnaSession returns null and we fall back to the anon key as the bearer
 * (the request will still 401 server-side, which the queue treats as
 * retryable — events stay queued, never dropped).
 */
export async function dnaAuthHeaders(): Promise<Record<string, string>> {
  const dnaToken = await ensureDnaSession();
  const bearer = dnaToken ?? DNA_LAYER_ANON_KEY;
  return {
    'content-type': 'application/json',
    ...(DNA_LAYER_ANON_KEY ? { apikey: DNA_LAYER_ANON_KEY } : {}),
    ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
  };
}

/**
 * Build the wire envelope for an event. event_id is minted HERE, once, so a
 * later retry of the same enqueued event reuses the same id (server dedup).
 * Async only because the device id is (cached after first resolve).
 */
export async function buildEvent<K extends CanonicalEventName>(
  name: K,
  payload: EventPayloadMap[K]
): Promise<LayerEvent> {
  return {
    event_id: uuidv4(),
    device_id: await getDnaDeviceId(),
    session_id: sessionIdNow(),
    app_id: APP_ID,
    event_name: name,
    event_source: 'client',
    ts: new Date().toISOString(),
    metadata: { ...(payload as unknown as Record<string, unknown>) },
  };
}

/**
 * Send one batch to /events-ingest. Resolves true on a 2xx, false on a
 * retryable failure. Retryable: network error, 5xx, 429, AND 401 (an expired
 * DNA token — dnaFetch already tried one refresh+retry; a still-401 means keep
 * the batch QUEUED, do NOT drop it). Genuine permanent client errors (other
 * 4xx — malformed batch) are logged and reported as success so a bad batch
 * doesn't wedge the queue forever (it's already in the dev log for triage).
 */
const sendBatch: BatchSender = async (batch) => {
  const url = ingestUrl();
  if (!url) {
    // DNA project env vars not configured — keep events queued (return false)
    // so they flush once the env lands. Logged so it's visible in dev.
    console.warn('[dna/client] DNA_LAYER_URL not set; events stay queued');
    return false;
  }

  try {
    const res = await dnaFetch(url, {
      method: 'POST',
      body: JSON.stringify({ events: batch }),
    });

    if (res.ok) return true;

    // 401 (post-refresh), 429 + 5xx are retryable — keep the batch queued.
    if (res.status === 401 || res.status === 429 || res.status >= 500) {
      console.warn(`[dna/client] ingest ${res.status}; will retry`);
      return false;
    }
    console.warn(
      `[dna/client] ingest ${res.status} (permanent); dropping batch of ${batch.length}`
    );
    return true;
  } catch (err) {
    // Network/transport failure → retryable, keep queued.
    console.warn('[dna/client] ingest request failed; will retry:', err);
    return false;
  }
};

/** Kick a flush without blocking the caller. Errors are handled inside flush(). */
function scheduleFlush(): void {
  void flush(sendBatch).catch((err) => console.warn('[dna/client] flush error:', err));
}

/**
 * THE public entry point. Type-safe: the payload is checked against the
 * canonical event's required shape. HARD NO-OP when the flag is OFF.
 *
 * Fire-and-forget: enqueue + a scheduled flush, never awaited by call sites.
 */
export function dnaTrackEvent<K extends CanonicalEventName>(
  name: K,
  payload: EventPayloadMap[K]
): void {
  // SYNCHRONOUS kill-switch guard: flag row missing/disabled/unresolved →
  // return before ANY async work. Nothing queued, no storage touch, no
  // session read. (Perfume's flag is a plain boolean — no per-user bucket.)
  if (!isDnaLayerEnabled()) return;

  void (async () => {
    const event = await buildEvent(name, payload);
    await enqueue(event);
    scheduleFlush();
  })().catch((err) => {
    // Enqueue failed (storage error) — logged, not swallowed. The event is
    // lost only if AsyncStorage is fully broken, which is itself surfaced.
    console.warn('[dna/client] dnaTrackEvent failed:', err);
  });
}

/** Explicit flush trigger for app lifecycle hooks (foreground, session-end).
 *  Gated on the flag so a flag-OFF build never flushes. */
export function dnaFlush(): void {
  if (!isDnaLayerEnabled()) return; // sync kill switch
  scheduleFlush();
}

/** Exposed for the focused unit test (so it can drive sendBatch directly). */
export const _sendBatchForTest = sendBatch;
