// weather.ts — best-effort "today's weather" for the Scent of the Day.
//
// OTA-SAFE BY DESIGN: pure network fetch, no native module (no expo-location,
// no GPS permission prompt). Coarse city-level via IP geolocation → Open-Meteo
// current conditions. Both are free, keyless.
//
// Fully non-blocking and failure-tolerant: the SOTD renders immediately from
// DNA + season with zero weather; if this resolves it refines the pick once,
// then the result is CACHED for the local day so the pick stays day-stable.
//
// PRIVACY: enabling this makes the app send the user's IP to ipapi.co and coarse
// coordinates to open-meteo.com. It is therefore GATED (`enabled` arg, wired to a
// remote flag that ships OFF) until the privacy policy discloses it. When
// disabled, no request is made and the SOTD falls back to season-only context.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RecContext } from '@/src/features/recommend/score';

type Weather = NonNullable<RecContext['weather']>;
const CACHE_KEY = 'pp.dailyWeather';

/** Race a promise against a timeout so a slow/hung endpoint never blocks. */
async function fetchJson(url: string, ms = 4000): Promise<any | null> {
  try {
    const res = await Promise.race([
      fetch(url, { headers: { accept: 'application/json' } }),
      new Promise<Response>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Open-Meteo WMO code + temperature → our coarse RecContext weather bucket. */
export function mapWeather(tempC: number, code: number): Weather {
  const rainy =
    (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  if (rainy) return 'rainy';
  if (tempC >= 27) return 'hot-humid'; // humidity isn't cheaply available; treat hot as hot-humid
  if (tempC >= 20) return 'warm';
  if (tempC >= 10) return 'cool';
  return 'cold';
}

async function fetchWeather(): Promise<Weather | null> {
  const geo = await fetchJson('https://ipapi.co/json/');
  const lat = geo?.latitude;
  const lon = geo?.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const wx = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`,
  );
  const cur = wx?.current;
  if (!cur || typeof cur.temperature_2m !== 'number') return null;
  return mapWeather(cur.temperature_2m, typeof cur.weather_code === 'number' ? cur.weather_code : 0);
}

/**
 * Returns today's weather bucket (or undefined). Fetches at most once per local
 * day (cached in AsyncStorage). No-ops entirely when `enabled` is false.
 */
export function useDailyWeather(enabled: boolean): Weather | undefined {
  const [weather, setWeather] = useState<Weather | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const today = new Date().toLocaleDateString('en-CA');
        const cachedRaw = await AsyncStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
          const c = JSON.parse(cachedRaw) as { date?: string; weather?: Weather };
          if (c.date === today && c.weather) { if (!cancelled) setWeather(c.weather); return; }
        }
        const w = await fetchWeather();
        if (w && !cancelled) {
          setWeather(w);
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, weather: w }));
        }
      } catch {
        // best-effort — no weather, SOTD uses season only
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  return weather;
}
