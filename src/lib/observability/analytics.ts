// PostHog wrapper. No-ops when EXPO_PUBLIC_POSTHOG_API_KEY is empty so we don't
// pay for or generate noise events from local dev / unconfigured builds.

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
