/**
 * syncWrite — write-through helper for user-scoped data.
 *
 * Wraps every Supabase mutation from a Zustand store so the local cache is
 * the source of truth at the moment of the write and the server is reconciled
 * underneath. Returns `{ok: boolean, error?: string}` so the caller can:
 *   - keep the local change either way (it's already in the store)
 *   - mark the row `_unsynced: true` when ok=false
 *   - toast the user when ok=false
 *
 * This is the "fail loudly" policy from the M1 plan. A real offline queue
 * (idempotency keys, retry-with-backoff, conflict resolution, replay) is
 * deferred to post-M2 hardening. Today we don't pretend to handle the user
 * staying offline gracefully — we admit the write failed, mark the row, and
 * let the user retry from a banner on next foreground.
 *
 * Demo mode (Supabase not configured): every call returns ok=true so the
 * UI flow is identical to a successful sync. Local store keeps the row.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { captureException } from '@/src/lib/observability';

/**
 * Looser shape than `Record<string, unknown>` so any typed interface
 * (WardrobeItem, WearLog, etc.) passes without an explicit cast at the
 * call site. Supabase's own client types accept arbitrary objects.
 */
type Row = object;

export type SyncOp =
  | { op: 'insert'; table: string; row: Row }
  | { op: 'update'; table: string; id: string; patch: Row }
  | { op: 'delete'; table: string; id: string }
  | { op: 'upsert'; table: string; row: Row; onConflict?: string };

export type SyncResult = { ok: true } | { ok: false; error: string };

/**
 * Execute a single mutation against Supabase and return a result envelope.
 *
 * Never throws — every error is caught, captured to Sentry, and returned as
 * `{ok: false}`. The caller decides what to do.
 *
 * In demo mode (no Supabase env vars), returns `{ok: true}` immediately so
 * the local-only flow stays identical.
 */
export async function syncWrite(operation: SyncOp): Promise<SyncResult> {
  if (!isSupabaseConfigured) {
    // Demo mode — local-only is the source of truth, no server to talk to.
    return { ok: true };
  }

  // Resolve the current auth user so we can stamp user_id on inserts and
  // upserts. Every user-scoped table (wardrobe_items, wear_logs,
  // swipe_feedback, …) has `user_id not null references auth.users` AND an
  // RLS `with check (auth.uid() = user_id)` policy — so the row MUST carry
  // user_id and it MUST match the JWT. There is no column default.
  //
  // If there's no session, refuse the write rather than blowing past RLS
  // with an unauth'd insert that would 401 anyway.
  let userId: string | null = null;
  if (operation.op === 'insert' || operation.op === 'upsert') {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
    if (!userId) {
      return { ok: false, error: 'Not signed in' };
    }
  }

  try {
    let response;
    switch (operation.op) {
      case 'insert':
        response = await supabase
          .from(operation.table)
          .insert({ ...operation.row, user_id: userId });
        break;
      case 'update':
        response = await supabase
          .from(operation.table)
          .update(operation.patch)
          .eq('id', operation.id);
        break;
      case 'delete':
        response = await supabase.from(operation.table).delete().eq('id', operation.id);
        break;
      case 'upsert':
        response = await supabase
          .from(operation.table)
          .upsert(
            { ...operation.row, user_id: userId },
            operation.onConflict ? { onConflict: operation.onConflict } : undefined,
          );
        break;
    }

    if (response.error) {
      captureException(response.error, {
        sync_op: operation.op,
        sync_table: operation.table,
      });
      return { ok: false, error: response.error.message };
    }
    return { ok: true };
  } catch (e) {
    const err = e as Error;
    captureException(err, {
      sync_op: operation.op,
      sync_table: operation.table,
    });
    return { ok: false, error: err.message ?? 'Unknown error' };
  }
}

/**
 * Centralised toast for write-through failures. UI calls this when syncWrite
 * returns ok=false so the user always knows something didn't reach the server.
 * Imported here so the policy lives in one place; stores never reach into the
 * Alert primitive directly.
 */
export function notifySyncFailure(what: string) {
  // Lazy import to avoid a circular module graph at app start.
  const { Alert } = require('@/src/components/ui/StyledAlert');
  Alert.alert(
    "Couldn't sync",
    `${what} saved locally. We'll retry on next launch.`,
    [{ text: 'OK', style: 'cancel' }],
  );
}
