import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { Alert } from '@/src/components/ui/StyledAlert';
import type { PurchasesPackage, PurchasesOffering } from 'react-native-purchases';
import {
  initRevenueCat,
  getOfferings,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
  isProActive,
} from '@/src/lib/revenuecat';
import { useProStore } from '@/src/stores/useProStore';

/**
 * Structured purchase outcome so callers can distinguish a user cancel from a
 * real StoreKit failure — previously all non-success paths collapsed to `false`,
 * which made pro_purchase_failed un-actionable. Ported from pour-picks PR #5.
 */
export type BuyResult =
  | { outcome: 'purchased' }
  | { outcome: 'cancelled' }
  | { outcome: 'not_entitled' }
  | { outcome: 'error'; code?: string; message?: string };

export function useRevenueCat() {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const { activate, deactivate } = useProStore();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      await initRevenueCat();

      // Check current entitlements — sync local Pro state with server truth
      const info = await getCustomerInfo();
      if (info) {
        if (isProActive(info)) activate();
        else deactivate();
      }

      // Load offerings
      const current = await getOfferings();
      setOffering(current);
    } catch (e) {
      // RevenueCat not available (Expo Go / simulator without StoreKit config)
      if (__DEV__) {
        console.log('[RevenueCat] Not available in this environment:', (e as Error).message);
      }
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [activate, deactivate]);

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthlyPackage = offering?.availablePackages.find(
    (p) => p.packageType === 'MONTHLY' || p.product.identifier.includes('monthly')
  ) ?? null;

  const yearlyPackage = offering?.availablePackages.find(
    (p) => p.packageType === 'ANNUAL' || p.product.identifier.includes('yearly')
  ) ?? null;

  const buy = useCallback(async (pkg: PurchasesPackage): Promise<BuyResult> => {
    setPurchasing(true);
    try {
      const { isPro } = await purchasePackage(pkg);
      if (isPro) {
        activate();
        return { outcome: 'purchased' };
      }
      // Purchase returned without throwing but no active entitlement —
      // e.g. a pending/deferred (Ask to Buy) transaction.
      return { outcome: 'not_entitled' };
    } catch (e: any) {
      if (e.userCancelled) {
        // User cancelled — a choice, not an error.
        return { outcome: 'cancelled' };
      }
      Alert.alert('Purchase Error', e?.message ?? 'Something went wrong');
      return { outcome: 'error', code: e?.readableErrorCode ?? e?.code, message: e?.message };
    } finally {
      setPurchasing(false);
    }
  }, [activate]);

  const restore = useCallback(async () => {
    setPurchasing(true);
    try {
      const { isPro } = await restorePurchases();
      if (isPro) {
        activate();
        Alert.alert('Restored', 'Your Pro subscription has been restored.');
        return true;
      } else {
        Alert.alert('No Purchase Found', 'We couldn\'t find an active Pro subscription for this account.');
        return false;
      }
    } catch (e: any) {
      Alert.alert('Restore Error', e?.message ?? 'Something went wrong');
      return false;
    } finally {
      setPurchasing(false);
    }
  }, [activate]);

  return {
    offering,
    monthlyPackage,
    yearlyPackage,
    loading,
    loadError,
    retry: load,
    purchasing,
    buy,
    restore,
  };
}
