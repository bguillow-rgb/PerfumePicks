// PostHog wrapper. No-ops when EXPO_PUBLIC_POSTHOG_API_KEY is empty so we don't
// pay for or generate noise events from local dev / unconfigured builds.

import { useEffect, useState } from 'react';
import PostHog from 'posthog-react-native';
import type { EventName } from './events';

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

const isEnabled = POSTHOG_API_KEY.length > 0;
let client: PostHog | null = null;

export function initAnalytics(): void {
  if (!isEnabled || client) return;
  client = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    // Don't auto-capture screen views — we'll fire explicit events from screens
    // so the event taxonomy stays meaningful.
    captureAppLifecycleEvents: true,
  });
}

export function track(event: EventName, properties?: Record<string, unknown>): void {
  if (!isEnabled) {
    if (__DEV__) console.log('[analytics] track', event, properties ?? {});
    return;
  }
  // PostHog expects JsonType-only values; the wrapper accepts `unknown` so callers
  // don't need to think about serializability — PostHog's runtime drops anything weird.
  client?.capture(event, properties as Record<string, never> | undefined);
}

export function identify(userId: string, traits?: Record<string, unknown>): void {
  if (!isEnabled) {
    if (__DEV__) console.log('[analytics] identify', userId, traits ?? {});
    return;
  }
  client?.identify(userId, traits as Record<string, never> | undefined);
}

export function resetAnalytics(): void {
  if (!isEnabled) return;
  client?.reset();
}

// React hook that reads a PostHog boolean feature flag with a stable default.
//
// Design:
//   - When PostHog isn't configured (no API key) we always return the default.
//     Local dev + preview builds never surprise-toggle on us.
//   - PostHog returns `undefined` until its flags hydrate over the network on
//     first render; we treat that as "use the default" rather than flashing
//     the unflagged UI momentarily.
//   - For default-on flags, the flag turns off only when PostHog returns an
//     explicit `false` (typed string/number/unknown values also fall through
//     to the default — safer than eagerly trusting the wire).
//
// Usage:
//   const showAlternatives = usePostHogFeatureFlag('scanner_alternatives_ui', true);
export function usePostHogFeatureFlag(flag: string, defaultValue: boolean): boolean {
  const [value, setValue] = useState<boolean>(defaultValue);
  useEffect(() => {
    if (!isEnabled || !client) return;
    let cancelled = false;
    const read = async () => {
      try {
        // reloadFeatureFlagsAsync ensures we're not looking at a cache that
        // predates this user's identification. Not awaited-blocking in a
        // subscribe-style hook — the initial render returns the default,
        // subsequent renders pick up the real value.
        await client!.reloadFeatureFlagsAsync().catch(() => {});
        if (cancelled) return;
        const raw = client!.getFeatureFlag(flag);
        if (typeof raw === 'boolean') setValue(raw);
        else setValue(defaultValue);
      } catch {
        // Silent — never let analytics break feature surfaces.
      }
    };
    void read();
    return () => {
      cancelled = true;
    };
  }, [flag, defaultValue]);
  return value;
}
