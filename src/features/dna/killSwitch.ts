import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Remote kill-switch for the DNA picker (Mark Z, M2).
 *
 * The picker is now every new user's FIRST screen, so we need a way to fall back
 * to the old `FirstRunFlow` over-the-air if it misbehaves on real devices —
 * without an App Store round-trip. A single Supabase config row
 * (`app_settings.dna_picker_enabled`) governs it. Reads are best-effort and
 * FAIL OPEN: any error (missing table, offline, demo mode) → picker enabled.
 * The switch only ever DISABLES when the row is explicitly `false`.
 */

let cached: boolean | null = null;

async function fetchEnabled(): Promise<boolean> {
  if (!isSupabaseConfigured) return true; // demo / sim → picker on
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'dna_picker_enabled')
      .maybeSingle();
    if (error || !data) return true; // fail open
    const v = (data as { value: unknown }).value;
    // Explicit false (boolean or "false"/"0") disables; anything else enables.
    if (v === false || v === 'false' || v === '0' || v === 0) return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Returns whether the DNA picker is enabled. Defaults to `true` synchronously
 * (so the first paint is the picker, never a flash of the fallback), then
 * resolves the remote value once.
 */
export function useDnaPickerEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(cached ?? true);

  useEffect(() => {
    let alive = true;
    if (cached === null) {
      fetchEnabled().then((v) => {
        cached = v;
        if (alive) setEnabled(v);
      });
    }
    // Re-fetch on foreground so an emergency kill takes effect on the next
    // foreground cycle, not only on a cold start (iOS keeps apps warm for
    // hours/days — a module-cache-only switch would have hours of tail).
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      fetchEnabled().then((v) => {
        cached = v;
        if (alive) setEnabled(v);
      });
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return enabled;
}

// ─────────────────────────────────────────────────────────────────────────────
// Monetization flag (DNA flow v2). Separate switch from the picker kill-switch:
// the flow rewiring (no refine, picks = taste-only) is a straight bug fix and
// ships unconditionally, but the new affiliate top-match card + "more matches"
// page can be disabled over-the-air if the ranking/links misbehave on real
// devices — leaving the DNA reveal itself intact. Same fail-open contract:
// any error → ON; only an explicit `false` row turns it off.
// ─────────────────────────────────────────────────────────────────────────────

let cachedMonetization: boolean | null = null;

async function fetchMonetizationEnabled(): Promise<boolean> {
  if (!isSupabaseConfigured) return true; // demo / sim → on
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'dna_monetization_enabled')
      .maybeSingle();
    if (error || !data) return true; // fail open
    const v = (data as { value: unknown }).value;
    if (v === false || v === 'false' || v === '0' || v === 0) return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Returns whether the DNA monetization surfaces (top-match card + matches page)
 * are enabled. Defaults to `true` synchronously, then resolves the remote value
 * once. Gating the SURFACES, not the ranking math, keeps the reveal safe to ship
 * even if we kill the commercial card.
 */
export function useDnaMonetizationEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(cachedMonetization ?? true);

  useEffect(() => {
    let alive = true;
    if (cachedMonetization === null) {
      fetchMonetizationEnabled().then((v) => {
        cachedMonetization = v;
        if (alive) setEnabled(v);
      });
    }
    // Re-fetch on foreground so killing the commercial card takes effect on the
    // next foreground cycle, not only on a cold start (see useDnaPickerEnabled).
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      fetchMonetizationEnabled().then((v) => {
        cachedMonetization = v;
        if (alive) setEnabled(v);
      });
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return enabled;
}
