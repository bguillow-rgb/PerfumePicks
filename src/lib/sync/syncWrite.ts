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
import { captureException } from '@/src/lib/observability/errors';

export interface SyncResult {
  ok: boolean;
  error?: string;
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
      captureException(new Error(`syncWrite(${table}): ${error.message}`));
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    captureException(new Error(`syncWrite(${table}) exception: ${msg}`));
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
      captureException(new Error(`syncDelete(${table}): ${error.message}`));
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    captureException(new Error(`syncDelete(${table}) exception: ${msg}`));
    return { ok: false, error: msg };
  }
}
