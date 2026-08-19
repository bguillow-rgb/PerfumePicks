/**
 * Timberline DNA Layer — DNA-project-native auth client + anonymous session.
 *
 * THE BUG THIS PREVENTS (found live on Percolate): the DNA layer is a SEPARATE
 * Supabase project from Perfume Picks' own backend (different GoTrue, different
 * JWT secret, different users). Sending the Perfume Picks session JWT as the
 * bearer to the DNA project's Edge Functions fails `admin.auth.getUser(token)`
 * → 401 on every request.
 *
 * THE FIX: this module owns a SEPARATE supabase client pointed at the DNA
 * PROJECT ORIGIN and mints a DNA-project-native ANONYMOUS session against it.
 * That anon token is what `dnaAuthHeaders()` attaches as the bearer, so the DNA
 * function's `getUser` resolves and identity = the DNA anon user id.
 *
 * IDENTITY (G2 deferred): for now the human IS the DNA anon user id. Linking
 * the anon id to the real Perfume Picks user is DEFERRED — see the TODO in
 * ensureDnaSession. Do NOT add link logic here yet.
 *
 * FLAG GUARDRAIL — this module is FULLY LAZY. Nothing here runs on import: the
 * client is created on first use, and `signInAnonymously` only fires when a
 * caller (gated on the `dna_layer_enabled` flag upstream in client.ts) asks for
 * a token. With the flag OFF there is zero client creation, zero network, zero
 * AsyncStorage touch, zero sign-in.
 *
 * Ported from Pour Picks src/lib/dna/dnaSupabase.ts INCLUDING the keychain
 * refresh-token backup/restore (Percolate commit e725218): expo-secure-store
 * backup-only auth listener, restore-before-mint, race-safe in-flight
 * coalescing. Only the storage keys are renamed to the perfumepicks namespace.
 */

import { DNA_LAYER_ANON_KEY, DNA_LAYER_URL } from './config';

// We deliberately lazy-`require` @supabase/supabase-js + AsyncStorage instead
// of statically importing them: static imports here would force their
// transforms onto every importer (and break the flag-OFF "load is inert"
// guarantee). The same pattern is used in client.ts (getDeviceId).
type DnaSupabaseClient = import('@supabase/supabase-js').SupabaseClient;

/** AsyncStorage key for the DNA anon session — namespaced so it NEVER collides
 *  with the Perfume Picks client's session (which uses the default supabase key). */
const DNA_AUTH_STORAGE_KEY = '@perfumepicks/dna_auth_v1';

/**
 * Keychain (expo-secure-store) key for the REFRESH-TOKEN BACKUP that lets the
 * DNA anon identity survive delete-and-reinstall. AsyncStorage is wiped on
 * uninstall, so without this every reinstall minted a brand-new anon user and
 * orphaned the server-side DNA profile (taste lost). The iOS keychain persists
 * across reinstalls; only the refresh token is backed up (small, rotating —
 * never the whole session, which can exceed SecureStore's 2KB value limit).
 * Restore path: ensureDnaSession → no local session → refreshSession with the
 * backed-up token → SAME anon user. On Android SecureStore does not survive
 * uninstall — behavior there is unchanged (fresh anon user), which is the
 * pre-existing baseline. SecureStore keys allow only [A-Za-z0-9._-], hence no
 * '@'/'/' namespace here.
 */
const DNA_REFRESH_BACKUP_KEY = 'perfumepicks.dna_refresh_v1';

// Lazy expo-secure-store (same jest-safe pattern as supabase-js/AsyncStorage:
// nothing native loads on import; null = unavailable → keychain paths no-op).
type SecureStoreModule = {
  getItemAsync(key: string, options?: object): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: object): Promise<void>;
  deleteItemAsync(key: string, options?: object): Promise<void>;
  AFTER_FIRST_UNLOCK?: unknown;
};
let secureStoreResolved = false;
let cachedSecureStore: SecureStoreModule | null = null;
function getSecureStore(): SecureStoreModule | null {
  if (secureStoreResolved) return cachedSecureStore;
  secureStoreResolved = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cachedSecureStore = require('expo-secure-store') as SecureStoreModule;
  } catch (err) {
    console.warn('[dna/dnaSupabase] expo-secure-store unavailable:', err);
    cachedSecureStore = null;
  }
  return cachedSecureStore;
}

/** Options for keychain writes: readable after first unlock so supabase's
 *  background auto-refresh can rotate the backup without the app foregrounded. */
function secureStoreOptions(ss: SecureStoreModule): object | undefined {
  return ss.AFTER_FIRST_UNLOCK !== undefined
    ? { keychainAccessible: ss.AFTER_FIRST_UNLOCK }
    : undefined;
}

/** Persist the newest refresh token to the keychain. Never throws. Only ever
 *  called with a real token — deletion is EXPLICIT (deleteRefreshBackup), so a
 *  null INITIAL_SESSION at cold start can never wipe a valid backup. */
async function backupRefreshToken(token: string): Promise<void> {
  const ss = getSecureStore();
  if (!ss) return;
  try {
    await ss.setItemAsync(DNA_REFRESH_BACKUP_KEY, token, secureStoreOptions(ss));
  } catch (err) {
    console.warn('[dna/dnaSupabase] refresh-token backup failed:', err);
  }
}

async function readRefreshBackup(): Promise<string | null> {
  const ss = getSecureStore();
  if (!ss) return null;
  try {
    return await ss.getItemAsync(DNA_REFRESH_BACKUP_KEY, secureStoreOptions(ss));
  } catch (err) {
    console.warn('[dna/dnaSupabase] refresh-token backup read failed:', err);
    return null;
  }
}

/** Drop a dead backup (used token, revoked user) so restore isn't retried forever. */
async function deleteRefreshBackup(): Promise<void> {
  const ss = getSecureStore();
  if (!ss) return;
  try {
    await ss.deleteItemAsync(DNA_REFRESH_BACKUP_KEY, secureStoreOptions(ss));
  } catch (err) {
    console.warn('[dna/dnaSupabase] refresh-token backup delete failed:', err);
  }
}

/** Derive the DNA PROJECT ORIGIN from the functions host by stripping a trailing
 *  `/functions/v1` (e.g. https://<ref>.supabase.co/functions/v1 →
 *  https://<ref>.supabase.co). Returns null when the URL isn't configured. */
function dnaProjectOrigin(): string | null {
  if (!DNA_LAYER_URL) return null;
  return DNA_LAYER_URL.replace(/\/$/, '').replace(/\/functions\/v1$/, '');
}

// Memoized client (created once, on first use). null = unconfigured/unavailable.
let cachedClient: DnaSupabaseClient | null = null;
let clientResolved = false;

/**
 * Lazily create the SEPARATE DNA-project supabase client. Returns null when the
 * DNA project isn't configured (missing URL/key) or when the native modules
 * can't load (bare jest checkout) — callers treat null as "no token, keep
 * events queued". Never throws.
 */
function getDnaClient(): DnaSupabaseClient | null {
  if (clientResolved) return cachedClient;
  clientResolved = true;

  const origin = dnaProjectOrigin();
  if (!origin || !DNA_LAYER_ANON_KEY) {
    cachedClient = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient } =
      require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = (
      require('@react-native-async-storage/async-storage') as {
        default: unknown;
      }
    ).default;

    cachedClient = createClient(origin, DNA_LAYER_ANON_KEY, {
      auth: {
        storage: AsyncStorage as never,
        // OWN namespace so the DNA anon session never clobbers Perfume Picks'.
        storageKey: DNA_AUTH_STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });

    // Keep the keychain backup in lockstep with token ROTATION: supabase
    // rotates the refresh token on every refresh (incl. background
    // autoRefreshToken), and a rotated-away token is single-use — a stale
    // backup would fail restore. Backup-only listener: never deletes (a null
    // INITIAL_SESSION at cold start must not wipe a valid backup).
    if (typeof cachedClient.auth.onAuthStateChange === 'function') {
      cachedClient.auth.onAuthStateChange((_event, session) => {
        if (session?.refresh_token) void backupRefreshToken(session.refresh_token);
      });
    }
  } catch (err) {
    console.warn('[dna/dnaSupabase] DNA supabase client unavailable:', err);
    cachedClient = null;
  }
  return cachedClient;
}

// In-flight sign-in promise — shared across concurrent ensureDnaSession()
// callers so a cold-start race mints EXACTLY ONE anon user (the single most
// important guarantee here: a new anon user per race fragments one human into
// many orphan profiles).
let inFlightSignIn: Promise<string | null> | null = null;

/** Mint a fresh anonymous session and return its access_token (or null). */
async function signInAnonymouslyOnce(client: DnaSupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await client.auth.signInAnonymously();
    if (error) {
      console.warn('[dna/dnaSupabase] anonymous sign-in failed:', error.message);
      return null;
    }
    // Belt-and-braces alongside the onAuthStateChange listener: the fresh anon
    // identity must be keychain-backed even if the listener isn't available.
    if (data.session?.refresh_token) void backupRefreshToken(data.session.refresh_token);
    return data.session?.access_token ?? null;
  } catch (err) {
    console.warn('[dna/dnaSupabase] anonymous sign-in threw:', err);
    return null;
  }
}

/**
 * No local session (fresh install / wiped AsyncStorage): try to RESTORE the
 * previous anon identity from the keychain refresh-token backup before minting
 * a new user. Restore success = the SAME anon user (and its server-side DNA
 * profile) survives delete-and-reinstall. A dead backup (rotated-away, revoked,
 * expired) is deleted so it is never retried, then falls through to a fresh
 * anonymous sign-in — the pre-existing behavior.
 */
async function restoreOrSignInOnce(client: DnaSupabaseClient): Promise<string | null> {
  const backed = await readRefreshBackup();
  if (backed) {
    try {
      const { data, error } = await client.auth.refreshSession({ refresh_token: backed });
      if (!error && data.session?.access_token) {
        if (data.session.refresh_token) void backupRefreshToken(data.session.refresh_token);
        return data.session.access_token;
      }
      console.warn(
        '[dna/dnaSupabase] keychain restore failed; minting fresh anon user:',
        error?.message
      );
    } catch (err) {
      console.warn('[dna/dnaSupabase] keychain restore threw; minting fresh anon user:', err);
    }
    await deleteRefreshBackup();
  }
  return signInAnonymouslyOnce(client);
}

/**
 * Ensure a DNA-project anonymous session and return its access_token.
 *
 *  - Returns the current DNA access_token when a valid session already exists.
 *  - Otherwise signs in anonymously ONCE (persisted via persistSession) and
 *    returns the new token.
 *  - Concurrency-safe: two calls racing before the first sign-in resolves await
 *    the SAME in-flight promise, so only one anon user is ever minted.
 *  - Returns null (never throws) when the DNA client is unconfigured or sign-in
 *    fails — callers keep their events queued.
 *
 * TODO(G2 — DEFERRED): once identity re-key lands, link this DNA anon user id
 * to the real Perfume Picks user here (Perfume has no merge-guest either; the
 * G2 indirection keeps the later fix a single UPDATE). Intentionally a NO-OP
 * today; identity = the DNA anon user id. Do NOT add placeholder link logic.
 */
export async function ensureDnaSession(): Promise<string | null> {
  const client = getDnaClient();
  if (!client) return null;

  try {
    const { data } = await client.auth.getSession();
    const existing = data.session?.access_token;
    if (existing) return existing;
  } catch (err) {
    console.warn('[dna/dnaSupabase] getSession failed; will sign in:', err);
  }

  // Coalesce concurrent restore/sign-ins onto a single in-flight promise
  // (keychain restore first — reinstall recovery — then fresh anon sign-in).
  if (!inFlightSignIn) {
    inFlightSignIn = restoreOrSignInOnce(client).finally(() => {
      inFlightSignIn = null;
    });
  }
  return inFlightSignIn;
}

/**
 * Force-refresh the DNA session and return the new access_token. If the refresh
 * fails (expired/missing refresh token), fall back to a fresh anonymous sign-in.
 * Returns the new token, or null when unconfigured / both paths fail. Never
 * throws. Used by the 401 retry path in transport.
 */
export async function refreshDnaSession(): Promise<string | null> {
  const client = getDnaClient();
  if (!client) return null;

  try {
    const { data, error } = await client.auth.refreshSession();
    if (!error && data.session?.access_token) return data.session.access_token;
    if (error)
      console.warn('[dna/dnaSupabase] refreshSession failed; re-signing in:', error.message);
  } catch (err) {
    console.warn('[dna/dnaSupabase] refreshSession threw; re-signing in:', err);
  }

  // Refresh failed → keychain restore, then fresh anon sign-in (coalesced like
  // ensure). The stored-session token that just failed is usually the same
  // lineage as the backup, so this typically falls through to a fresh user —
  // but a healthy backup (e.g. AsyncStorage corrupted, keychain intact) wins.
  if (!inFlightSignIn) {
    inFlightSignIn = restoreOrSignInOnce(client).finally(() => {
      inFlightSignIn = null;
    });
  }
  return inFlightSignIn;
}

/** Test-only: drop the memoized client + in-flight sign-in promise. */
export function _resetDnaSupabaseForTest(): void {
  cachedClient = null;
  clientResolved = false;
  inFlightSignIn = null;
  secureStoreResolved = false;
  cachedSecureStore = null;
}
