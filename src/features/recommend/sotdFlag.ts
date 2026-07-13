// sotdFlag.ts — remote switches for the smart Scent of the Day, mirroring the
// DNA-picker kill switch (killSwitch.ts). Both read a single Supabase
// `app_settings` row and are best-effort.
//
//   smart_sotd_enabled          default TRUE  → the DNA-first, day-stable engine.
//                               Set the row to `false` to fall back to the legacy
//                               wardrobe ranking over-the-air if it misbehaves.
//   smart_sotd_weather_enabled  default FALSE → the IP-based weather refinement.
//                               Set the row to `true` to enable once the privacy
//                               policy discloses the ipapi.co / open-meteo calls.
//
// The engine also has a hard try/catch fallback to legacy, so `smart_sotd_enabled`
// is a QUALITY switch (turn off weird-but-not-crashing picks), not a crash guard.

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

async function readFlag(key: string, dflt: boolean): Promise<boolean> {
  if (!isSupabaseConfigured) return dflt;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return dflt; // fail to default
    const v = (data as { value: unknown }).value;
    if (v === true || v === 'true' || v === '1' || v === 1) return true;
    if (v === false || v === 'false' || v === '0' || v === 0) return false;
    return dflt;
  } catch {
    return dflt;
  }
}

/** Whether the smart SOTD engine is on (default true). */
export function useSmartSotdEnabled(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    let cancelled = false;
    readFlag('smart_sotd_enabled', true).then((v) => { if (!cancelled) setOn(v); });
    return () => { cancelled = true; };
  }, []);
  return on;
}

/** Whether the IP-weather refinement is on (default FALSE — privacy-gated). */
export function useSotdWeatherEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    readFlag('smart_sotd_weather_enabled', false).then((v) => { if (!cancelled) setOn(v); });
    return () => { cancelled = true; };
  }, []);
  return on;
}
