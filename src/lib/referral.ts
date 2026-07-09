// referral.ts — Feature A attribution side.
//
// Captures an invite link's referrer (?r=<inviterId>&a=<archetype>) on app open,
// stashes it in AsyncStorage across the sign-in/onboarding gap, then writes a
// `referrals` row once we know the signed-in user. Entirely best-effort: every
// step is guarded so a bad link or missing table can never break app launch.
//
// NOTE: iOS does NOT natively carry link params through an App-Store install
// (the "friend doesn't have the app yet" case). This handles the two paths we
// CAN attribute today: (1) the app is already installed and a link opens it,
// and (2) universal links (once associatedDomains is live) open the invite path
// directly. Seamless deferred attribution across a fresh install would need a
// provider like Branch — tracked as a follow-up.

import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/src/stores/useAuthStore';
import { track, EVENTS } from '@/src/lib/observability';

const PENDING_KEY = 'pp.pendingReferral';

interface Pending {
  referrer: string;
  archetype: string | null;
}

async function setPending(p: Pending): Promise<void> {
  try { await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
async function getPending(): Promise<Pending | null> {
  try {
    const v = await AsyncStorage.getItem(PENDING_KEY);
    return v ? (JSON.parse(v) as Pending) : null;
  } catch { return null; }
}
async function clearPending(): Promise<void> {
  try { await AsyncStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

/** Stash a referrer + archetype (from either a raw URL or route params). */
export async function captureReferralParams(
  referrer: string | null,
  archetype: string | null,
): Promise<void> {
  if (!referrer) return;
  await setPending({ referrer, archetype });
  track(EVENTS.INVITE_LINK_OPENED, { archetype, has_referrer: true });
}

/** Parse an inbound URL for invite params and stash the referrer. */
export async function captureReferralFromUrl(url: string | null): Promise<void> {
  if (!url) return;
  let params: Record<string, unknown> = {};
  try { params = Linking.parse(url).queryParams ?? {}; } catch { return; }
  const referrer = typeof params.r === 'string' ? params.r : null;
  const archetype = typeof params.a === 'string' ? params.a : null;
  await captureReferralParams(referrer, archetype);
}

/** Write a stashed referral to Supabase once the signed-in user is known. */
async function flushReferral(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const pending = await getPending();
  if (!pending) return;
  // Self-invite (same device, tapped own link) — drop it, don't attribute.
  if (pending.referrer === userId) { await clearPending(); return; }
  try {
    const { error } = await supabase.from('referrals').insert({
      inviter_id: pending.referrer,
      invitee_id: userId,
      archetype: pending.archetype,
    });
    // 23505 = unique violation → already attributed; treat as success.
    if (!error || error.code === '23505') {
      track(EVENTS.INVITE_ATTRIBUTED, { archetype: pending.archetype });
      await clearPending();
    }
    // Any other error: leave pending so a later launch can retry.
  } catch {
    // best-effort — leave pending
  }
}

/**
 * Mount once in _layout. Captures invite links (cold start + while running) and
 * attributes as soon as a user id is available.
 */
export function useReferralCapture(): void {
  useEffect(() => {
    Linking.getInitialURL().then(captureReferralFromUrl).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => { void captureReferralFromUrl(url); });
    return () => sub.remove();
  }, []);

  const userId = useAuthStore((s) => s.user?.id ?? null);
  useEffect(() => {
    if (userId) void flushReferral(userId);
  }, [userId]);
}
