/**
 * Timberline DNA Layer launch-gate flag (`dna_layer_enabled`) — Perfume's
 * replacement for Pour Picks' RolloutFlagValue registry gate.
 *
 * A single app_settings row decides whether the DNA-layer event client is live.
 * NEW-FEATURE flag → fails CLOSED: default false, enabled only by an explicit
 * truthy row. The flag is a plain boolean — no per-user rollout bucket.
 *
 * Mirrors the checkout2Flag.ts / killSwitch.ts pattern: module-level sync cache
 * + one best-effort remote fetch, refreshed on app foreground so an emergency
 * kill takes effect on the next foreground cycle, not only on a cold start.
 * dnaTrackEvent() reads the sync cache (`isDnaLayerEnabled`) so the OFF path is
 * a synchronous hard no-op; `resolveDnaLayerFlag()` is called once at boot
 * (app/(tabs)/_layout.tsx, next to resolveCheckout2Flag) and never throws.
 */

import { AppState } from 'react-native';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// Module-level cache. Fail closed: OFF until an explicit truthy row resolves.
let enabled = false;
let fetching: Promise<boolean> | null = null;
let foregroundHookInstalled = false;

async function fetchEnabled(): Promise<boolean> {
  if (!isSupabaseConfigured) return false; // demo / sim → layer stays off
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'dna_layer_enabled')
      .maybeSingle();
    if (error || !data) return false; // fail closed
    const v = (data as { value: unknown }).value;
    // Only an explicit truthy row enables.
    return v === true || v === 'true' || v === '1' || v === 1;
  } catch {
    return false;
  }
}

/**
 * Synchronous read used by dnaTrackEvent()'s kill-switch guard. Returns the
 * cached remote value, or false until the first resolution lands (a
 * pre-resolution event is dropped — the safe, ships-OFF behavior).
 */
export function isDnaLayerEnabled(): boolean {
  return enabled;
}

/** Written by the remote resolver and by tests. */
export function setDnaLayerEnabled(v: boolean): void {
  enabled = v;
}

/**
 * Kick off (or refresh) the remote resolution and install the foreground
 * re-fetch. Call once at app start. Safe to call at boot: never throws, and
 * concurrent calls coalesce onto one in-flight fetch.
 */
export function resolveDnaLayerFlag(): void {
  if (!fetching) {
    fetching = fetchEnabled().then((v) => {
      enabled = v;
      fetching = null;
      return v;
    });
    // fetchEnabled never rejects (all paths caught), so no .catch needed —
    // but the void keeps the boot call site fire-and-forget.
    void fetching;
  }
  if (!foregroundHookInstalled) {
    foregroundHookInstalled = true;
    AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      void fetchEnabled().then((v) => {
        enabled = v;
      });
    });
  }
}
