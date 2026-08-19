/**
 * Timberline DNA Layer — shared fetch transport.
 *
 * `dnaFetch` is the single send path for EVERY DNA-layer request (M1 ingest;
 * later milestones reuse it). It:
 *   1. builds the auth headers (DNA-native anon bearer + DNA apikey) via
 *      dnaAuthHeaders(),
 *   2. does the fetch,
 *   3. on a 401 (expired/invalid DNA token), force-refreshes the DNA session,
 *      rebuilds the headers with the new token, and retries the request ONCE.
 *
 * This is what stops an expired-token 401 from being misclassified as a
 * permanent client error and silently dropping a batch (the data-loss bug the
 * Percolate M1 client hit live): after the single refresh-retry, a still-401
 * is returned to the caller, which keeps the batch QUEUED (retryable), not
 * dropped.
 *
 * Ported verbatim from Pour Picks src/lib/dna/transport.ts.
 */

import { dnaAuthHeaders } from './client';
import { refreshDnaSession } from './dnaSupabase';

/**
 * Fetch a DNA-layer endpoint with DNA-native auth + one 401 refresh-retry.
 * The caller passes everything EXCEPT headers (we own those). Returns the final
 * Response (the retried one when a 401 triggered a refresh).
 */
export async function dnaFetch(url: string, init: Omit<RequestInit, 'headers'>): Promise<Response> {
  const res = await fetch(url, { ...init, headers: await dnaAuthHeaders() });
  if (res.status !== 401) return res;

  // 401 → the DNA token is expired/invalid. Force a refresh (or a fresh anon
  // sign-in), rebuild headers, retry ONCE. dnaAuthHeaders() re-reads the now
  // refreshed session, so the retry carries the new bearer.
  console.warn('[dna/transport] 401; refreshing DNA session and retrying once');
  await refreshDnaSession();
  return fetch(url, { ...init, headers: await dnaAuthHeaders() });
}
