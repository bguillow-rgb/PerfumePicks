/**
 * Timberline DNA Layer — offline event queue + flusher (M1).
 *
 * AsyncStorage-backed FIFO. dnaTrackEvent() enqueues a fully-formed LayerEvent
 * (event_id minted once, at enqueue time, so retries dedup server-side). A
 * flusher drains the queue in batches of ≤ BATCH_SIZE to /events-ingest.
 *
 * Guarantees (Percolate/Pour parity — ported from Pour Picks src/lib/dna/queue.ts):
 *  - No silent catches: every network/storage error is logged AND the events
 *    stay queued. Events are NEVER dropped on failure.
 *  - Idempotent: event_id is on the envelope before it ever hits the queue.
 *  - Bounded: at QUEUE_CAP the OLDEST events drop (logged warning).
 *  - Backoff: a failing batch retries up to MAX_RETRIES with exponential
 *    backoff, then is left in the queue for the next flush trigger (foreground,
 *    network-restore, session-end) — not dropped.
 *
 * The flusher is provided a `send` function so the client owns auth/headers and
 * the queue stays transport-agnostic and unit-testable.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  BATCH_SIZE,
  MAX_RETRIES,
  QUEUE_CAP,
  QUEUE_STORAGE_KEY,
} from './config';
import type { LayerEvent } from './types';

/** Sends one batch. Resolves true on success (2xx), false on a retryable failure. */
export type BatchSender = (batch: LayerEvent[]) => Promise<boolean>;

let memoryQueue: LayerEvent[] | null = null;
let flushing = false;

/** Chunk an array into runs of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadQueue(): Promise<LayerEvent[]> {
  if (memoryQueue) return memoryQueue;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    memoryQueue = raw ? (JSON.parse(raw) as LayerEvent[]) : [];
  } catch (err) {
    // Corrupt/unreadable store → log and start empty rather than throw. We do
    // NOT silently swallow: the warning is the audit trail.
    console.warn('[dna/queue] failed to load queue, starting empty:', err);
    memoryQueue = [];
  }
  return memoryQueue;
}

async function saveQueue(q: LayerEvent[]): Promise<void> {
  memoryQueue = q;
  try {
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(q));
  } catch (err) {
    // Persist failed, but the in-memory queue still holds the events for this
    // session's flush attempts — log, don't drop.
    console.warn('[dna/queue] failed to persist queue:', err);
  }
}

/** Enqueue one event (FIFO). Drops OLDEST on overflow with a logged warning. */
export async function enqueue(event: LayerEvent): Promise<void> {
  const q = await loadQueue();
  q.push(event);
  if (q.length > QUEUE_CAP) {
    const dropped = q.length - QUEUE_CAP;
    q.splice(0, dropped);
    console.warn(`[dna/queue] queue over cap (${QUEUE_CAP}); dropped ${dropped} oldest event(s)`);
  }
  await saveQueue(q);
}

/** Current queue depth (for diagnostics / tests). */
export async function queueSize(): Promise<number> {
  return (await loadQueue()).length;
}

function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Try to send one batch with exponential backoff up to MAX_RETRIES.
 * Returns true if the batch was accepted; false if it should stay queued.
 */
async function sendWithBackoff(send: BatchSender, batch: LayerEvent[]): Promise<boolean> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let ok = false;
    try {
      ok = await send(batch);
    } catch (err) {
      // Transport threw — treat as a retryable failure, log, keep going.
      console.warn(`[dna/queue] send threw on attempt ${attempt}:`, err);
      ok = false;
    }
    if (ok) return true;
    if (attempt < MAX_RETRIES) await sleep(backoffDelay(attempt));
  }
  return false;
}

/**
 * Drain the queue in ≤ BATCH_SIZE chunks. Successfully-sent events are removed
 * from the head; the first failing batch (after its retries) stops the drain
 * and leaves itself + everything after it in the queue for the next trigger.
 * Reentrancy-guarded so overlapping triggers don't double-send.
 */
export async function flush(send: BatchSender): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let q = await loadQueue();
    while (q.length > 0) {
      const batch = q.slice(0, BATCH_SIZE);
      const ok = await sendWithBackoff(send, batch);
      if (!ok) {
        // Leave the batch (and the tail) queued; next trigger retries.
        console.warn(
          `[dna/queue] batch of ${batch.length} not delivered after retries; leaving queued`
        );
        break;
      }
      q = q.slice(batch.length);
      await saveQueue(q);
    }
  } finally {
    flushing = false;
  }
}

/** Test-only: drop all in-memory + persisted state. */
export async function _resetQueueForTest(): Promise<void> {
  memoryQueue = null;
  flushing = false;
  try {
    await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
  } catch {
    // best effort in tests
  }
}
