/**
 * Checkout 2.0 launch-gate flag (plans/PRD-checkout-2.0.md §6/§8).
 *
 * A single app_settings row (`checkout_2_enabled`) decides whether the Buy
 * button opens the streamlined cart-permalink checkout (`checkout_url`) or
 * today's product-page handoff (`url`). NEW-FEATURE flag → fails CLOSED:
 * default false, enabled only by an explicit truthy row. This is the switch we
 * flip AFTER CJ attribution is confirmed through the streamlined flow (test
 * order P574076) — data + code ship dark, the flag goes live without a release.
 *
 * Mirrors the killSwitch.ts pattern: module cache + one best-effort fetch,
 * refreshed on app foreground so a rollback takes effect on the next
 * foreground cycle, not only on cold start.
 */

import { AppState } from 'react-native';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

let cached: boolean | null = null;
let fetching: Promise<boolean> | null = null;
let foregroundHookInstalled = false;

async function fetchEnabled(): Promise<boolean> {
  if (!isSupabaseConfigured) return false; // demo / sim → old behavior
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'checkout_2_enabled')
      .maybeSingle();
    if (error || !data) return false; // fail closed
    const v = (data as { value: unknown }).value;
    return v === true || v === 'true' || v === '1' || v === 1;
  } catch {
    return false;
  }
}

/**
 * Synchronous read used at buy-tap time. Returns the cached remote value, or
 * false until the first resolution lands (a first-tap race opens the product
 * page — the safe, current behavior — never a stale checkout).
 */
export function isCheckout2Enabled(): boolean {
  return cached ?? false;
}

/** Kick off (or refresh) the remote resolution. Call once at app start. */
export function resolveCheckout2Flag(): void {
  if (!fetching) {
    fetching = fetchEnabled().then((v) => {
      cached = v;
      fetching = null;
      return v;
    });
  }
  if (!foregroundHookInstalled) {
    foregroundHookInstalled = true;
    AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      void fetchEnabled().then((v) => {
        cached = v;
      });
    });
  }
}

/** Test-only override. */
export function _setCheckout2EnabledForTest(v: boolean | null): void {
  cached = v;
}
