/**
 * RevenueCat configuration and helpers for Perfume Picks Pro subscriptions.
 *
 * Setup checklist (do once in RevenueCat dashboard):
 * 1. Create a project at https://app.revenuecat.com
 * 2. Add an Apple App Store app with bundle ID com.bobguillow.perfumepicks
 * 3. Create Products in App Store Connect, then mirror in RevenueCat:
 *    - perfumepicks_pro_monthly  → $2.99/month auto-renewing (locked, do not iterate)
 *    - perfumepicks_pro_yearly   → $24.99/year auto-renewing (locked, do not iterate)
 *    Both ship with a 7-day free trial.
 * 4. Create an Entitlement called "pro"
 * 5. Attach both products to the "pro" entitlement
 * 6. Create an Offering called "default" with both products
 * 7. Set EXPO_PUBLIC_REVENUECAT_APPLE_KEY in eas.json
 */
import { Platform } from 'react-native';
import { captureException } from '@/src/lib/observability/errors';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

// ── API Keys ────────────────────────────────────────────────────────────────
//
// EXPO_PUBLIC_* is INLINED INTO THE JS BUNDLE AT EXPORT TIME, so the value here
// is whichever env the bundler saw — NOT whatever eas.json says. That gap shipped
// a dead paywall: eas.json carries the real key (so native BUILDS were always
// fine), but `eas update` bundles from .env.local, which still held the
// `your-revenuecat-apple-key` placeholder from setup. Every OTA therefore
// configured RevenueCat with a bogus key, configure() threw, and no one could
// buy Pro — silently, because the error was swallowed as "probably Expo Go".
//
// If you add a key here, add it in BOTH eas.json AND .env.local, or builds and
// updates will disagree again. isRealKey() below is the tripwire.
const REVENUECAT_APPLE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY ?? '';
const REVENUECAT_GOOGLE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY ?? '';

/**
 * A key that is present but obviously not a real one — the placeholder from the
 * setup docs, or anything not in RevenueCat's documented key format (Apple keys
 * start `appl_`, Google `goog_`). Distinguishes "misconfigured" from "absent",
 * which the old code could not: both looked like an empty string to `!apiKey`.
 */
function isRealKey(key: string, platform: 'ios' | 'android'): boolean {
  if (!key) return false;
  if (key.startsWith('your-')) return false; // setup placeholder
  return key.startsWith(platform === 'ios' ? 'appl_' : 'goog_');
}

const ENTITLEMENT_ID = 'pro';

// ── Product IDs (must match App Store Connect / Google Play Console) ────────
export const PRODUCT_IDS = {
  monthly: 'perfumepicks_pro_monthly',
  yearly: 'perfumepicks_pro_yearly',
} as const;

// ── Init ─────────────────────────────────────────────────────────────────────

let initialized = false;

export async function initRevenueCat(): Promise<void> {
  if (initialized) return;

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const apiKey = platform === 'ios' ? REVENUECAT_APPLE_KEY : REVENUECAT_GOOGLE_KEY;

  // A bad key in a shipped build is NOT the same as running in Expo Go, and
  // treating them the same is what hid a dead paywall in production. Report it.
  if (!isRealKey(apiKey, platform)) {
    if (__DEV__) {
      console.warn(
        `[RevenueCat] NOT CONFIGURED — key is ${apiKey ? `invalid ("${apiKey.slice(0, 12)}…")` : 'missing'}. ` +
          'Nobody can purchase Pro. Check EXPO_PUBLIC_REVENUECAT_APPLE_KEY in .env.local AND eas.json.',
      );
    } else {
      // Production: this is a revenue outage. Make it visible in Sentry rather
      // than dying quietly — the whole point of the incident that added this.
      captureException(new Error('RevenueCat API key missing or invalid in a production bundle'), {
        area: 'revenuecat',
        reason: apiKey ? 'invalid_key' : 'missing_key',
        key_prefix: apiKey.slice(0, 12), // never the whole key
        platform,
      });
    }
    return;
  }

  try {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    await Purchases.configure({ apiKey });
    initialized = true;
  } catch (e) {
    // Reaching here with a well-formed key means the native module is missing
    // (Expo Go / simulator) — genuinely expected, and genuinely not actionable.
    if (__DEV__) {
      console.log('[RevenueCat] Skipped — native module not available');
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function isProActive(info: CustomerInfo): boolean {
  return typeof info.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!initialized) return null;
  return Purchases.getCustomerInfo();
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
  if (!initialized) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<{ isPro: boolean }> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return { isPro: isProActive(customerInfo) };
}

export async function restorePurchases(): Promise<{ isPro: boolean }> {
  const info = await Purchases.restorePurchases();
  return { isPro: isProActive(info) };
}

/**
 * Identify user with RevenueCat (call after auth).
 * This links purchases to the Supabase user ID so they persist across devices.
 */
export async function identifyUser(userId: string): Promise<void> {
  await Purchases.logIn(userId);
}

export async function logoutUser(): Promise<void> {
  await Purchases.logOut();
}
