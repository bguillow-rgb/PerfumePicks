// Sentry wrapper. No-ops when EXPO_PUBLIC_SENTRY_DSN is empty so we don't ship
// noise to Sentry from local dev or unconfigured builds.

import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
const isEnabled = SENTRY_DSN.length > 0;
let initialized = false;

export function initErrorReporting(): void {
  if (!isEnabled || initialized) return;
  initialized = true;
  Sentry.init({
    dsn: SENTRY_DSN,
    // Lower in prod once we have signal — 0.2 keeps performance overhead small.
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
    // We do our own user identification via setErrorUser; don't auto-attach IPs etc.
    sendDefaultPii: false,
  });
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!isEnabled) {
    if (__DEV__) console.warn('[errors] captureException', err, context ?? {});
    return;
  }
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/**
 * Non-paging trail marker. Use for expected, self-healing conditions (e.g. a
 * transient network write failure the offline queue will retry) so the volume
 * is visible as context on the NEXT real issue without filing an error itself.
 */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!isEnabled) return;
  Sentry.addBreadcrumb({ category: 'sync', level: 'info', message, data });
}

export function setErrorUser(user: { id: string; email?: string | null } | null): void {
  if (!isEnabled) return;
  Sentry.setUser(user ? { id: user.id, email: user.email ?? undefined } : null);
}
