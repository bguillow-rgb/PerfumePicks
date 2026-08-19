/**
 * Timberline DNA Layer — per-app-session id (M1).
 *
 * device_id is durable per-install (src/lib/deviceId.ts). session_id is a
 * narrower window: a fresh id on cold start, and a new one after the app has
 * been backgrounded longer than SESSION_TIMEOUT_MS (foreground-after-timeout).
 * Kept in module memory only — sessions are intentionally ephemeral, so there's
 * no persistence. uuid v4 via expo-crypto (already a dep; no new package).
 *
 * Ported verbatim from Pour Picks src/lib/dna/session.ts.
 */

/** A foreground gap longer than this starts a new session (30 min). */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

let sessionId: string | null = null;
let lastActivityAt = 0;

/**
 * uuid v4. Prefers expo-crypto.randomUUID (RFC4122 v4) when present. expo-crypto
 * is ESM, so it's lazy-`require`d inside a try/catch — this keeps Jest (no
 * native module) working and avoids a static import that would force every
 * importer to transform the package. Falls back to the same Math.random v4
 * shape src/lib/deviceId.ts uses.
 */
export function uuidv4(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Crypto = require('expo-crypto') as { randomUUID?: () => string };
    if (typeof Crypto.randomUUID === 'function') return Crypto.randomUUID();
  } catch {
    // expo-crypto unavailable (e.g. test env) → manual fallback below.
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Current session id, minting a new one on first call or after a timeout gap.
 * Call sites just read this — the timeout bookkeeping is internal.
 */
export function sessionIdNow(now: number = Date.now()): string {
  if (!sessionId || now - lastActivityAt > SESSION_TIMEOUT_MS) {
    sessionId = uuidv4();
  }
  lastActivityAt = now;
  return sessionId;
}

/** Force a new session (e.g. an explicit cold-start hook). */
export function resetSession(): void {
  sessionId = null;
  lastActivityAt = 0;
}
