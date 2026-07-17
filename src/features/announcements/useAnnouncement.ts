/**
 * In-app announcement gate.
 *
 * Fetches the newest active announcement from Supabase and decides whether to
 * show it to THIS user, right now, exactly once:
 *   - active + within [starts_at, ends_at]
 *   - audience 'all' → everyone; 'pro' → Pro only; 'free' → non-Pro only
 *   - not already seen on this device (AsyncStorage set of ids)
 *
 * "First launch" for a targeted announcement = the first app open after the row
 * goes active, because we mark it seen the moment it's dismissed. Owns no UI —
 * AnnouncementModal renders whatever this returns.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { track, EVENTS } from '@/src/lib/observability';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useProStore } from '@/src/stores/useProStore';

const SEEN_KEY = 'pp_seen_announcements_v1';

export type Audience = 'all' | 'pro' | 'free';

export interface Announcement {
  id: string;
  audience: Audience;
  emoji: string | null;
  title: string;
  body: string;
  cta_label: string | null;
  cta_route: string | null;
}

async function getSeen(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function addSeen(id: string): Promise<void> {
  try {
    const seen = await getSeen();
    if (!seen.includes(id)) {
      await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id]));
    }
  } catch {
    // Best-effort — worst case the modal shows once more next launch.
  }
}

export function useAnnouncement(): {
  announcement: Announcement | null;
  dismiss: () => void;
} {
  const isPro = useProStore((s) => s.isPro);
  const hasHydrated = useProStore((s) => s.hasHydrated);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    // Wait for the Pro store to hydrate so a 'pro'/'free' message isn't wrongly
    // gated (or wrongly shown) while isPro is still loading.
    if (!hasHydrated || !isSupabaseConfigured) return;
    let cancelled = false;

    (async () => {
      try {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from('announcements')
          .select('id,audience,emoji,title,body,cta_label,cta_route,starts_at,ends_at')
          .eq('active', true)
          .lte('starts_at', nowIso)
          .order('created_at', { ascending: false })
          .limit(5);
        if (error || !data || cancelled) return;

        const seen = await getSeen();
        const pick = (
          data as (Announcement & { starts_at: string; ends_at: string | null })[]
        ).find((a) => {
          if (a.ends_at && a.ends_at < nowIso) return false; // window closed
          if (seen.includes(a.id)) return false; // already shown once
          if (a.audience === 'pro' && !isPro) return false; // Pro-only gate
          if (a.audience === 'free' && isPro) return false; // free-only gate
          return true;
        });

        if (pick && !cancelled) {
          setAnnouncement(pick);
          track(EVENTS.ANNOUNCEMENT_SHOWN, { id: pick.id, audience: pick.audience });
        }
      } catch {
        // Non-blocking — a failed fetch just means no announcement this launch.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, isPro]);

  // Marks the current announcement seen (so it never re-shows) and hides it.
  const dismiss = useCallback(() => {
    setAnnouncement((current) => {
      if (current) void addSeen(current.id);
      return null;
    });
  }, []);

  return { announcement, dismiss };
}
