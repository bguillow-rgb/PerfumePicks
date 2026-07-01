/**
 * syncWrite / syncDelete — thin wrappers around Supabase mutations.
 *
 * Policy (M1, Mark Z P0):
 *   - On success: returns { ok: true }.
 *   - On failure: logs to Sentry, returns { ok: false, error }.
 *   - The caller is responsible for toasting the user and marking
 *     the local row as _unsynced if needed.
 *
 * A real offline queue with retry-backoff is deferred to post-M2.
 */

import { supabase } from '@/lib/supabase';
import { captureException, addBreadcrumb } from '@/src/lib/observability/errors';
import { isTransientNetworkFailure } from './transientError';

export interface SyncResult {
  ok: boolean;
  error?: string;
}

/**
 * Report a failed mutation. Transient connectivity blips (no server code, fetch
 * failed) are dropped to a breadcrumb — the caller keeps the row queued for the
 * next flush, so nothing is lost and there is nothing to page on. Real errors
 * (constraint / schema-cache / RLS / auth / any coded PostgREST failure) are
 * captured at error level. `errLike` is the raw Supabase error or thrown value
 * (carries `.code`); `label` is the prefixed message for the Sentry issue.
 */
function reportSyncFailure(errLike: unknown, label: string): void {
  if (isTransientNetworkFailure(errLike)) {
    addBreadcrumb(label, { transient: true });
    return;
  }
  captureException(new Error(label));
}

export async function syncWrite(
  table: string,
  row: Record<string, unknown>,
  onConflict?: string,
): Promise<SyncResult> {
  try {
    const { error } = await supabase
      .from(table)
      .upsert(row, onConflict ? { onConflict } : undefined);
    if (error) {
      reportSyncFailure(error, `syncWrite(${table}): ${error.message}`);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    reportSyncFailure(e, `syncWrite(${table}) exception: ${msg}`);
    return { ok: false, error: msg };
  }
}

export async function syncDelete(
  table: string,
  id: string,
): Promise<SyncResult> {
  try {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      reportSyncFailure(error, `syncDelete(${table}): ${error.message}`);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    reportSyncFailure(e, `syncDelete(${table}) exception: ${msg}`);
    return { ok: false, error: msg };
  }
}
