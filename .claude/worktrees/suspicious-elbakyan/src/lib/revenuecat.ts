/**
 * RevenueCat configuration and helpers for Stick Picks Pro subscriptions.
 *
 * Setup checklist (do once in RevenueCat dashboard):
 * 1. Create a project at https://app.revenuecat.com
 * 2. Add an Apple App Store app with your bundle ID (com.stickpicks.app)
 * 3. Create Products:
 *    - sp_pro_monthly  → $4.99/month auto-renewing subscription
 *    - sp_pro_yearly   → $39.99/year auto-renewing subscription
 * 4. Create an Entitlement called "pro"
 * 5. Attach both products to the "pro" entitlement
 * 6. Create an Offering called "default" with both products
 * 7. Copy your Apple API key below
 */
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

// ── API Keys ────────────────────────────────────────────────────────────────
const REVENUECAT_APPLE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY ?? '';
const REVENUECAT_GOOGLE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY ?? '';

const ENTITLEMENT_ID = 'pro';

// ── Product IDs (must match App Store Connect / Google Play Console) ────────
export const PRODUCT_IDS = {
  monthly: 'sp_pro_monthly',
  yearly: 'sp_pro_yearly',
} as const;

// ── Init ─────────────────────────────────────────────────────────────────────

let initialized = false;

export async function initRevenueCat(): Promise<void> {
  if (initialized) return;

  try {
    const apiKey = Platform.OS === 'ios' ? REVENUECAT_APPLE_KEY : REVENUECAT_GOOGLE_KEY;

    // Skip init if keys haven't been configured yet
    if (!apiKey) {
      if (__DEV__) {
        console.log('[RevenueCat] Skipped — API keys not configured yet');
      }
      return;
    }

    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    await Purchases.configure({ apiKey });
    initialized = true;
  } catch (e) {
    // Native module not available (Expo Go / simulator) — skip silently
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
