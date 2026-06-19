import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Remote kill-switch for the DNA picker (Mark Z, M2).
 *
 * The picker is now every new user's FIRST screen, so we need a way to fall back
 * to the old `FirstRunFlow` over-the-air if it misbehaves on real devices —
 * without an App Store round-trip. A single Supabase config row
 * (`app_config.dna_picker_enabled`) governs it. Reads are best-effort and
 * FAIL OPEN: any error (missing table, offline, demo mode) → picker enabled.
 * The switch only ever DISABLES when the row is explicitly `false`.
 */

let cached: boolean | null = null;

async function fetchEnabled(): Promise<boolean> {
  if (!isSupabaseConfigured) return true; // demo / sim → picker on
  try {
    const { data, error } = await supabase
      .from('app_config')
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
    if (cached !== null) return;
    let alive = true;
    fetchEnabled().then((v) => {
      cached = v;
      if (alive) setEnabled(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  return enabled;
}
